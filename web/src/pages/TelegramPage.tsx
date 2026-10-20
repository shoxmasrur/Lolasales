import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { useCan } from '@/store/auth';
import type {
  AccountCheckReport,
  AccountDistribution,
  BulkCheckProgress,
  LlmModel,
  SpamStatus,
  TelegramAccount,
} from '@/lib/types';
import { relative } from '@/lib/format';
import { EmptyState, ErrorNote, Spinner, Toggle } from '@/components/ui';
import { QrLoginDialog } from '@/components/QrLoginDialog';
import { AccountProxyForm } from '@/components/AccountProxyForm';
import { AccountRestrictions } from '@/components/AccountRestrictions';

const STATUS_LABEL: Record<TelegramAccount['status'], string> = {
  logged_out: 'Kirilmagan',
  awaiting_code: 'Kod kutilmoqda',
  awaiting_password: 'Parol kutilmoqda',
  awaiting_qr: 'QR kutilmoqda',
  connected: 'Ulangan',
  error: 'Xato',
  banned: 'Bloklangan',
};

const STATUS_COLOR: Record<TelegramAccount['status'], string> = {
  logged_out: 'bg-ink-800 text-ink-400',
  awaiting_code: 'bg-amber-500/15 text-amber-300',
  awaiting_password: 'bg-amber-500/15 text-amber-300',
  awaiting_qr: 'bg-amber-500/15 text-amber-300',
  connected: 'bg-emerald-500/15 text-emerald-300',
  error: 'bg-red-500/15 text-red-300',
  banned: 'bg-red-500/25 text-red-200',
};

const SPAM_LABEL: Record<SpamStatus, string> = {
  unknown: 'Spam: tekshirilmagan',
  clean: 'Spam: toza',
  limited: 'Spam: CHEKLANGAN',
  banned: 'Spam: BLOKLANGAN',
  check_failed: 'Spam: tekshirib bo\'lmadi',
};

const SPAM_COLOR: Record<SpamStatus, string> = {
  unknown: 'bg-ink-800 text-ink-400',
  clean: 'bg-emerald-500/15 text-emerald-300',
  limited: 'bg-red-500/20 text-red-300',
  banned: 'bg-red-500/30 text-red-200',
  check_failed: 'bg-amber-500/15 text-amber-300',
};

