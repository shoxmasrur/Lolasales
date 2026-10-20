import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { useAuth, useCan } from '@/store/auth';
import type { Permission, PermissionGroup, Role, User } from '@/lib/types';
import { dateUz, initials, relative } from '@/lib/format';
import { Avatar, EmptyState, ErrorNote, Spinner, Toggle } from '@/components/ui';

type Tab = 'users' | 'roles' | 'tokens';

export default function UsersPage() {
  const [tab, setTab] = useState<Tab>('users');
  const canManageRoles = useCan('roles.manage');
  const canManageUsers = useCan('users.manage');

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="border-b border-ink-800 px-4 py-3 md:px-6 md:py-4">
        <div className="hidden md:block">
          <h1 className="text-base font-semibold">Foydalanuvchilar va rollar</h1>
          <p className="mt-0.5 text-xs text-ink-500">
            Kim tizimga kira oladi va qaysi amallarni bajara oladi
          </p>
        </div>
        <div className="mt-3 flex gap-1">
          {(
            [
              ['users', 'Foydalanuvchilar'],
              ['roles', 'Rollar'],
              ['tokens', 'API kalitlar'],
            ] as Array<[Tab, string]>
          ).map(
            ([key, label]) =>
              (key === 'roles' && !canManageRoles) || (key === 'tokens' && !canManageUsers) ? null : (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={clsx(
                    'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                    tab === key ? 'bg-ink-800 text-ink-100' : 'text-ink-500 hover:bg-ink-800/50',
                  )}
                >
                  {label}
                </button>
              ),
          )}
        </div>
      </header>

      {tab === 'users' ? <UsersTab /> : tab === 'roles' ? <RolesTab /> : <TokensTab />}
    </div>
  );
}

// ─── API kalitlar (MCP / boshqa agentlar) ─────────────────────────────────

