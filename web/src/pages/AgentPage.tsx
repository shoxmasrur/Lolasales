import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { useCan } from '@/store/auth';
import type { AgentLesson, AgentRule, AgentRuleSection } from '@/lib/types';
import { relative } from '@/lib/format';
import { EmptyState, ErrorNote, Spinner, Toggle } from '@/components/ui';

type Tab = 'rules' | 'lessons' | 'preview';

export default function AgentPage() {
  const [tab, setTab] = useState<Tab>('rules');

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="border-b border-ink-800 px-4 py-3 md:px-6 md:py-4">
        <div className="hidden md:block">
          <h1 className="text-base font-semibold">Agent qoidalari va xotirasi</h1>
          <p className="mt-0.5 text-xs text-ink-500">
            Agent qanday gapiradi, nimani biladi va suhbatlardan nima o'rgangan
          </p>
        </div>
        <div className="mt-3 flex gap-1">
          {(
            [
              ['rules', 'Qoidalar'],
              ['lessons', 'O\'rgangan saboqlar'],
              ['preview', 'Prompt ko\'rinishi'],
            ] as Array<[Tab, string]>
          ).map(([key, label]) => (
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
          ))}
        </div>
      </header>

      {tab === 'rules' ? <RulesTab /> : tab === 'lessons' ? <LessonsTab /> : <PreviewTab />}
    </div>
  );
}

// ─── Qoidalar ──────────────────────────────────────────────────────────────

/** Bo'limlar shu bo'yicha filtrlanadi — 'all' hammasi, 'shared' faqat umumiy (styleVersion === null). */
type StyleFilter = 'all' | 'shared' | 'v1' | 'v2';

