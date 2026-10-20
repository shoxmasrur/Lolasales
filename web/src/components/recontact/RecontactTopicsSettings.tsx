import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCan } from '@/store/auth';
import { ErrorNote, Spinner, Toggle } from '@/components/ui';
import {
  RECONTACT_INSTRUCTION_MAX,
  RECONTACT_TITLE_MAX,
  recontactApi,
  type RecontactTopic,
} from '@/lib/recontact';

/**
 * Qayta aloqa mavzulari.
 *
 * Operator "Qayta aloqa" ro'yxatida mijozlarni belgilab, shu mavzulardan
 * birini tanlaydi — agent unga qarab xabar tuzadi. O'chirilgan mavzu
 * operator tanlovida ko'rinmaydi; o'chirish yumshoq.
 */
export function RecontactTopicsSettings() {
  const canEdit = useCan('settings.edit');
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ['recontact-topics', canEdit ? 'all' : 'enabled'],
    // `?all=1` faqat `settings.edit` bilan ruxsat etilgan.
    queryFn: () => recontactApi.topics(canEdit),
  });

  const invalidate = (): void => {
    void qc.invalidateQueries({ queryKey: ['recontact-topics'] });
  };

  // ─── Qo'shish ─────────────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [instruction, setInstruction] = useState('');

  const create = useMutation({
    mutationFn: () =>
      recontactApi.createTopic({ title: title.trim(), instruction: instruction.trim() }),
    onSuccess: () => {
      setTitle('');
      setInstruction('');
      invalidate();
    },
  });

  // ─── Tahrirlash (bir vaqtda bitta qator) ──────────────────────────────
  const [editId, setEditId] = useState<string | null>(null);
  const [eTitle, setETitle] = useState('');
  const [eInstruction, setEInstruction] = useState('');

  const beginEdit = (t: RecontactTopic): void => {
    setEditId(t.id);
    setETitle(t.title);
    setEInstruction(t.instruction);
  };

  const save = useMutation({
    mutationFn: (id: string) =>
      recontactApi.updateTopic(id, { title: eTitle.trim(), instruction: eInstruction.trim() }),
    onSuccess: (_data, id) => {
      setEditId((cur) => (cur === id ? null : cur));
      invalidate();
    },
  });

  const toggle = useMutation({
    mutationFn: (vars: { id: string; isEnabled: boolean }) =>
      recontactApi.updateTopic(vars.id, { isEnabled: vars.isEnabled }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => recontactApi.deleteTopic(id),
    onSuccess: (_data, id) => {
      setEditId((cur) => (cur === id ? null : cur));
      invalidate();
    },
  });

  const valid = (t: string, i: string): boolean =>
    t.trim().length >= 1
    && t.trim().length <= RECONTACT_TITLE_MAX
    && i.trim().length >= 1
    && i.trim().length <= RECONTACT_INSTRUCTION_MAX;

  const items = list.data?.items ?? [];

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-sm font-medium">Qayta aloqa mavzulari</h2>
        <p className="mt-1 text-xs text-ink-500">
          Operator "Qayta aloqa" ro'yxatida mavzu tanlaydi, agent shu topshiriq bo'yicha mijozga o'zi
          yozadi. O'chirilgan mavzu tanlovda ko'rinmaydi.
        </p>
      </div>

      {list.isLoading ? <Spinner /> : null}
      {list.error ? <ErrorNote error={list.error} /> : null}

      <ul className="space-y-2">
        {items.map((t) => (
          <li key={t.id} className="rounded-lg border border-ink-800 px-3 py-2.5">
            {editId === t.id ? (
              <div className="space-y-2">
                <input
                  className="input text-xs"
                  maxLength={RECONTACT_TITLE_MAX}
                  value={eTitle}
                  onChange={(e) => setETitle(e.target.value)}
                />
                <textarea
                  className="input min-h-[90px] text-xs"
                  maxLength={RECONTACT_INSTRUCTION_MAX}
                  value={eInstruction}
                  onChange={(e) => setEInstruction(e.target.value)}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn-primary text-xs"
                    disabled={!valid(eTitle, eInstruction) || save.isPending}
                    onClick={() => save.mutate(t.id)}
                  >
                    {save.isPending ? <Spinner /> : null}
                    Saqlash
                  </button>
                  <button type="button" className="btn-ghost text-xs" onClick={() => setEditId(null)}>
                    Bekor qilish
                  </button>
                  <span className="ml-auto text-[11px] tabular-nums text-ink-500">
                    {eInstruction.length} / {RECONTACT_INSTRUCTION_MAX}
                  </span>
                </div>
                {save.error ? <ErrorNote error={save.error} /> : null}
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`text-sm ${t.isEnabled ? 'text-ink-100' : 'text-ink-500 line-through'}`}>
                    {t.title}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-xs text-ink-500">{t.instruction}</p>
                </div>
                {canEdit ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <Toggle
                      size="sm"
                      checked={t.isEnabled}
                      disabled={toggle.isPending}
                      onChange={(v) => toggle.mutate({ id: t.id, isEnabled: v })}
                    />
                    <button type="button" className="btn-ghost text-xs" onClick={() => beginEdit(t)}>
                      Tahrirlash
                    </button>
                    <button
                      type="button"
                      className="btn-ghost text-xs"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (confirm(`"${t.title}" mavzusi o'chirilsinmi?`)) remove.mutate(t.id);
                      }}
                    >
                      O'chirish
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </li>
        ))}
        {list.data && items.length === 0 ? (
          <li className="text-xs text-ink-600">Hozircha mavzu kiritilmagan</li>
        ) : null}
      </ul>

      {toggle.error ? <ErrorNote error={toggle.error} /> : null}
      {remove.error ? <ErrorNote error={remove.error} /> : null}

      {canEdit ? (
        <div className="space-y-2 border-t border-ink-800 pt-4">
          <input
            className="input text-xs"
            placeholder="Mavzu nomi"
            maxLength={RECONTACT_TITLE_MAX}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="input min-h-[90px] text-xs"
            placeholder="Agentga topshiriq: mijozga nima haqida yozsin"
            maxLength={RECONTACT_INSTRUCTION_MAX}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-primary text-xs"
              disabled={!valid(title, instruction) || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? <Spinner /> : null}
              Qo'shish
            </button>
            <span className="ml-auto text-[11px] tabular-nums text-ink-500">
              {instruction.length} / {RECONTACT_INSTRUCTION_MAX}
            </span>
          </div>
          {create.error ? <ErrorNote error={create.error} /> : null}
        </div>
      ) : null}
    </div>
  );
}
