import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSocket } from '@/lib/socket';
import { useCan } from '@/store/auth';
import { dateUz, relative, som } from '@/lib/format';
import { EmptyState, ErrorNote, Spinner } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { RecontactConversationSheet } from '@/components/recontact/RecontactConversationSheet';
import {
  isRecontactProgress,
  PROMISE_STATUS_LABEL,
  RECONTACT_INSTRUCTION_MAX,
  RECONTACT_KIND_COLOR,
  RECONTACT_KIND_LABEL,
  RECONTACT_KINDS,
  recontactApi,
  type RecontactBulkBody,
  type RecontactJob,
  type RecontactKind,
} from '@/lib/recontact';

/** Mavzu tanlovidagi "O'zim yozaman" varianti. */
const CUSTOM = '__custom';

const OUTCOME_LABEL: Record<'sent' | 'skipped' | 'failed', string> = {
  sent: 'yuborildi',
  skipped: "o'tkazib yuborildi",
  failed: 'xato',
};

/**
 * "Qayta aloqa" bo'limi — avtomatika yozishni tugatgan, jim qolgan suhbatlar.
 *
 * Operator mijozlarni belgilaydi va mavzu tanlaydi, agent har biriga shu
 * mavzu bo'yicha o'zi xabar tuzadi. Ro'yxat har safar serverda
 * hisoblanadi — xabar ketgan suhbat undan o'zi chiqadi.
 */
