import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { useCan } from '@/store/auth';
import type { Campaign, Page } from '@/lib/types';
import { dateUz } from '@/lib/format';
import { EmptyState, ErrorNote, Spinner } from '@/components/ui';

interface Filters {
  minDebt?: number;
  minDaysOverdue?: number;
  maxDaysOverdue?: number;
  onlyWithPhone: boolean;
  excludeContacted: boolean;
  limit?: number;
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
    minDebt: 1_000_000,
    minDaysOverdue: 1,
    onlyWithPhone: true,
    excludeContacted: true,
    limit: 200,
  });
  const [dailyLimit, setDailyLimit] = useState(40);

  const listQuery = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get<Page<Campaign>>('/campaigns'),
    refetchInterval: 15_000,
  });

  const previewMutation = useMutation({
    mutationFn: () => api.post<{ count: number }>('/campaigns/preview', filters),
  });

  const createMutation = useMutation({
    mutationFn: (startNow: boolean) =>
      api.post<{ campaign: Campaign; targetsAdded: number }>('/campaigns', {
        name,
        filters,
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
            Filtr bo'yicha debitorlar navbatga qo'yiladi va sekin tempda yoziladi
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
                placeholder="Masalan: Avgust — 3 oydan ortiq kechikkanlar"
              />
            </div>

            <div>
              <label className="label" title="Долг (мес.) bo'yicha — agent shu summani aytadi">
                Minimal oylik kechikish (so'm)
              </label>
              <input
                type="number"
                className="input"
                value={filters.minDebt ?? ''}
                onChange={(e) => setFilters((f) => ({ ...f, minDebt: numOrUndef(e.target.value) }))}
              />
            </div>
            <div>
              <label className="label">Kechikish (kundan)</label>
              <input
                type="number"
                className="input"
                value={filters.minDaysOverdue ?? ''}
                onChange={(e) => setFilters((f) => ({ ...f, minDaysOverdue: numOrUndef(e.target.value) }))}
              />
            </div>
            <div>
              <label className="label">Kechikish (kungacha)</label>
              <input
                type="number"
                className="input"
                value={filters.maxDaysOverdue ?? ''}
                onChange={(e) => setFilters((f) => ({ ...f, maxDaysOverdue: numOrUndef(e.target.value) }))}
              />
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
                  checked={filters.onlyWithPhone}
                  onChange={(e) => setFilters((f) => ({ ...f, onlyWithPhone: e.target.checked }))}
                />
                Faqat raqami borlar
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-300">
                <input
                  type="checkbox"
                  checked={filters.excludeContacted}
                  onChange={(e) => setFilters((f) => ({ ...f, excludeContacted: e.target.checked }))}
                />
                Avval yozilganlarni chiqarib tashlash
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
            hint="Yangi kampaniya yarating — filtrga mos debitorlar navbatga qo'yiladi."
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