export default function TelegramPage() {
  const queryClient = useQueryClient();
  const admin = useCan('telegram.manage');
  // Model tanlagichi uchun ro'yxat kerak, lekin `GET /llm/models`
  // `settings.edit` talab qiladi (`llmRoutes.ts`) — `telegram.manage`dan
  // ALOHIDA ruxsat. Shu sabab tanlagich faqat ikkalasi ham bor operatorga
  // ko'rinadi, aks holda 403 bilan yiqilardi.
  const canPickModel = useCan('settings.edit');

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ label: '', phone: '', apiId: '', apiHash: '', personaName: '' });
  const [loginState, setLoginState] = useState<
    Record<string, { phoneCodeHash?: string; code: string; password: string; step: 'code' | 'password' }>
  >({});
  /** QR oynasi ochiq akkaunt. */
  const [qrFor, setQrFor] = useState<string | null>(null);

  const accountsQuery = useQuery({
    queryKey: ['telegram-accounts'],
    queryFn: () =>
      api.get<{ items: TelegramAccount[]; defaultPersonaName: string }>('/telegram/accounts'),
    refetchInterval: 10_000,
  });

  // QR yakuni (ulandi / 2FA) dialogning o'zida aniqlanadi: oyna ochilishidan
  // oldingi eski holat (masalan, `awaiting_password`) uni yopib yubormasin.
  const qrAccount = accountsQuery.data?.items.find((a) => a.id === qrFor) ?? null;

  const createMutation = useMutation({
    mutationFn: () =>
      api.post('/telegram/accounts', {
        label: form.label,
        phone: form.phone,
        apiId: form.apiId ? Number(form.apiId) : undefined,
        apiHash: form.apiHash || undefined,
        personaName: form.personaName.trim() || undefined,
      }),
    onSuccess: () => {
      setShowForm(false);
      setForm({ label: '', phone: '', apiId: '', apiHash: '', personaName: '' });
      void queryClient.invalidateQueries({ queryKey: ['telegram-accounts'] });
    },
  });

  const startLogin = useMutation({
    mutationFn: (id: string) => api.post<{ phoneCodeHash: string }>(`/telegram/accounts/${id}/login/start`),
    onSuccess: (data, id) => {
      setLoginState((s) => ({
        ...s,
        [id]: { phoneCodeHash: data.phoneCodeHash, code: '', password: '', step: 'code' },
      }));
      void queryClient.invalidateQueries({ queryKey: ['telegram-accounts'] });
    },
  });

  const confirmCode = useMutation({
    mutationFn: (id: string) =>
      api.post<{ status: string }>(`/telegram/accounts/${id}/login/code`, {
        phoneCodeHash: loginState[id]?.phoneCodeHash ?? '',
        code: loginState[id]?.code ?? '',
      }),
    onSuccess: (data, id) => {
      if (data.status === 'password_required') {
        setLoginState((s) => ({ ...s, [id]: { ...s[id]!, step: 'password' } }));
      } else {
        setLoginState((s) => {
          const next = { ...s };
          delete next[id];
          return next;
        });
      }
      void queryClient.invalidateQueries({ queryKey: ['telegram-accounts'] });
    },
  });

  const confirmPassword = useMutation({
    mutationFn: (id: string) =>
      api.post(`/telegram/accounts/${id}/login/password`, { password: loginState[id]?.password ?? '' }),
    onSuccess: (_data, id) => {
      setLoginState((s) => {
        const next = { ...s };
        delete next[id];
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ['telegram-accounts'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; patch: Partial<TelegramAccount> }) =>
      api.patch(`/telegram/accounts/${payload.id}`, payload.patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['telegram-accounts'] }),
  });

  /**
   * Uzilish paytida kelgan xabarlarni Telegramdan tortib oladi.
   *
   * Qayta ulanganda avtomatik ishlaydi; tugma sezilmay qolgan uzilishlar
   * va allaqachon yo'qolgan xabarlar uchun.
   */
  const syncMissed = useMutation({
    mutationFn: (id: string) =>
      api.post<{ fetched: number; imported: number; failed: number }>(
        `/telegram/accounts/${id}/sync-missed`,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: (id: string) => api.post(`/telegram/accounts/${id}/logout`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['telegram-accounts'] }),
  });

  const distributionQuery = useQuery({
    queryKey: ['tg-distribution'],
    queryFn: () => api.get<AccountDistribution>('/telegram/distribution'),
    refetchInterval: 30_000,
  });

  // Tanlagichga faqat YOQILGAN modellar chiqadi — o'chirilgan model
  // operatorni yolg'on tanlovga undirmasin.
  const llmModelsQuery = useQuery({
    queryKey: ['llm-models'],
    queryFn: () => api.get<{ items: LlmModel[] }>('/llm/models'),
    enabled: canPickModel,
  });
  const enabledLlmModels = (llmModelsQuery.data?.items ?? []).filter((m) => m.isEnabled);

  const invalidateAll = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['telegram-accounts'] });
    void queryClient.invalidateQueries({ queryKey: ['tg-distribution'] });
    void queryClient.invalidateQueries({ queryKey: ['clients'] });
  };

  // Oxirgi tekshiruv hisoboti akkaunt bo'yicha eslab qolinadi: cheklovlar
  // kartada tekshiruvsiz ham ko'rinadi, hisobot esa faqat probe natijasi
  // va topilmagan raqamlar sonini qo'shadi.
  const [reports, setReports] = useState<Record<string, AccountCheckReport>>({});

  const accountCheck = useMutation({
    mutationFn: (id: string) =>
      api.post<{ report: AccountCheckReport }>(`/telegram/accounts/${id}/check`),
    onSuccess: (data, id) => {
      setReports((prev) => ({ ...prev, [id]: data.report }));
      invalidateAll();
    },
  });

  const bulkCheckQuery = useQuery({
    queryKey: ['tg-check-all'],
    queryFn: () => api.get<{ progress: BulkCheckProgress }>('/telegram/accounts/check-all'),
    // Ish ketayotganda tez-tez, tinch paytda kamdan-kam so'raladi.
    refetchInterval: (query) => (query.state.data?.progress.running ? 2_000 : false),
  });
  const bulkProgress = bulkCheckQuery.data?.progress;

  const bulkCheck = useMutation({
    mutationFn: () => api.post<{ progress: BulkCheckProgress }>('/telegram/accounts/check-all'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tg-check-all'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/telegram/accounts/${id}`),
    onSuccess: invalidateAll,
  });

  const resetQuota = useMutation({
    mutationFn: (id: string) => api.post(`/telegram/accounts/${id}/reset-quota`),
    onSuccess: invalidateAll,
  });

  const assignMutation = useMutation({
    mutationFn: () => api.post<{ assigned: number }>('/telegram/assign-clients'),
    onSuccess: invalidateAll,
  });

  const reassignMutation = useMutation({
    mutationFn: (id: string) => api.post(`/telegram/accounts/${id}/reassign-clients`),
    onSuccess: invalidateAll,
  });

  const accounts = accountsQuery.data?.items ?? [];
  const defaultPersonaName = accountsQuery.data?.defaultPersonaName ?? 'Lola';
  const dist = distributionQuery.data;
  const countFor = (id: string): number =>
    dist?.distribution.find((d) => d.accountId === id)?.count ?? 0;

  return (
    <div className="flex-1 overflow-y-auto">
      <header
        className={clsx(
          'flex items-center justify-between border-b border-ink-800 px-4 py-3 md:px-6 md:py-4',
          admin ? 'max-md:justify-end' : 'max-md:hidden',
        )}
      >
        <div className="hidden md:block">
          <h1 className="text-base font-semibold">Telegram akkauntlar</h1>
          <p className="mt-0.5 text-xs text-ink-500">
            MTProto orqali ulanadi — mijozlarga shaxsiy akkauntdan yoziladi
          </p>
        </div>
        {admin ? (
          <button type="button" className="btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Yopish' : 'Akkaunt qo\'shish'}
          </button>
        ) : null}
      </header>

      {showForm ? (
        <div className="border-b border-ink-800 bg-ink-900/40 px-4 py-4 md:px-6 md:py-5">
          <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Nom (ichki)</label>
              <input
                className="input"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Asosiy akkaunt"
              />
            </div>
            <div>
              <label className="label">Agent ismi (mijoz ko'radi)</label>
              <input
                className="input"
                value={form.personaName}
                onChange={(e) => setForm((f) => ({ ...f, personaName: e.target.value }))}
                placeholder={`${defaultPersonaName} (umumiy)`}
              />
            </div>
            <div>
              <label className="label">Telefon raqami</label>
              <input
                className="input"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+998 90 123 45 67"
              />
            </div>
            <div>
              <label className="label">api_id (ixtiyoriy)</label>
              <input
                className="input"
                value={form.apiId}
                onChange={(e) => setForm((f) => ({ ...f, apiId: e.target.value }))}
                placeholder=".env dagi qiymat ishlatiladi"
              />
            </div>
            <div>
              <label className="label">api_hash (ixtiyoriy)</label>
              <input
                className="input"
                type="password"
                value={form.apiHash}
                onChange={(e) => setForm((f) => ({ ...f, apiHash: e.target.value }))}
                placeholder=".env dagi qiymat ishlatiladi"
              />
            </div>
          </div>

          <p className="mt-3 max-w-3xl text-[11px] leading-relaxed text-ink-500">
            api_id va api_hash <span className="text-ink-300">my.telegram.org</span> →{' '}
            <span className="text-ink-300">API development tools</span> sahifasidan olinadi. Ular bazada
            shifrlangan holda saqlanadi va API orqali qaytarilmaydi.
          </p>

          {createMutation.error ? (
            <div className="mt-3 max-w-3xl">
              <ErrorNote error={createMutation.error} />
            </div>
          ) : null}

          <button
            type="button"
            className="btn-primary mt-4"
            disabled={!form.label.trim() || !form.phone.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? <Spinner /> : null}
            Qo'shish
          </button>
        </div>
      ) : null}

      {dist && accounts.length > 0 ? (
        <div className="border-b border-ink-800 bg-ink-900/30 px-6 py-3">
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <span className="text-ink-400">Mijozlar taqsimoti:</span>
            {dist.distribution.map((d) => (
              <span key={d.accountId} className="text-ink-300">
                {d.label}
                {d.personaName ? <span className="text-ink-500"> ({d.personaName})</span> : null}
                {' — '}
                <strong className="tabular-nums">{d.count}</strong>
              </span>
            ))}
            {dist.unassigned > 0 ? (
              <span className="chip bg-amber-500/15 text-amber-300">
                {dist.unassigned} ta biriktirilmagan
              </span>
            ) : (
              <span className="chip bg-emerald-500/15 text-emerald-300">hammasi biriktirilgan</span>
            )}
            {admin && dist.unassigned > 0 ? (
              <button
                type="button"
                className="btn-primary !py-1 text-xs"
                disabled={assignMutation.isPending}
                onClick={() => assignMutation.mutate()}
              >
                {assignMutation.isPending ? <Spinner /> : null}
                Taqsimlash
              </button>
            ) : null}
          </div>
          <p className="mt-1.5 text-[11px] text-ink-600">
            Har bir mijoz bitta akkauntga doimiy biriktiriladi — suhbat oxirigacha
            faqat shu akkauntdan yoziladi.
          </p>
          {assignMutation.error ? (
            <div className="mt-2">
              <ErrorNote error={assignMutation.error} />
            </div>
          ) : null}
        </div>
      ) : null}

      {admin && accounts.length > 0 ? (
        <div className="border-b border-ink-800 px-4 py-3 md:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn-ghost !py-1 text-xs"
              disabled={bulkProgress?.running || bulkCheck.isPending}
              onClick={() => bulkCheck.mutate()}
              title="Har bir yoqilgan akkaunt ketma-ket tekshiriladi (orasida 5 soniya pauza)"
            >
              {bulkProgress?.running ? <Spinner /> : null}
              Hammasini tekshirish
            </button>
            {bulkProgress?.running ? (
              <span className="text-[11px] text-ink-400">
                {bulkProgress.done} / {bulkProgress.total}
                {bulkProgress.currentLabel ? ` · ${bulkProgress.currentLabel}` : ''}
              </span>
            ) : bulkProgress?.finishedAt ? (
              <span className="text-[11px] text-ink-600">
                Oxirgi ommaviy tekshiruv: {relative(bulkProgress.finishedAt)}
              </span>
            ) : null}
          </div>
          <p className="mt-1.5 text-[11px] text-ink-600">
            Tekshiruv @SpamBot ga xabar yuboradi — akkauntlar ketma-ket, pauza bilan
            so'raladi. FLOOD_WAIT va PEER_FLOOD oldindan aniqlanmaydi: Telegram
            ularni faqat haqiqiy urinishda aytadi va o'shanda yozib olinadi.
          </p>
          {bulkCheck.error ? (
            <div className="mt-2">
              <ErrorNote error={bulkCheck.error} />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3 p-4 md:p-6">
        {accountsQuery.isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : accounts.length === 0 ? (
          <EmptyState
            title="Akkaunt qo'shilmagan"
            hint="Mijozlarga yozish uchun kamida bitta Telegram akkaunt ulanishi kerak."
          />
        ) : (
          accounts.map((account) => {
            const login = loginState[account.id];
            const report = reports[account.id];
            return (
              <div key={account.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium">{account.label}</h3>
                      <span className={clsx('chip', STATUS_COLOR[account.status])}>
                        {STATUS_LABEL[account.status]}
                      </span>
                      {account.connected ? (
                        <span className="chip bg-emerald-500/10 text-emerald-400">online</span>
                      ) : null}
                      <span className={clsx('chip', SPAM_COLOR[account.spamStatus])}>
                        {SPAM_LABEL[account.spamStatus]}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-ink-500">
                      {account.phone}
                      {account.tgUsername ? ` · @${account.tgUsername}` : ''}
                    </p>
                    {account.statusMessage ? (
                      <p className="mt-1 text-[11px] text-amber-400">{account.statusMessage}</p>
                    ) : null}
                    <AccountRestrictions
                      restrictions={account.restrictions}
                      notFoundLookups={report?.notFoundLookups ?? null}
                    />
                    {/* Probe natijasi faqat tekshiruvdan keyin ma'lum —
                        u bazada saqlanmaydi, jonli so'rovning javobi. */}
                    {report && !report.probe.ok ? (
                      <p className="mt-1 text-[11px] text-amber-300">
                        Jonli tekshiruv: {report.probe.message}
                      </p>
                    ) : null}
                    {report?.probe.ok && !account.restrictions.length ? (
                      <p className="mt-1 text-[11px] text-emerald-400">
                        Tekshirildi — cheklov topilmadi.
                      </p>
                    ) : null}
                    {account.spamCheckedAt ? (
                      <p className="mt-1 text-[10px] text-ink-600">
                        Oxirgi tekshiruv: {relative(account.spamCheckedAt)}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-5">
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wider text-ink-500">Mijozlar</p>
                      <p className="mt-0.5 text-base font-semibold tabular-nums">
                        {countFor(account.id)}
                      </p>
                    </div>
                    <div className="h-8 w-px bg-ink-800" />
                    <div className="text-right">
                      <p
                        className="text-[10px] uppercase tracking-wider text-ink-500"
                        title="Bugun boshlangan YANGI suhbatlar. Mavjud suhbatlardagi javoblar bu limitga kirmaydi."
                      >
                        Yangi bugun
                      </p>
                      <p
                        className={`mt-0.5 text-base font-semibold tabular-nums ${
                          account.remainingToday === 0 ? 'text-red-300' : ''
                        }`}
                      >
                        {account.sentToday}
                        <span className="text-ink-600"> / {account.dailyLimit}</span>
                      </p>
                      {account.remainingToday === 0 ? (
                        <p className="text-[10px] text-red-300">yangi murojaat to'ldi</p>
                      ) : null}
                      <p
                        className={`text-[10px] tabular-nums ${
                          account.remainingLookupsToday === 0 ? 'text-red-300' : 'text-ink-600'
                        }`}
                      >
                        qidiruv {account.lookupsToday}/{account.lookupLimit}
                      </p>
                    </div>
                    <div className="h-8 w-px bg-ink-800" />
                    {admin ? (
                      <Toggle
                        checked={account.isEnabled}
                        onChange={(v) => updateMutation.mutate({ id: account.id, patch: { isEnabled: v } })}
                      />
                    ) : null}
                  </div>
                </div>

                {admin ? (
                  <div className="mt-4 border-t border-ink-800 pt-3">
                    {/*
                      Ism akkauntning ulanish holatiga bog'liq emas: yangi akkaunt
                      avval `logged_out` bo'lib yaratiladi va operator ismni loginni
                      kutmasdan qo'ya olishi kerak. `key` — server qiymati o'zgarganda
                      boshqarilmaydigan maydon eskirib qolmasligi uchun.
                    */}
                    <label className="mb-3 flex items-center gap-1.5 text-xs text-ink-500">
                      Agent ismi
                      <input
                        key={account.personaName ?? ''}
                        className="input !py-1 w-28 text-xs"
                        defaultValue={account.personaName ?? ''}
                        placeholder={`${defaultPersonaName} (umumiy)`}
                        onBlur={(e) => {
                          const value = e.target.value.trim();
                          // Bo'sh — umumiy ismga qaytarish, shuning uchun
                          // null yuboriladi, o'zgarishsiz qoldirilmaydi.
                          const next = value === '' ? null : value;
                          if (next !== null && (next.length < 2 || next.length > 40)) {
                            e.target.value = account.personaName ?? '';
                            return;
                          }
                          if (next !== account.personaName) {
                            updateMutation.mutate({ id: account.id, patch: { personaName: next } });
                          }
                        }}
                        title="Mijoz shu ism bilan xabar oladi. Bo'sh qoldirilsa umumiy ism ishlatiladi."
                      />
                    </label>

                    {/*
                      Uslub ham ismga o'xshab ulanish holatidan mustaqil —
                      operator hali kirilmagan akkauntga ham oldindan uslub
                      belgilay olishi kerak. `select` — akkaunt oz sonli,
                      qat'iy ikkita qiymatdan biri tanlanadi, shuning uchun
                      matn maydoni emas.
                    */}
                    <label className="mb-3 flex items-center gap-1.5 text-xs text-ink-500">
                      Uslub
                      <select
                        // `personaName` maydonidagi bilan bir xil naqsh:
                        // boshqarilmaydigan (`defaultValue`) + server
                        // qiymatiga bog'langan `key`. Aks holda sahifa
                        // har 10 soniyada qayta so'ralganda (`refetchInterval`)
                        // operator hozirgina tanlagan qiymat mutatsiya
                        // tugaguncha eski qiymatga sakrab qaytishi mumkin edi.
                        key={account.styleVersion}
                        className="input !py-1 w-32 text-xs"
                        defaultValue={account.styleVersion}
                        onChange={(e) =>
                          updateMutation.mutate({
                            id: account.id,
                            patch: { styleVersion: e.target.value as 'v1' | 'v2' },
                          })
                        }
                        title="Agent shu akkauntda qaysi uslub qoidalari bilan yozadi."
                      >
                        <option value="v1">v1 — hozirgi</option>
                        <option value="v2">v2 — jamoa uslubi</option>
                      </select>
                    </label>

                    {/*
                      Model — Uslub bilan bir xil naqsh: `defaultValue` +
                      server qiymatiga bog'langan `key`, shu sababdan ham
                      (refetchInterval operatorning yangi tanlovini bosib
                      ketmasin). Bo'sh qiymat ("") standart (Claude)ni
                      bildiradi — patch'da `null` yuboriladi.
                    */}
                    {canPickModel ? (
                      <label className="mb-3 flex items-center gap-1.5 text-xs text-ink-500">
                        Model
                        <select
                          key={account.llmModelId ?? ''}
                          className="input !py-1 w-32 text-xs"
                          defaultValue={account.llmModelId ?? ''}
                          onChange={(e) =>
                            updateMutation.mutate({
                              id: account.id,
                              patch: { llmModelId: e.target.value === '' ? null : e.target.value },
                            })
                          }
                          title="Agent shu akkauntda qaysi til modeli bilan yozadi. Standart — Claude."
                        >
                          <option value="">Standart (Claude)</option>
                          {enabledLlmModels.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    {/*
                      Proksi ulanish holatidan MUSTAQIL: akkaunt aynan
                      proksi yiqilgani uchun `error` holatida turgan
                      bo'lishi mumkin — shunda ham operator uni tuzata
                      olishi kerak.

                      `key` — sahifa har 10 soniyada qayta so'raladi
                      (`accountsQuery.refetchInterval`); agar shu vaqt
                      ichida boshqa admin proksini o'zgartirsa yoki
                      o'chirsa, `account.proxy` yangilanadi-yu, forma
                      ichidagi lokal holat (useState boshlang'ich qiymati
                      sifatida bir marta o'qiladi) eskirib qoladi va
                      operator "Saqlash" bossa eski qiymatlar qayta
                      yozilib ketishi mumkin edi. Kalit faqat server
                      qiymatidan tuziladi — operator terayotganda
                      o'zgarmaydi, chunki `account.proxy` teri paytida
                      o'zgarmaydi.
                    */}
                    <AccountProxyForm
                      key={
                        account.proxy
                          ? `${account.proxy.host}:${account.proxy.port}:${account.proxy.username ?? ''}`
                          : 'no-proxy'
                      }
                      account={account}
                      onSaved={() => queryClient.invalidateQueries({ queryKey: ['telegram-accounts'] })}
                    />


                    {account.status === 'connected' ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="btn-ghost !py-1 text-xs"
                          disabled={accountCheck.isPending || bulkProgress?.running}
                          onClick={() => accountCheck.mutate(account.id)}
                          title={
                            'Jonli so\'rov + @SpamBot: sessiya tirikmi, cheklov bormi, ' +
                            'qachon ochiladi. FLOOD_WAIT va PEER_FLOOD oldindan aniqlanmaydi — ' +
                            'ular haqiqiy urinishda yozib olinadi.'
                          }
                        >
                          {accountCheck.isPending && accountCheck.variables === account.id ? (
                            <Spinner />
                          ) : null}
                          Tekshirish
                        </button>
                        {countFor(account.id) > 0 ? (
                          <button
                            type="button"
                            className="btn-ghost !py-1 text-xs text-amber-300"
                            disabled={reassignMutation.isPending}
                            onClick={() => {
                              if (
                                confirm(
                                  `"${account.label}" akkauntidagi ${countFor(account.id)} ta mijoz ` +
                                    'boshqa akkauntlarga o\'tkazilsinmi? Ular endi boshqa raqamdan va boshqa ism bilan xabar oladi.',
                                )
                              ) {
                                reassignMutation.mutate(account.id);
                              }
                            }}
                          >
                            Mijozlarni qayta taqsimlash
                          </button>
                        ) : null}
                        <label className="flex items-center gap-1.5 text-xs text-ink-500">
                          Kunlik limit
                          <input
                            type="number"
                            min={1}
                            max={200}
                            className="input !py-1 w-16 text-xs tabular-nums"
                            defaultValue={account.dailyLimit}
                            onBlur={(e) => {
                              const value = Number(e.target.value);
                              if (!Number.isInteger(value) || value < 1 || value > 200) {
                                e.target.value = String(account.dailyLimit);
                                return;
                              }
                              if (value !== account.dailyLimit) {
                                updateMutation.mutate({ id: account.id, patch: { dailyLimit: value } });
                              }
                            }}
                            title="1 dan 200 gacha. Telegram bloklamasligi uchun 30 tavsiya etiladi."
                          />
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-ink-500">
                          Kunlik qidiruv
                          <input
                            type="number"
                            min={1}
                            max={500}
                            className="input !py-1 w-16 text-xs tabular-nums"
                            defaultValue={account.lookupLimit}
                            onBlur={(e) => {
                              const value = Number(e.target.value);
                              if (!Number.isInteger(value) || value < 1 || value > 500) {
                                e.target.value = String(account.lookupLimit);
                                return;
                              }
                              if (value !== account.lookupLimit) {
                                updateMutation.mutate({ id: account.id, patch: { lookupLimit: value } });
                              }
                            }}
                            title="Kuniga nechta telefon raqami Telegramdan qidirilsin. Qidiruv ham spam filtri uchun signal."
                          />
                        </label>
                        {/*
                          Tugma IKKALA hisoblagichga qaraydi: ommaviy
                          qidiruvdan keyingi tipik holat — yangi suhbat 0,
                          qidiruv 50. Faqat `sentToday` ga qaraganda tugma
                          aynan kerak bo'lgan paytda ko'rinmasdi.
                        */}
                        {account.sentToday > 0 || account.lookupsToday > 0 ? (
                          <button
                            type="button"
                            className="btn-ghost !py-1 text-xs text-amber-300"
                            disabled={resetQuota.isPending}
                            onClick={() => {
                              if (
                                confirm(
                                  'Bugungi hisoblagichlar nolga tushiriladi — yangi suhbat: ' +
                                    `${account.sentToday}, qidiruv: ${account.lookupsToday}.\n\n` +
                                    'Diqqat: bu faqat bizning ichki hisobimiz. Telegramning o\'z ' +
                                    'cheklovlari bundan qaytmaydi — ko\'p yuborilsa yoki ko\'p ' +
                                    'qidirilsa akkaunt spam filtriga tushishi mumkin.',
                                )
                              ) {
                                resetQuota.mutate(account.id);
                              }
                            }}
                            title="Kunlik hisoblagichlarni (yangi suhbat va qidiruv) nolga tushirish"
                          >
                            {resetQuota.isPending ? <Spinner /> : null}
                            Hisoblagichni tozalash
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn-ghost !py-1 text-xs"
                          disabled={syncMissed.isPending}
                          onClick={() => syncMissed.mutate(account.id)}
                          title="Uzilish paytida kelgan xabarlarni Telegramdan tiklaydi (24 soat)"
                        >
                          {syncMissed.isPending && syncMissed.variables === account.id ? (
                            <Spinner />
                          ) : null}
                          Xabarlarni tiklash
                        </button>
                        {syncMissed.isSuccess && syncMissed.variables === account.id ? (
                          <span className="self-center text-[11px] text-ink-400">
                            {syncMissed.data.imported > 0
                              ? `${syncMissed.data.imported} ta xabar tiklandi`
                              : 'Yangi xabar topilmadi'}
                            {syncMissed.data.failed > 0 ? ` · ${syncMissed.data.failed} ta xato` : ''}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          className="btn-ghost !py-1 text-xs"
                          onClick={() => logoutMutation.mutate(account.id)}
                        >
                          Chiqish
                        </button>
                        {syncMissed.error ? <ErrorNote error={syncMissed.error} /> : null}
                        {accountCheck.error && accountCheck.variables === account.id ? (
                          <ErrorNote error={accountCheck.error} />
                        ) : null}
                        {resetQuota.error ? <ErrorNote error={resetQuota.error} /> : null}
                      </div>
                    ) : login?.step === 'code' ? (
                      <div className="flex flex-wrap items-end gap-2">
                        <div>
                          <label className="label">Telegramdagi kod</label>
                          <input
                            className="input w-40"
                            value={login.code}
                            onChange={(e) =>
                              setLoginState((s) => ({ ...s, [account.id]: { ...login, code: e.target.value } }))
                            }
                            placeholder="12345"
                          />
                        </div>
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={confirmCode.isPending}
                          onClick={() => confirmCode.mutate(account.id)}
                        >
                          {confirmCode.isPending ? <Spinner /> : null}
                          Tasdiqlash
                        </button>
                        {confirmCode.error ? <ErrorNote error={confirmCode.error} /> : null}
                      </div>
                    ) : login?.step === 'password' ? (
                      <div className="flex flex-wrap items-end gap-2">
                        <div>
                          <label className="label">Ikki bosqichli parol</label>
                          <input
                            className="input w-56"
                            type="password"
                            value={login.password}
                            onChange={(e) =>
                              setLoginState((s) => ({
                                ...s,
                                [account.id]: { ...login, password: e.target.value },
                              }))
                            }
                          />
                        </div>
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={confirmPassword.isPending}
                          onClick={() => confirmPassword.mutate(account.id)}
                        >
                          {confirmPassword.isPending ? <Spinner /> : null}
                          Kirish
                        </button>
                        {confirmPassword.error ? <ErrorNote error={confirmPassword.error} /> : null}
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          className="btn-primary !py-1 text-xs"
                          disabled={startLogin.isPending}
                          onClick={() => startLogin.mutate(account.id)}
                        >
                          {startLogin.isPending ? <Spinner /> : null}
                          Kod yuborish
                        </button>
                        {/* `awaiting_qr` ham kiradi: server qayta ishga tushsa yoki
                            tsikl yo'qolsa, DB'da eskirgan `awaiting_qr` qolishi mumkin;
                            tugma bosilsa server eski tsiklni to'xtatib yangisini boshlaydi. */}
                        {account.status === 'logged_out' ||
                        account.status === 'error' ||
                        account.status === 'awaiting_qr' ? (
                          <button
                            type="button"
                            className="btn-ghost !py-1 text-xs"
                            onClick={() => setQrFor(account.id)}
                          >
                            QR orqali kirish
                          </button>
                        ) : null}
                        <span className="text-[11px] text-ink-500">
                          Telegram ilovangizga kod keladi — uni shu yerga kiriting
                        </span>
                        {startLogin.error ? <ErrorNote error={startLogin.error} /> : null}
                      </div>
                    )}

                    {/* Ism va limit tahriri har qanday holatda bo'lgani uchun
                        xato ham shu yerda — ulanish blokining ichida emas. */}
                    {updateMutation.error ? <ErrorNote error={updateMutation.error} /> : null}

                    {/* O'chirish har qanday holatda mavjud — buzuq akkauntni
                        ham olib tashlash kerak bo'ladi. */}
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        className="btn-ghost !py-1 text-xs text-red-300"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (
                            confirm(
                              `"${account.label}" (${account.phone}) ro'yxatdan olib tashlanadi.\n\n`
                              + 'Yozishmalar tarixi saqlanadi, lekin bu akkauntga biriktirilgan '
                              + 'mijozlar bo\'shatiladi — ularni boshqa akkauntga qayta taqsimlash kerak.',
                            )
                          ) {
                            deleteMutation.mutate(account.id);
                          }
                        }}
                      >
                        {deleteMutation.isPending ? <Spinner /> : null}
                        O'chirish
                      </button>
                      {deleteMutation.error ? <ErrorNote error={deleteMutation.error} /> : null}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      {qrAccount ? (
        <QrLoginDialog
          accountId={qrAccount.id}
          phone={qrAccount.phone}
          status={qrAccount.status}
          statusMessage={qrAccount.statusMessage}
          onClose={() => setQrFor(null)}
          onConnected={() => setQrFor(null)}
          onPasswordRequired={() => {
            setLoginState((s) => ({ ...s, [qrAccount.id]: { code: '', password: '', step: 'password' } }));
            setQrFor(null);
          }}
        />
      ) : null}
    </div>
  );
}