export function RecontactPanel() {
  const queryClient = useQueryClient();
  const canSend = useCan('conversations.agent_toggle');

  const listQuery = useQuery({
    queryKey: ['recontact'],
    queryFn: recontactApi.list,
  });

  const topicsQuery = useQuery({
    queryKey: ['recontact-topics', 'enabled'],
    queryFn: () => recontactApi.topics(false),
    enabled: canSend,
  });

  // ─── Faol navbat ──────────────────────────────────────────────────────
  const [job, setJob] = useState<RecontactJob | null>(null);
  const [jobDismissed, setJobDismissed] = useState(false);
  /** Oxirgi ko'rilgan holat — "running → tugadi" o'tishini bir marta ushlash uchun. */
  const prevStatus = useRef<RecontactJob['status'] | null>(null);

  const applyJob = (next: RecontactJob | null): void => {
    setJob(next);
    const was = prevStatus.current;
    prevStatus.current = next?.status ?? null;
    // Job tugadi — xabar ketgan suhbatlar ro'yxatdan chiqishi kerak.
    if (was === 'running' && next && next.status !== 'running') {
      void queryClient.invalidateQueries({ queryKey: ['recontact'] });
    }
  };

  useQuery({
    queryKey: ['recontact-bulk'],
    queryFn: async () => {
      const data = await recontactApi.bulk();
      applyJob(data.job);
      return data;
    },
    // Socket uzilib qolsa ham progress to'xtab qolmasin.
    refetchInterval: job?.status === 'running' ? 15_000 : false,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    const socket = getSocket();
    const onEvent = (event: unknown): void => {
      if (!isRecontactProgress(event)) return;
      applyJob(event.job);
      setJobDismissed(false);
    };
    socket.on('event', onEvent);
    return () => {
      socket.off('event', onEvent);
    };
    // applyJob faqat setState va ref ishlatadi — qayta obuna shart emas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);

  const running = job?.status === 'running';

  // ─── Filtr va belgilash ───────────────────────────────────────────────
  const items = useMemo(() => listQuery.data?.items ?? [], [listQuery.data]);
  // Tur filtri URL'da (`?tur=`): chatdan "Orqaga" qaytganda yoki F5 da
  // operator tanlagan tur saqlanib qolsin. `tab` parametriga tegilmaydi.
  const [searchParams, setSearchParams] = useSearchParams();
  const turParam = searchParams.get('tur');
  const kind: '' | RecontactKind = (RECONTACT_KINDS as readonly string[]).includes(turParam ?? '')
    ? (turParam as RecontactKind)
    : '';
  const setKind = (next: '' | RecontactKind): void => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next) p.set('tur', next);
        else p.delete('tur');
        return p;
      },
      { replace: true },
    );
  };
  const [checked, setChecked] = useState<Set<string>>(new Set());
  // Suhbatni sahifadan chiqmasdan ko'rish paneli — conversationId.
  const [previewId, setPreviewId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<RecontactKind, number> = { vada_buzilgan: 0, sana_yoq: 0, javobsiz: 0, oqilmagan: 0 };
    for (const it of items) c[it.kind] += 1;
    return c;
  }, [items]);

  const filtered = useMemo(
    () => (kind ? items.filter((it) => it.kind === kind) : items),
    [items, kind],
  );

  // Ro'yxat yangilanganda endi unda yo'q suhbatlar belgidan tushadi —
  // aks holda ko'rinmaydigan suhbatga ham yuborilib ketardi.
  useEffect(() => {
    setChecked((prev) => {
      const alive = new Set(items.map((it) => it.conversationId));
      const next = new Set([...prev].filter((id) => alive.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  const allFilteredChecked =
    filtered.length > 0 && filtered.every((it) => checked.has(it.conversationId));

  const nameById = useMemo(
    () => new Map(items.map((it) => [it.conversationId, it.clientName])),
    [items],
  );

  // ─── Mavzu ────────────────────────────────────────────────────────────
  const topics = topicsQuery.data?.items ?? [];
  const [topicChoice, setTopicChoice] = useState('');
  const [customText, setCustomText] = useState('');
  const selectedTopic = topics.find((t) => t.id === topicChoice) ?? null;

  const body: RecontactBulkBody | null =
    topicChoice === CUSTOM
      ? customText.trim()
        ? { conversationIds: [...checked], instruction: customText.trim() }
        : null
      : selectedTopic
        ? { conversationIds: [...checked], topicId: selectedTopic.id }
        : null;

  const [confirmOpen, setConfirmOpen] = useState(false);

  const start = useMutation({
    mutationFn: (b: RecontactBulkBody) => recontactApi.startBulk(b),
    onSuccess: (data) => {
      applyJob(data.job);
      setJobDismissed(false);
      setConfirmOpen(false);
      setChecked(new Set());
    },
  });

  const stop = useMutation({ mutationFn: recontactApi.stopBulk });

  // ─── Ko'rinish ────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 border-b border-ink-800 px-4 py-3 md:px-6">
        {job && !jobDismissed ? (
          <JobCard
            job={job}
            currentName={job.current ? (nameById.get(job.current) ?? null) : null}
            canStop={canSend}
            stopping={stop.isPending}
            stopError={stop.error}
            onStop={() => stop.mutate()}
            onDismiss={() => setJobDismissed(true)}
          />
        ) : null}

        {/* Tur bo'yicha filtr. */}
        <div className="flex flex-wrap gap-1">
          <FilterChip active={kind === ''} onClick={() => setKind('')} label="Hammasi" count={items.length} />
          {RECONTACT_KINDS.map((k) => (
            <FilterChip
              key={k}
              active={kind === k}
              onClick={() => setKind(k)}
              label={RECONTACT_KIND_LABEL[k]}
              count={counts[k]}
            />
          ))}
        </div>

        {/* Belgilanganlar — mavzu va yuborish. */}
        {canSend && checked.size > 0 ? (
          <div className="space-y-2.5 rounded-xl border border-ink-700 bg-ink-900/60 px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm">
                <span className="font-semibold tabular-nums">{checked.size}</span> ta mijoz belgilandi
              </span>
              <select
                className="input !w-auto text-xs"
                value={topicChoice}
                onChange={(e) => setTopicChoice(e.target.value)}
              >
                <option value="">Mavzu tanlang…</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
                <option value={CUSTOM}>O'zim yozaman</option>
              </select>
              {topicsQuery.isLoading ? <Spinner /> : null}
              <button
                type="button"
                className="btn-primary !py-1 text-xs"
                disabled={!body || running || start.isPending}
                title={running ? 'Navbat tugashini kuting' : undefined}
                onClick={() => setConfirmOpen(true)}
              >
                Yuborish ({checked.size} ta)
              </button>
              <button
                type="button"
                className="btn-ghost !py-1 text-xs"
                onClick={() => setChecked(new Set())}
              >
                Belgini olish
              </button>
            </div>

            {topicsQuery.error ? <ErrorNote error={topicsQuery.error} /> : null}

            {selectedTopic ? (
              <p className="whitespace-pre-wrap rounded-lg border border-ink-800 bg-ink-950/60 px-3 py-2 text-xs text-ink-400">
                {selectedTopic.instruction}
              </p>
            ) : null}

            {topicChoice === CUSTOM ? (
              <div>
                <textarea
                  className="input min-h-[90px] text-xs"
                  maxLength={RECONTACT_INSTRUCTION_MAX}
                  placeholder="Agentga topshiriq: mijozga nima haqida yozsin"
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value.slice(0, RECONTACT_INSTRUCTION_MAX))}
                />
                <p className="mt-1 text-right text-[11px] tabular-nums text-ink-500">
                  {customText.length} / {RECONTACT_INSTRUCTION_MAX}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {listQuery.isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : listQuery.error ? (
          <div className="p-4 md:p-6">
            <ErrorNote error={listQuery.error} />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState title="Hozircha qayta aloqa kerak bo'lgan mijoz yo'q" />
        ) : (
          <div className="table-wrap">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-ink-950 text-[11px] uppercase tracking-wide text-ink-500">
                <tr className="border-b border-ink-800">
                  {canSend ? (
                    <th className="w-9 px-3 py-2.5">
                      <input
                        type="checkbox"
                        title="Ko'rinib turgan hammasini belgilash"
                        checked={allFilteredChecked}
                        onChange={(e) => {
                          const next = new Set(checked);
                          for (const it of filtered) {
                            if (e.target.checked) next.add(it.conversationId);
                            else next.delete(it.conversationId);
                          }
                          setChecked(next);
                        }}
                      />
                    </th>
                  ) : null}
                  <th className="px-3 py-2.5 text-left font-medium">Tur</th>
                  <th className="px-3 py-2.5 text-left font-medium">Mijoz</th>
                  <th className="px-3 py-2.5 text-right font-medium" title="CRM'dagi kechikkan to'lov">
                    Kechikkan to'lov
                  </th>
                  <th className="px-3 py-2.5 text-right font-medium" title="Yakshanba sanalmaydi">
                    Jim
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium">Oxirgi xabar</th>
                  <th className="px-3 py-2.5 text-left font-medium">Oxirgi va'da</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it) => (
                  <tr key={it.conversationId} className="border-b border-ink-800/50 hover:bg-ink-900/60">
                    {canSend ? (
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={checked.has(it.conversationId)}
                          onChange={(e) => {
                            const next = new Set(checked);
                            if (e.target.checked) next.add(it.conversationId);
                            else next.delete(it.conversationId);
                            setChecked(next);
                          }}
                        />
                      </td>
                    ) : null}
                    <td className="px-3 py-2.5">
                      <span className={clsx('chip whitespace-nowrap', RECONTACT_KIND_COLOR[it.kind])}>
                        {RECONTACT_KIND_LABEL[it.kind]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        className="text-left font-medium text-ink-100 hover:text-brand-300 hover:underline"
                        title="Suhbatni ko'rish"
                        onClick={() => setPreviewId(it.conversationId)}
                      >
                        {it.clientName}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums text-red-300">
                      {som(it.overdue)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-ink-400">
                      {it.silentWorkDays} ish kuni
                    </td>
                    <td className="max-w-xs px-3 py-2.5">
                      <button
                        type="button"
                        className="block w-full text-left hover:opacity-80"
                        title="To'liq suhbatni ko'rish"
                        onClick={() => setPreviewId(it.conversationId)}
                      >
                      <p className="truncate text-xs text-ink-300">
                        <span
                          className={it.lastMessageDirection === 'in' ? 'text-emerald-400' : 'text-sky-400'}
                          title={it.lastMessageDirection === 'in' ? 'Mijozdan' : 'Bizdan'}
                        >
                          {it.lastMessageDirection === 'in' ? '← ' : '→ '}
                        </span>
                        {it.lastMessagePreview || '—'}
                      </p>
                      <p className="mt-0.5 text-[10px] text-ink-500">{relative(it.lastMessageAt)}</p>
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                      {it.lastPromise ? (
                        <>
                          <p className="text-ink-300">
                            {dateUz(it.lastPromise.date)} · <span className="tabular-nums">{som(it.lastPromise.amount)}</span>
                          </p>
                          <p
                            className={clsx(
                              'mt-0.5 text-[10px]',
                              it.lastPromise.status === 'broken' ? 'text-red-300' : 'text-ink-500',
                            )}
                          >
                            {PROMISE_STATUS_LABEL[it.lastPromise.status] ?? it.lastPromise.status}
                          </p>
                        </>
                      ) : (
                        <span className="text-ink-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmOpen && body ? (
        <Sheet
          open
          onClose={() => {
            if (!start.isPending) setConfirmOpen(false);
          }}
          title="Qayta aloqa — tasdiqlash"
          maxWidth="max-w-md"
        >
          <div className="space-y-3 p-4 md:p-5">
            <p className="text-sm text-ink-200">
              <span className="font-semibold tabular-nums">{body.conversationIds.length}</span> ta mijozga
              agent mavzu bo'yicha yozadi, ish vaqtida 1-3 daqiqa oraliq bilan.
            </p>
            <p className="whitespace-pre-wrap rounded-lg border border-ink-800 bg-ink-950/60 px-3 py-2 text-xs text-ink-400">
              {'topicId' in body ? (selectedTopic?.title ?? '') : body.instruction}
            </p>
            <p className="text-[11px] text-ink-500">
              Yuborishdan oldin har suhbat qayta tekshiriladi: mijoz yozgan, to'lagan yoki va'da bergan
              bo'lsa, u o'tkazib yuboriladi.
            </p>
            {start.error ? <ErrorNote error={start.error} /> : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn-ghost text-xs"
                disabled={start.isPending}
                onClick={() => setConfirmOpen(false)}
              >
                Bekor qilish
              </button>
              <button
                type="button"
                className="btn-primary text-xs"
                disabled={start.isPending || running}
                onClick={() => start.mutate(body)}
              >
                {start.isPending ? <Spinner /> : null}
                Yuborish ({body.conversationIds.length} ta)
              </button>
            </div>
          </div>
        </Sheet>
      ) : null}
      <RecontactConversationSheet
        item={items.find((it) => it.conversationId === previewId) ?? null}
        checked={previewId ? checked.has(previewId) : false}
        canSelect={canSend}
        onToggle={(on) => {
          if (!previewId) return;
          const next = new Set(checked);
          if (on) next.add(previewId);
          else next.delete(previewId);
          setChecked(next);
        }}
        onClose={() => setPreviewId(null)}
      />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'rounded-lg px-3 py-1.5 text-xs transition-colors',
        active ? 'bg-brand-600 text-white' : 'bg-ink-800/60 text-ink-300 hover:bg-ink-800',
      )}
    >
      {label}
      <span className={clsx('ml-1.5 tabular-nums', active ? 'text-white/70' : 'text-ink-500')}>{count}</span>
    </button>
  );
}

function JobCard({
  job,
  currentName,
  canStop,
  stopping,
  stopError,
  onStop,
  onDismiss,
}: {
  job: RecontactJob;
  currentName: string | null;
  canStop: boolean;
  stopping: boolean;
  stopError: unknown;
  onStop: () => void;
  onDismiss: () => void;
}) {
  const running = job.status === 'running';
  const done = job.sent + job.skipped + job.failed;
  const pct = job.total > 0 ? Math.round((done / job.total) * 100) : 0;
  // Tugagach faqat diqqat talab qiladiganlar ko'rsatiladi.
  const problems = job.results.filter((r) => r.outcome !== 'sent');

  return (
    <div
      className={clsx(
        'rounded-xl border px-4 py-3',
        running
          ? 'border-brand-500/40 bg-brand-500/5'
          : job.status === 'stopped'
            ? 'border-amber-500/40 bg-amber-500/5'
            : 'border-emerald-500/40 bg-emerald-500/5',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {running ? <Spinner /> : null}
          <p className="truncate text-sm">
            {running ? (
              <>
                Qayta aloqa yuborilmoqda
                {currentName ? <span className="text-ink-400"> · hozir: {currentName}</span> : null}
              </>
            ) : job.status === 'stopped' ? (
              <>
                Qayta aloqa to'xtatildi
                {job.stopReason ? <span className="text-ink-400"> · {job.stopReason}</span> : null}
              </>
            ) : (
              'Qayta aloqa tugadi'
            )}
          </p>
        </div>
        {running ? (
          canStop ? (
            <button type="button" className="btn-ghost !py-1 text-xs" disabled={stopping} onClick={onStop}>
              {stopping ? <Spinner /> : null}
              To'xtatish
            </button>
          ) : null
        ) : (
          <button type="button" className="text-ink-500 hover:text-ink-200" onClick={onDismiss}>
            ✕
          </button>
        )}
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-800">
        <div className="h-full bg-brand-500 transition-[width]" style={{ width: `${pct}%` }} />
      </div>

      <p className="mt-1.5 text-xs text-ink-400">
        <span className="tabular-nums">{done}</span> / <span className="tabular-nums">{job.total}</span>
        {' · '}yuborildi <span className="tabular-nums text-emerald-300">{job.sent}</span>
        {' · '}o'tkazildi <span className="tabular-nums text-amber-300">{job.skipped}</span>
        {' · '}xato <span className="tabular-nums text-red-300">{job.failed}</span>
        <span className="text-ink-500"> · {job.startedBy}</span>
      </p>

      {job.resumedCount ? (
        <p className="mt-1 text-[11px] text-ink-500">
          Server yangilandi — navbat to'xtagan joyidan davom etdi
          {job.resumedCount > 1 ? ` (${job.resumedCount} marta)` : ''}.
        </p>
      ) : null}

      {stopError ? (
        <div className="mt-2">
          <ErrorNote error={stopError} />
        </div>
      ) : null}

      {!running && problems.length > 0 ? (
        <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-[11px] text-ink-400">
          {problems.map((r) => (
            <li key={r.conversationId} className="truncate">
              {r.clientName}
              <span className={r.outcome === 'failed' ? 'text-red-300' : 'text-ink-500'}>
                {' '}· {OUTCOME_LABEL[r.outcome]}
                {r.reason ? `: ${r.reason}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