function RulesTab() {
  const queryClient = useQueryClient();
  const canEdit = useCan('agent.edit');
  const [adding, setAdding] = useState<string | null>(null);
  const [draft, setDraft] = useState({ body: '', situation: '', bad: '', good: '', why: '' });
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [styleFilter, setStyleFilter] = useState<StyleFilter>('all');

  const rulesQuery = useQuery({
    queryKey: ['agent-rules'],
    queryFn: () => api.get<{ sections: AgentRuleSection[] }>('/agent/rules'),
  });

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['agent-rules'] });
    void queryClient.invalidateQueries({ queryKey: ['agent-preview'] });
  };

  const addMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/agent/rules', payload),
    onSuccess: () => {
      setAdding(null);
      setDraft({ body: '', situation: '', bad: '', good: '', why: '' });
      invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; patch: Record<string, unknown> }) =>
      api.patch(`/agent/rules/${payload.id}`, payload.patch),
    onSuccess: () => {
      setEditing(null);
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/agent/rules/${id}`),
    onSuccess: invalidate,
  });

  const resetMutation = useMutation({
    mutationFn: (sectionKey: string) => api.post(`/agent/rules/reset/${sectionKey}`),
    onSuccess: invalidate,
  });

  if (rulesQuery.isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  const allSections = rulesQuery.data?.sections ?? [];
  // Filtr: 'all' — hammasi, 'shared' — faqat umumiy (styleVersion === null),
  // 'v1'/'v2' — faqat o'sha uslubga tegishli bo'limlar.
  const sections =
    styleFilter === 'all'
      ? allSections
      : styleFilter === 'shared'
        ? allSections.filter((s) => s.styleVersion === null)
        : allSections.filter((s) => s.styleVersion === styleFilter);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <p className="rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2 text-xs text-ink-400">
        Bu qoidalar har bir xabar oldidan agentga beriladi. O'zgartirish{' '}
        <strong className="text-ink-200">10 soniyada</strong> kuchga kiradi — server qayta
        ishga tushirilishi shart emas.
      </p>

      {/*
        Bo'limlar ikkita uslub o'rtasida taqsimlangan (ba'zisi umumiy).
        Operator qaysi akkaunt qaysi uslubda yozayotganini bilib, faqat
        o'sha bo'limlarni ko'rish uchun filtrlaydi.
      */}
      <div className="flex gap-1">
        {(
          [
            ['all', 'Hammasi'],
            ['shared', 'Umumiy'],
            ['v1', 'v1'],
            ['v2', 'v2'],
          ] as Array<[StyleFilter, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setStyleFilter(key)}
            className={clsx(
              'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
              styleFilter === key ? 'bg-ink-800 text-ink-100' : 'text-ink-500 hover:bg-ink-800/50',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {(addMutation.error || updateMutation.error || deleteMutation.error) && (
        <ErrorNote error={addMutation.error ?? updateMutation.error ?? deleteMutation.error} />
      )}

      {sections.length === 0 ? (
        <EmptyState title="Bo'lim yo'q" hint="Bu filtrga mos bo'lim topilmadi." />
      ) : null}

      {sections.map((section) => (
        <div key={section.id} className="card">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-sm font-medium">
                {section.title}
                {section.styleVersion ? (
                  <span className="ml-1.5 rounded bg-ink-800 px-1.5 py-0.5 align-middle text-[10px] font-normal text-ink-400">
                    {section.styleVersion}
                  </span>
                ) : null}
              </h2>
              {section.description ? (
                <p className="mt-0.5 text-[11px] text-ink-500">{section.description}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="chip bg-ink-800 text-ink-400">
                {section.rules.filter((r) => r.isEnabled).length}/{section.rules.length}
              </span>
              {canEdit ? (
                <>
                  <button
                    type="button"
                    className="btn-ghost !py-1 text-[11px]"
                    onClick={() => setAdding(adding === section.id ? null : section.id)}
                  >
                    + Qo'shish
                  </button>
                  <button
                    type="button"
                    className="btn-ghost !py-1 text-[11px] text-amber-300"
                    onClick={() => {
                      if (confirm(`"${section.title}" standart qiymatlarga qaytarilsinmi? Qo'shgan qoidalaringiz o'chadi.`)) {
                        resetMutation.mutate(section.key);
                      }
                    }}
                  >
                    Standartga qaytarish
                  </button>
                </>
              ) : null}
            </div>
          </div>

          {adding === section.id ? (
            <div className="mb-3 space-y-2 rounded-lg border border-brand-500/30 bg-brand-500/5 p-3">
              {section.kind === 'examples' ? (
                <>
                  <input
                    className="input"
                    placeholder="Vaziyat (masalan: mijoz «tushundim» dedi)"
                    value={draft.situation}
                    onChange={(e) => setDraft((d) => ({ ...d, situation: e.target.value }))}
                  />
                  <textarea
                    className="input"
                    rows={2}
                    placeholder="✗ YOMON javob"
                    value={draft.bad}
                    onChange={(e) => setDraft((d) => ({ ...d, bad: e.target.value }))}
                  />
                  <textarea
                    className="input"
                    rows={2}
                    placeholder="✓ YAXSHI javob"
                    value={draft.good}
                    onChange={(e) => setDraft((d) => ({ ...d, good: e.target.value }))}
                  />
                  <input
                    className="input"
                    placeholder="Nega shunday?"
                    value={draft.why}
                    onChange={(e) => setDraft((d) => ({ ...d, why: e.target.value }))}
                  />
                </>
              ) : (
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Yangi qoida matni"
                  value={draft.body}
                  onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-primary !py-1 text-xs"
                  disabled={addMutation.isPending}
                  onClick={() =>
                    addMutation.mutate(
                      section.kind === 'examples'
                        ? {
                            sectionId: section.id,
                            situation: draft.situation,
                            badExample: draft.bad,
                            goodExample: draft.good,
                            why: draft.why,
                          }
                        : { sectionId: section.id, body: draft.body },
                    )
                  }
                >
                  Saqlash
                </button>
                <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => setAdding(null)}>
                  Bekor
                </button>
              </div>
            </div>
          ) : null}

          <ul className="space-y-1.5">
            {section.rules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                kind={section.kind}
                canEdit={canEdit}
                isEditing={editing === rule.id}
                editText={editText}
                onEditStart={() => {
                  setEditing(rule.id);
                  setEditText(rule.body ?? '');
                }}
                onEditChange={setEditText}
                onEditCancel={() => setEditing(null)}
                onEditSave={() => updateMutation.mutate({ id: rule.id, patch: { body: editText } })}
                onToggle={(v) => updateMutation.mutate({ id: rule.id, patch: { isEnabled: v } })}
                onDelete={() => {
                  if (confirm('Bu qoida o\'chirilsinmi?')) deleteMutation.mutate(rule.id);
                }}
              />
            ))}
            {section.rules.length === 0 ? (
              <li className="py-3 text-center text-xs text-ink-600">Qoida yo'q</li>
            ) : null}
          </ul>
        </div>
      ))}
    </div>
  );
}

function RuleRow({
  rule,
  kind,
  canEdit,
  isEditing,
  editText,
  onEditStart,
  onEditChange,
  onEditCancel,
  onEditSave,
  onToggle,
  onDelete,
}: {
  rule: AgentRule;
  kind: 'bullets' | 'examples';
  canEdit: boolean;
  isEditing: boolean;
  editText: string;
  onEditStart: () => void;
  onEditChange: (v: string) => void;
  onEditCancel: () => void;
  onEditSave: () => void;
  onToggle: (v: boolean) => void;
  onDelete: () => void;
}) {
  if (isEditing) {
    return (
      <li className="space-y-2 rounded-lg border border-brand-500/30 bg-brand-500/5 p-2.5">
        <textarea
          className="input"
          rows={3}
          value={editText}
          onChange={(e) => onEditChange(e.target.value)}
        />
        <div className="flex gap-2">
          <button type="button" className="btn-primary !py-1 text-xs" onClick={onEditSave}>
            Saqlash
          </button>
          <button type="button" className="btn-ghost !py-1 text-xs" onClick={onEditCancel}>
            Bekor
          </button>
        </div>
      </li>
    );
  }

  return (
    <li
      className={clsx(
        'group flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-ink-800/40',
        !rule.isEnabled && 'opacity-40',
      )}
    >
      {canEdit ? (
        <div className="mt-px shrink-0">
          <Toggle checked={rule.isEnabled} onChange={onToggle} size="sm" />
        </div>
      ) : (
        <span className="mt-1 text-ink-600">•</span>
      )}

      <div className="min-w-0 flex-1">
        {kind === 'examples' ? (
          <div className="space-y-1 text-xs">
            <p className="text-ink-300">{rule.situation}</p>
            <p className="text-red-300/90">✗ {rule.badExample}</p>
            <p className="text-emerald-300/90">✓ {rule.goodExample}</p>
            <p className="text-[11px] text-ink-500">{rule.why}</p>
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-ink-200">{rule.body}</p>
        )}
      </div>

      {canEdit ? (
        <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100 [@media(hover:none)]:opacity-100">
          {kind === 'bullets' ? (
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-[11px] text-ink-400 hover:bg-ink-700 max-md:inline-flex max-md:min-h-10 max-md:min-w-10 max-md:items-center max-md:justify-center"
              onClick={onEditStart}
            >
              tahrir
            </button>
          ) : null}
          <button
            type="button"
            className="rounded px-1.5 py-0.5 text-[11px] text-red-400 hover:bg-ink-700 max-md:inline-flex max-md:min-h-10 max-md:min-w-10 max-md:items-center max-md:justify-center"
            onClick={onDelete}
          >
            o'chirish
          </button>
        </div>
      ) : null}
    </li>
  );
}

// ─── Saboqlar ──────────────────────────────────────────────────────────────

function LessonsTab() {
  const queryClient = useQueryClient();
  const canEdit = useCan('agent.edit');
  const [filter, setFilter] = useState<'proposed' | 'approved' | 'rejected' | 'all'>('proposed');

  const lessonsQuery = useQuery({
    queryKey: ['agent-lessons', filter],
    queryFn: () =>
      api.get<{ items: AgentLesson[] }>('/agent/lessons', {
        status: filter === 'all' ? undefined : filter,
      }),
  });

  const statusMutation = useMutation({
    mutationFn: (payload: { id: string; status: string }) =>
      api.post(`/agent/lessons/${payload.id}/status`, { status: payload.status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agent-lessons'] });
      void queryClient.invalidateQueries({ queryKey: ['agent-preview'] });
    },
  });

  const items = lessonsQuery.data?.items ?? [];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <p className="rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2 text-xs text-ink-400">
        Agent suhbatlardan xulosa chiqaradi. Saboq <strong className="text-ink-200">avtomatik
        ishlatilmaydi</strong> — siz tasdiqlaganingizdan keyingina promptga qo'shiladi.
        Bir xil saboq qayta uchrasa, hisoblagichi oshadi.
      </p>

      <div className="flex gap-1">
        {(
          [
            ['proposed', 'Tasdiq kutmoqda'],
            ['approved', 'Tasdiqlangan'],
            ['rejected', 'Rad etilgan'],
            ['all', 'Hammasi'],
          ] as Array<[typeof filter, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={clsx(
              'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
              filter === key ? 'bg-ink-800 text-ink-100' : 'text-ink-500 hover:bg-ink-800/50',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {lessonsQuery.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Saboq yo'q"
          hint="Agent suhbatlar davomida yangi narsa o'rgansa, u shu yerda tasdiqlash uchun paydo bo'ladi."
        />
      ) : (
        <div className="space-y-2">
          {items.map((lesson) => (
            <div key={lesson.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink-100">{lesson.lesson}</p>
                  {lesson.evidence ? (
                    <p className="mt-1.5 border-l-2 border-ink-700 pl-2 text-[11px] italic text-ink-500">
                      “{lesson.evidence}”
                    </p>
                  ) : null}
                  <p className="mt-1.5 text-[10px] text-ink-600">
                    {relative(lesson.createdAt)}
                    {lesson.timesSeen > 1 ? ` · ${lesson.timesSeen} marta uchradi` : ''}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <span
                    className={clsx(
                      'chip',
                      lesson.status === 'approved'
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : lesson.status === 'rejected'
                          ? 'bg-red-500/15 text-red-300'
                          : 'bg-amber-500/15 text-amber-300',
                    )}
                  >
                    {lesson.status === 'approved'
                      ? 'Tasdiqlangan'
                      : lesson.status === 'rejected'
                        ? 'Rad etilgan'
                        : 'Kutmoqda'}
                  </span>

                  {canEdit && lesson.status !== 'approved' ? (
                    <button
                      type="button"
                      className="btn-primary !py-1 text-[11px]"
                      onClick={() => statusMutation.mutate({ id: lesson.id, status: 'approved' })}
                    >
                      Tasdiqlash
                    </button>
                  ) : null}
                  {canEdit && lesson.status !== 'rejected' ? (
                    <button
                      type="button"
                      className="btn-ghost !py-1 text-[11px]"
                      onClick={() => statusMutation.mutate({ id: lesson.id, status: 'rejected' })}
                    >
                      Rad etish
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Prompt ko'rinishi ─────────────────────────────────────────────────────

/**
 * `?style` parametri server tomonda (`agentRoutes.ts` /prompt-preview)
 * allaqachon qabul qilinardi, lekin panel uni hech qachon uzatmasdi —
 * v2 promptini bu yerdan ko'rib bo'lmas edi. `RulesTab`dagi
 * `styleFilter` tugmalari bilan bir xil naqsh: segmentlangan tugmalar,
 * qat'iy ikkita qiymat (matn maydoni emas).
 */
function PreviewTab() {
  const [style, setStyle] = useState<'v1' | 'v2'>('v1');

  const previewQuery = useQuery({
    queryKey: ['agent-preview', style],
    queryFn: () =>
      api.get<{ sections: string; lessons: string; ruleCount: number }>('/agent/prompt-preview', { style }),
  });

  const data = previewQuery.data;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex gap-1">
        {(
          [
            ['v1', 'v1 — hozirgi'],
            ['v2', 'v2 — jamoa uslubi'],
          ] as Array<['v1' | 'v2', string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setStyle(key)}
            className={clsx(
              'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
              style === key ? 'bg-ink-800 text-ink-100' : 'text-ink-500 hover:bg-ink-800/50',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <p className="rounded-lg border border-ink-800 bg-ink-900/40 px-3 py-2 text-xs text-ink-400">
        Agentga har bir xabar oldidan aynan shu matn beriladi ({data?.ruleCount ?? 0} ta faol qoida).
        Bunga qo'shimcha ravishda mijozning to'lov ma'lumoti va suhbat tarixi qo'shiladi.
      </p>

      {previewQuery.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <pre className="max-h-[70vh] overflow-auto rounded-xl border border-ink-800 bg-ink-950 p-4 text-[11px] leading-relaxed text-ink-300">
          {[data?.sections, data?.lessons].filter(Boolean).join('\n\n')}
        </pre>
      )}
    </div>
  );
}