interface ApiTokenRow {
  id: string;
  name: string;
  tokenPrefix: string;
  userEmail: string;
  roleName: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

function TokensTab() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', userId: '' });
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const tokensQuery = useQuery({
    queryKey: ['api-tokens'],
    queryFn: () => api.get<{ items: ApiTokenRow[] }>('/users/tokens'),
  });

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<{ items: User[] }>('/users'),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post<{ plainKey: string }>('/users/tokens', form),
    onSuccess: (data) => {
      setFreshKey(data.plainKey);
      setForm({ name: '', userId: '' });
      void queryClient.invalidateQueries({ queryKey: ['api-tokens'] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/tokens/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-tokens'] }),
  });

  const tokens = tokensQuery.data?.items ?? [];
  const users = usersQuery.data?.items ?? [];

  return (
    <div className="space-y-5 p-4 md:p-6">
      <p className="rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2 text-xs leading-relaxed text-ink-400">
        API kalit — boshqa AI agentlaringiz (Usmon_ai, Bozorvoy…) MCP orqali tizimga ulanishi uchun.
        Kalit <strong className="text-ink-200">foydalanuvchiga</strong>, demak uning
        <strong className="text-ink-200"> roliga</strong> bog'lanadi: agent faqat o'sha rol
        ruxsat bergan narsani qila oladi va har bir amali auditga tushadi.
        <br />
        Tavsiya: kalit uchun alohida foydalanuvchi yarating va unga{' '}
        <span className="chip bg-ink-800 text-ink-300">MCP agent</span> rolini bering.
      </p>

      {freshKey ? (
        <div className="card border-emerald-500/40 bg-emerald-500/5">
          <p className="text-sm font-medium text-emerald-300">Kalit yaratildi</p>
          <p className="mt-1 text-xs text-ink-400">
            Bu kalit <strong className="text-ink-200">faqat hozir</strong> ko'rsatiladi — bazada
            uning xeshi saqlanadi. Nusxalab, xavfsiz joyga qo'ying.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-ink-800 bg-ink-950 px-3 py-2 font-mono text-xs text-emerald-200">
              {freshKey}
            </code>
            <button
              type="button"
              className="btn-ghost shrink-0"
              onClick={() => {
                void navigator.clipboard.writeText(freshKey);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? 'Nusxalandi' : 'Nusxalash'}
            </button>
            <button type="button" className="btn-ghost shrink-0" onClick={() => setFreshKey(null)}>
              Yopish
            </button>
          </div>
        </div>
      ) : null}

      <div className="card space-y-4">
        <h2 className="text-sm font-medium">Yangi kalit</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Nomi</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Usmon_ai MCP"
            />
          </div>
          <div>
            <label className="label">Qaysi foydalanuvchi nomidan</label>
            <select
              className="input"
              value={form.userId}
              onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}
            >
              <option value="">— tanlang —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} — {u.role.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {createMutation.error ? <ErrorNote error={createMutation.error} /> : null}

        <button
          type="button"
          className="btn-primary"
          disabled={createMutation.isPending || form.name.length < 2 || !form.userId}
          onClick={() => createMutation.mutate()}
        >
          {createMutation.isPending ? <Spinner /> : null}
          Kalit yaratish
        </button>
      </div>

      {revokeMutation.error ? <ErrorNote error={revokeMutation.error} /> : null}

      {tokensQuery.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : tokens.length === 0 ? (
        <EmptyState title="Kalit yo'q" hint="MCP orqali ulanish uchun kalit yarating." icon="⚿" />
      ) : (
        <div className="table-wrap rounded-xl border border-ink-800">
          <table className="table-base">
            <thead>
              <tr>
                <th>Nomi</th>
                <th>Kalit</th>
                <th>Kim nomidan</th>
                <th>Oxirgi ishlatilgan</th>
                <th className="text-right">Amal</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.id} className={t.revokedAt ? 'opacity-45' : ''}>
                  <td className="font-medium text-ink-100">{t.name}</td>
                  <td className="font-mono text-xs text-ink-500">{t.tokenPrefix}…</td>
                  <td className="text-xs">
                    <span className="text-ink-300">{t.userEmail}</span>
                    <span className="ml-2 chip bg-ink-800 text-ink-400">{t.roleName}</span>
                  </td>
                  <td className="text-xs text-ink-500">
                    {t.lastUsedAt ? relative(t.lastUsedAt) : 'hech qachon'}
                  </td>
                  <td className="text-right">
                    {t.revokedAt ? (
                      <span className="chip bg-red-500/15 text-red-300">bekor qilingan</span>
                    ) : (
                      <button
                        type="button"
                        className="btn-ghost !py-1 text-xs text-red-300"
                        onClick={() => {
                          if (confirm(`"${t.name}" kaliti bekor qilinsinmi? Uni ishlatayotgan agent to'xtaydi.`)) {
                            revokeMutation.mutate(t.id);
                          }
                        }}
                      >
                        Bekor qilish
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Foydalanuvchilar ──────────────────────────────────────────────────────

function UsersTab() {
  const queryClient = useQueryClient();
  const me = useAuth((s) => s.user);
  const canManage = useCan('users.manage');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: '', fullName: '', password: '', roleId: '' });
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<{ items: User[] }>('/users'),
  });

  const rolesQuery = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<{ items: Role[] }>('/users/roles'),
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['users'] });
    void queryClient.invalidateQueries({ queryKey: ['roles'] });
  };

  const createMutation = useMutation({
    mutationFn: () => api.post('/users', form),
    onSuccess: () => {
      setShowForm(false);
      setForm({ email: '', fullName: '', password: '', roleId: '' });
      invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; patch: Record<string, unknown> }) =>
      api.patch(`/users/${payload.id}`, payload.patch),
    onSuccess: () => {
      setResetFor(null);
      setNewPassword('');
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: invalidate,
  });

  /** Ketma-ket xato parollardan keyin bloklangan hisobni ochish. */
  const unlockMutation = useMutation({
    mutationFn: (id: string) => api.post(`/users/${id}/unlock`),
    onSuccess: invalidate,
  });

  const roles = rolesQuery.data?.items ?? [];
  const users = usersQuery.data?.items ?? [];

  return (
    <div className="space-y-5 p-4 md:p-6">
      {canManage ? (
        <div className="flex justify-end">
          <button type="button" className="btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Yopish' : 'Foydalanuvchi qo\'shish'}
          </button>
        </div>
      ) : null}

      {showForm ? (
        <div className="card space-y-4">
          <h2 className="text-sm font-medium">Yangi foydalanuvchi</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">To'liq ism</label>
              <input
                className="input"
                value={form.fullName}
                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                placeholder="Nodira Xoshimjonova"
              />
            </div>
            <div>
              <label className="label">Email</label>
              <input
                className="input"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="nodira@lolasales.uz"
              />
            </div>
            <div>
              <label className="label">Boshlang'ich parol</label>
              <input
                className="input"
                type="text"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="kamida 8 belgi"
              />
            </div>
            <div>
              <label className="label">Rol</label>
              <select
                className="input"
                value={form.roleId}
                onChange={(e) => setForm((f) => ({ ...f, roleId: e.target.value }))}
              >
                <option value="">— tanlang —</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {createMutation.error ? <ErrorNote error={createMutation.error} /> : null}

          <button
            type="button"
            className="btn-primary"
            disabled={
              createMutation.isPending ||
              !form.email ||
              !form.fullName ||
              form.password.length < 8 ||
              !form.roleId
            }
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? <Spinner /> : null}
            Qo'shish
          </button>
        </div>
      ) : null}

      {updateMutation.error ? <ErrorNote error={updateMutation.error} /> : null}
      {unlockMutation.error ? <ErrorNote error={unlockMutation.error} /> : null}
      {deleteMutation.error ? <ErrorNote error={deleteMutation.error} /> : null}

      {usersQuery.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : users.length === 0 ? (
        <EmptyState title="Foydalanuvchi yo'q" />
      ) : (
        <div className="table-wrap rounded-xl border border-ink-800">
          <table className="w-full text-sm">
            <thead className="bg-ink-900/60 text-[11px] uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-3 py-2.5 text-left font-medium md:px-4">Foydalanuvchi</th>
                <th className="px-2 py-2.5 text-left font-medium md:px-3">Rol</th>
                <th className="px-2 py-2.5 text-left font-medium md:px-3">Holat</th>
                <th className="px-3 py-2.5 text-right font-medium md:px-4">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-ink-800/60">
                  <td className="px-3 py-2.5 md:px-4">
                    <div className="flex items-center gap-2.5">
                      <Avatar text={initials(u.fullName)} size={30} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink-100">
                          {u.fullName}
                          {u.id === me?.id ? (
                            <span className="ml-2 text-[10px] text-ink-500">(siz)</span>
                          ) : null}
                        </p>
                        <p className="truncate text-[11px] text-ink-500">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 md:px-3">
                    {canManage && u.id !== me?.id ? (
                      <select
                        className="input !py-1 text-xs max-md:min-h-[40px]"
                        value={u.roleId}
                        onChange={(e) =>
                          updateMutation.mutate({ id: u.id, patch: { roleId: e.target.value } })
                        }
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="chip bg-ink-800 text-ink-300">{u.role.name}</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 md:px-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {canManage && u.id !== me?.id ? (
                        <Toggle
                          checked={u.isActive}
                          onChange={(v) => updateMutation.mutate({ id: u.id, patch: { isActive: v } })}
                        />
                      ) : (
                        <span
                          className={
                            u.isActive
                              ? 'chip bg-emerald-500/15 text-emerald-300'
                              : 'chip bg-red-500/15 text-red-300'
                          }
                        >
                          {u.isActive ? 'Faol' : 'O\'chirilgan'}
                        </span>
                      )}

                      {/* Blok — o'chirilganlikdan alohida holat: xodim
                          parolini ketma-ket xato tergan. */}
                      {u.lockedAt ? (
                        <span
                          className="chip bg-amber-500/15 text-amber-300"
                          title={`Bloklangan: ${relative(u.lockedAt)}`}
                        >
                          Bloklangan
                        </span>
                      ) : u.failedLoginAttempts > 0 ? (
                        <span
                          className="chip bg-ink-800 text-ink-400"
                          title="Ketma-ket xato urinishlar — muvaffaqiyatli kirishda nolga tushadi"
                        >
                          {u.failedLoginAttempts} xato urinish
                        </span>
                      ) : null}

                      {canManage && (u.lockedAt || u.failedLoginAttempts > 0) ? (
                        <button
                          type="button"
                          className="btn-ghost !py-0.5 text-[11px] text-amber-300"
                          disabled={unlockMutation.isPending}
                          onClick={() => unlockMutation.mutate(u.id)}
                          title="Hisobni ochadi va urinishlar hisoblagichini nolga tushiradi"
                        >
                          Blokdan chiqarish
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right md:px-4">
                    {canManage ? (
                      resetFor === u.id ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <input
                            className="input !w-40 !py-1 text-xs"
                            placeholder="yangi parol"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                          />
                          <button
                            type="button"
                            className="btn-primary !py-1 text-xs"
                            disabled={newPassword.length < 8}
                            onClick={() =>
                              updateMutation.mutate({ id: u.id, patch: { password: newPassword } })
                            }
                          >
                            Saqlash
                          </button>
                          <button
                            type="button"
                            className="btn-ghost !py-1 text-xs"
                            onClick={() => setResetFor(null)}
                          >
                            Bekor
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            className="btn-ghost !py-1 text-xs"
                            onClick={() => {
                              setResetFor(u.id);
                              setNewPassword('');
                            }}
                          >
                            Parol
                          </button>
                          {u.id !== me?.id ? (
                            <button
                              type="button"
                              className="btn-ghost !py-1 text-xs text-red-300"
                              onClick={() => {
                                if (confirm(`${u.fullName} o'chirilsinmi?`)) deleteMutation.mutate(u.id);
                              }}
                            >
                              O'chirish
                            </button>
                          ) : null}
                        </div>
                      )
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Rollar ────────────────────────────────────────────────────────────────

function RolesTab() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Role | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<{ key: string; name: string; description: string; permissions: Permission[] }>({
    key: '',
    name: '',
    description: '',
    permissions: [],
  });

  const rolesQuery = useQuery({
    queryKey: ['roles'],
    queryFn: () => api.get<{ items: Role[] }>('/users/roles'),
  });

  const permissionsQuery = useQuery({
    queryKey: ['permissions'],
    queryFn: () => api.get<{ groups: PermissionGroup[] }>('/users/permissions'),
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['roles'] });
    void queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      editing
        ? api.patch(`/users/roles/${editing.id}`, {
            name: draft.name,
            description: draft.description || null,
            permissions: draft.permissions,
          })
        : api.post('/users/roles', {
            key: draft.key,
            name: draft.name,
            description: draft.description || null,
            permissions: draft.permissions,
          }),
    onSuccess: () => {
      setEditing(null);
      setCreating(false);
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/roles/${id}`),
    onSuccess: invalidate,
  });

  const startEdit = (role: Role): void => {
    setEditing(role);
    setCreating(false);
    setDraft({
      key: role.key,
      name: role.name,
      description: role.description ?? '',
      permissions: [...role.permissions],
    });
  };

  const startCreate = (): void => {
    setCreating(true);
    setEditing(null);
    setDraft({ key: '', name: '', description: '', permissions: ['dashboard.view'] });
  };

  const toggle = (permission: Permission): void =>
    setDraft((d) => ({
      ...d,
      permissions: d.permissions.includes(permission)
        ? d.permissions.filter((p) => p !== permission)
        : [...d.permissions, permission],
    }));

  const toggleGroup = (group: PermissionGroup): void => {
    const keys = group.items.map((i) => i.key);
    const allOn = keys.every((k) => draft.permissions.includes(k));
    setDraft((d) => ({
      ...d,
      permissions: allOn
        ? d.permissions.filter((p) => !keys.includes(p))
        : [...new Set([...d.permissions, ...keys])],
    }));
  };

  const groups = permissionsQuery.data?.groups ?? [];
  const roles = rolesQuery.data?.items ?? [];
  const isAdminRole = editing?.key === 'admin';
  const editorOpen = creating || Boolean(editing);

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex justify-end">
        <button type="button" className="btn-primary" onClick={startCreate}>
          Yangi rol
        </button>
      </div>

      {editorOpen ? (
        <div className="card space-y-4">
          <h2 className="text-sm font-medium">
            {creating ? 'Yangi rol' : `"${editing?.name}" rolini tahrirlash`}
          </h2>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Nom</label>
              <input
                className="input"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                placeholder="Sotuv menejeri"
              />
            </div>
            {creating ? (
              <div>
                <label className="label">Kalit (lotin, kichik)</label>
                <input
                  className="input"
                  value={draft.key}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, key: e.target.value.toLowerCase().replace(/\s+/g, '_') }))
                  }
                  placeholder="sotuv_menejeri"
                />
              </div>
            ) : null}
            <div className={creating ? '' : 'sm:col-span-2'}>
              <label className="label">Izoh</label>
              <input
                className="input"
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                placeholder="Nima ish qiladi"
              />
            </div>
          </div>

          {isAdminRole ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Administrator rolining ruxsatlari o'zgartirilmaydi — aks holda tizimga kirish
              imkoniyatini butunlay yo'qotib qo'yish xavfi bor. Nomi va izohini tahrirlash mumkin.
            </p>
          ) : null}

          <div className="space-y-3">
            {groups.map((group) => {
              const keys = group.items.map((i) => i.key);
              const allOn = keys.every((k) => draft.permissions.includes(k));
              const someOn = keys.some((k) => draft.permissions.includes(k));

              return (
                <div key={group.section} className="rounded-lg border border-ink-800 bg-ink-950/40 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-medium text-ink-200">{group.label}</p>
                    <button
                      type="button"
                      disabled={isAdminRole}
                      onClick={() => toggleGroup(group)}
                      className="text-[11px] text-brand-400 hover:underline disabled:opacity-40"
                    >
                      {allOn ? 'hammasini olib tashlash' : someOn ? 'hammasini belgilash' : 'hammasini belgilash'}
                    </button>
                  </div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {group.items.map((item) => (
                      <label
                        key={item.key}
                        className={clsx(
                          'flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 transition-colors',
                          draft.permissions.includes(item.key) ? 'bg-brand-500/10' : 'hover:bg-ink-800/50',
                          isAdminRole && 'cursor-not-allowed opacity-70',
                        )}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          disabled={isAdminRole}
                          checked={draft.permissions.includes(item.key)}
                          onChange={() => toggle(item.key)}
                        />
                        <span className="min-w-0">
                          <span className="block text-xs text-ink-200">{item.label}</span>
                          <span className="block text-[10px] text-ink-500">{item.hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {saveMutation.error ? <ErrorNote error={saveMutation.error} /> : null}

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={saveMutation.isPending || !draft.name || (creating && !draft.key)}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? <Spinner /> : null}
              Saqlash
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setEditing(null);
                setCreating(false);
              }}
            >
              Bekor qilish
            </button>
            <span className="ml-auto text-xs text-ink-500">
              {draft.permissions.length} ta ruxsat tanlangan
            </span>
          </div>
        </div>
      ) : null}

      {deleteMutation.error ? <ErrorNote error={deleteMutation.error} /> : null}

      {rolesQuery.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-2">
          {roles.map((role) => (
            <div key={role.id} className="card flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium">{role.name}</h3>
                  <span className="chip bg-ink-800 font-mono text-ink-400">{role.key}</span>
                  {role.isSystem ? (
                    <span className="chip bg-sky-500/15 text-sky-300">tizim</span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-[11px] text-ink-500">
                  {role.description ?? '—'} · {role.permissions.length} ta ruxsat ·{' '}
                  {role.userCount ?? 0} ta foydalanuvchi · {dateUz(role.createdAt)}
                </p>
              </div>
              <div className="flex gap-1.5">
                <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => startEdit(role)}>
                  Tahrirlash
                </button>
                {!role.isSystem ? (
                  <button
                    type="button"
                    className="btn-ghost !py-1 text-xs text-red-300"
                    onClick={() => {
                      if (confirm(`"${role.name}" roli o'chirilsinmi?`)) deleteMutation.mutate(role.id);
                    }}
                  >
                    O'chirish
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
