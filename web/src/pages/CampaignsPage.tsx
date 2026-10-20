import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { useCan } from '@/store/auth';
import type { Campaign, ClientSource, Course, Page, XaridBosqichi } from '@/lib/types';
import { BOSQICH_YORLIGI, MANBA_YORLIGI, XARID_BOSQICHLARI } from '@/lib/xarid';
import { dateUz } from '@/lib/format';
import { EmptyState, ErrorNote, Spinner } from '@/components/ui';

interface Filters {
  stage: XaridBosqichi[];
  source: ClientSource[];
  courseId?: string;
  onlyWithoutConversation: boolean;
  limit?: number;
}

const MANBALAR = Object.keys(MANBA_YORLIGI) as ClientSource[];

/** Ro'yxatda bor bo'lsa olib tashlaydi, yo'q bo'lsa qo'shadi. */
function almashtir<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

const STATUS_LABEL: Record<Campaign['status'], string> = {
  draft: 'Qoralama',
  running: 'Ishlayapti',
  paused: 'Pauza',
  completed: 'Tugadi',
  cancelled: 'Bekor qilindi',
};

const STATUS_COLOR: Record<Campaign['status'], string> = {
  draft: 'bg-ink-800 text-ink-300',
  running: 'bg-emerald-500/15 text-emerald-300',
  paused: 'bg-amber-500/15 text-amber-300',
  completed: 'bg-sky-500/15 text-sky-300',
  cancelled: 'bg-red-500/15 text-red-300',
};

export default function CampaignsPage() {
  const queryClient = useQueryClient();
  const canCreate = useCan('campaigns.create');
  const canControl = useCan('campaigns.control');
  const writable = canCreate;

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [filters, setFilters] = useState<Filters>({
    stage: ['yangi'],
    source: [],
    onlyWithoutConversation: true,
    limit: 200,
  });
  const [dailyLimit, setDailyLimit] = useState(40);

  const listQuery = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get<Page<Campaign>>('/campaigns'),
    refetchInterval: 15_000,
  });

  const coursesQuery = useQuery({
    queryKey: ['courses'],
    queryFn: () => api.get<{ items: Course[] }>('/courses'),
    enabled: showForm,
  });

  // Bo'sh ro'yxat va bo'sh kurs serverga yuborilmaydi — "filtr yo'q" ma'nosida.
  const payloadFilters = {
    ...(filters.stage.length ? { stage: filters.stage } : {}),
    ...(filters.source.length ? { source: filters.source } : {}),
    ...(filters.courseId ? { courseId: filters.courseId } : {}),
    ...(filters.onlyWithoutConversation ? { onlyWithoutConversation: true } : {}),
    ...(filters.limit ? { limit: filters.limit } : {}),
  };

  const previewMutation = useMutation({
    mutationFn: () => api.post<{ count: number }>('/campaigns/preview', payloadFilters),
  });

  const createMutation = useMutation({
    mutationFn: (startNow: boolean) =>
      api.post<{ campaign: Campaign; targetsAdded: number }>('/campaigns', {
        name,
        filters: payloadFilters,
        dailyLimit,
        startNow,
      }),
    onSuccess: () => {
      setShowForm(false);
      setName('');
      void queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: (payload: { id: string; status: Campaign['status'] }) =>
      api.post(`/campaigns/${payload.id}/status`, { status: payload.status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  });

  const campaigns = listQuery.data?.items ?? [];

  return (
    <div className="flex-1 overflow-y-auto">
      <header
        className={clsx(
          'flex items-center justify-between border-b border-ink-800 px-4 py-3 md:px-6 md:py-4',
          writable ? 'max-md:justify-end' : 'max-md:hidden',
        )}
      >
        <div className="hidden md:block">
          <h1 className="text-base font-semibold">Kampaniyalar</h1>
          <p className="mt-0.5 text-xs text-ink-500">
            Filtr bo'yicha mijozlar navbatga qo'yiladi va sekin tempda yoziladi
          </p>
        </div>
        {writable ? (
          <button type="button" className="btn-primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Yopish' : 'Yangi kampaniya'}
          </button>
        ) : null}
      </header>

      {showForm ? (
        <div className="border-b border-ink-800 bg-ink-900/40 px-4 py-4 md:px-6 md:py-5">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-3">
              <label className="label">Kampaniya nomi</label>
              <input
                className="input max-w-md"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Masalan: Oktyabr — yangi reklama mijozlari"
              />
            </div>

            <div>
              <label className="label">Bosqich</label>
              <div className="flex flex-wrap gap-1.5">
                {XARID_BOSQICHLARI.map((b) => (
                  <button
                    key={b}
                    type="button"
                    className={clsx(
                      'chip cursor-pointer border',
                      filters.stage.includes(b)
                        ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                        : 'border-ink-800 bg-ink-900 text-ink-400',
                    )}
                    onClick={() => setFilters((f) => ({ ...f, stage: almashtir(f.stage, b) }))}
                  >
                    {BOSQICH_YORLIGI[b]}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-ink-600">Hech biri tanlanmasa — hamma bosqich</p>
            </div>
            <div>
              <label className="label">Manba</label>
              <div className="flex flex-wrap gap-1.5">
                {MANBALAR.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={clsx(
                      'chip cursor-pointer border',
                      filters.source.includes(m)
                        ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                        : 'border-ink-800 bg-ink-900 text-ink-400',
                    )}
                    onClick={() => setFilters((f) => ({ ...f, source: almashtir(f.source, m) }))}
                  >
                    {MANBA_YORLIGI[m]}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-ink-600">Hech biri tanlanmasa — hamma manba</p>
            </div>
            <div>
              <label className="label">Kurs</label>
              <select
                className="input"
                value={filters.courseId ?? ''}
                onChange={(e) => setFilters((f) => ({ ...f, courseId: e.target.value || undefined }))}
              >
                <option value="">Hamma kurs</option>
                {(coursesQuery.data?.items ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Nechta mijoz (maks.)</label>
              <input
                type="number"
                className="input"
                value={filters.limit ?? ''}
                onChange={(e) => setFilters((f) => ({ ...f, limit: numOrUndef(e.target.value) }))}
              />
            </div>
            <div>
              <label className="label">Kunlik limit</label>
              <input
                type="number"
                className="input"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(Number(e.target.value) || 1)}
              />
              <p className="mt-1 text-[11px] text-ink-600">
                Telegram bloklanmasligi uchun 30–50 tavsiya etiladi
              </p>
            </div>
            <div className="flex flex-col justify-center gap-2">
              <label className="flex items-center gap-2 text-sm text-ink-300">
                <input
                  type="checkbox"
                  checked={filters.onlyWithoutConversation}
                  onChange={(e) => setFilters((f) => ({ ...f, onlyWithoutConversation: e.target.checked }))}
                />
                Faqat suhbati yo'qlar
              </label>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => previewMutation.mutate()}
              disabled={previewMutation.isPending}
            >
              {previewMutation.isPending ? <Spinner /> : null}
              Qamrovni ko'rish
            </button>
            {previewMutation.data ? (
              <span className="text-sm text-ink-300">
                <strong className="text-brand-400">{previewMutation.data.count}</strong> ta mijoz mos keladi
              </span>
            ) : null}

            <div className="ml-auto flex gap-2">
              <button
                type="button"
                className="btn-ghost"
                disabled={!name.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate(false)}
              >
                Qoralama sifatida saqlash
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!name.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate(true)}
              >
                {createMutation.isPending ? <Spinner /> : null}
                Yaratish va ishga tushirish
              </button>
            </div>
          </div>

          {createMutation.error ? (
            <div className="mt-3">
              <ErrorNote error={createMutation.error} />
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="p-4 md:p-6">
        {listQuery.isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : campaigns.length === 0 ? (
          <EmptyState
            title="Kampaniya yo'q"
            hint="Yangi kampaniya yarating — filtrga mos mijozlar navbatga qo'yiladi."
          />
        ) : (
          <div className="space-y-3">
            {campaigns.map((c) => {
              const stats = c.stats ?? { total: 0, pending: 0, sent: 0, skipped: 0, failed: 0 };
              const done = stats.total - stats.pending;
              const percent = stats.total ? Math.round((done / stats.total) * 100) : 0;

              return (
                <div key={c.id} className="card">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium">{c.name}</h3>
                        <span className={clsx('chip', STATUS_COLOR[c.status])}>{STATUS_LABEL[c.status]}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-ink-500">
                        {dateUz(c.createdAt)} · kunlik limit {c.dailyLimit} · {c.windowStart}–{c.windowEnd}
                      </p>
                    </div>

                    {canControl ? (
                      <div className="flex gap-2">
                        {c.status === 'running' ? (
                          <button
                            type="button"
                            className="btn-ghost !py-1 text-xs"
                            onClick={() => statusMutation.mutate({ id: c.id, status: 'paused' })}
                          >
                            Pauza
                          </button>
                        ) : c.status === 'paused' || c.status === 'draft' ? (
                          <button
                            type="button"
                            className="btn-primary !py-1 text-xs"
                            onClick={() => statusMutation.mutate({ id: c.id, status: 'running' })}
                          >
                            Ishga tushirish
                          </button>
                        ) : null}
                        {c.status !== 'completed' && c.status !== 'cancelled' ? (
                          <button
                            type="button"
                            className="btn-ghost !py-1 text-xs"
                            onClick={() => statusMutation.mutate({ id: c.id, status: 'cancelled' })}
                          >
                            Bekor qilish
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-800">
                    <div className="h-full bg-brand-500 transition-all" style={{ width: `${percent}%` }} />
                  </div>

                  <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-ink-500">
                    <span>Jami: <strong className="text-ink-200">{stats.total}</strong></span>
                    <span>Yuborildi: <strong className="text-emerald-300">{stats.sent}</strong></span>
                    <span>Navbatda: <strong className="text-ink-200">{stats.pending}</strong></span>
                    <span>O'tkazildi: <strong className="text-amber-300">{stats.skipped}</strong></span>
                    <span>Xato: <strong className="text-red-300">{stats.failed}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const numOrUndef = (v: string): number | undefined => (v === '' ? undefined : Number(v));
