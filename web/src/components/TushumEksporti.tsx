import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { som } from '@/lib/format';
import { ErrorNote, Spinner } from '@/components/ui';
import { PeriodPicker, type Period } from '@/components/PeriodPicker';

type Qamrov = 'all' | 'contacted' | 'overdue';

const QAMROVLAR: Array<{ key: Qamrov; label: string }> = [
  { key: 'all', label: 'Hammasi' },
  { key: 'contacted', label: 'Gaplashilganlar' },
  { key: 'overdue', label: 'Kechikkanlar' },
];

interface Summary {
  from: string;
  to: string;
  soni: number;
  summa: number;
}

/**
 * Davr bo'yicha bank to'lovlarini Excelga yuklash.
 *
 * Sukut — o'tgan oy: boshliq odatda tugagan oyni so'raydi. Sanani server
 * hisoblaydi; tugma yonidagi son fayl ichidagi qatorlar soni bilan bir xil
 * so'rovdan keladi.
 */
export function TushumEksporti() {
  const [period, setPeriod] = useState<Period>({ preset: 'last_month' });
  const [qamrov, setQamrov] = useState<Qamrov>('all');
  const [bahsli, setBahsli] = useState(false);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  // Input darhol yangilanadi, so'rovga esa 400 ms tinch turgandan keyin ketadi —
  // aks holda har harfda og'ir hisobot so'rovi yuborilardi.
  useEffect(() => {
    const vaqt = setTimeout(() => setDebouncedQ(q.trim()), 400);
    return () => clearTimeout(vaqt);
  }, [q]);

  const params = {
    preset: period.preset,
    from: period.preset === 'custom' ? period.from : undefined,
    to: period.preset === 'custom' ? period.to : undefined,
    qamrov,
    bahsli: bahsli ? 'true' : 'false',
    q: debouncedQ,
  };

  const summary = useQuery({
    queryKey: ['report-payments-summary', params],
    queryFn: () => api.get<Summary>('/reports/payments/summary', params),
    enabled: period.preset !== 'custom' || Boolean(period.from && period.to),
  });

  const download = useMutation({
    mutationFn: () => api.download('/reports/payments/export', params),
  });

  const s = summary.data;

  return (
    <div className="card space-y-3">
      <p className="text-[11px] uppercase tracking-wide text-ink-500">Tushumlar eksporti</p>

      <PeriodPicker
        value={period}
        resolved={s ? { from: s.from, to: s.to } : undefined}
        onChange={setPeriod}
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <span className="mr-1 text-[11px] uppercase tracking-wide text-ink-500">Qamrov:</span>
          {QAMROVLAR.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setQamrov(o.key)}
              className={
                qamrov === o.key
                  ? 'rounded-md bg-ink-800 px-2.5 py-1 text-[11px] font-medium text-ink-100'
                  : 'rounded-md px-2.5 py-1 text-[11px] font-medium text-ink-500 hover:bg-ink-800/50'
              }
            >
              {o.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 text-xs text-ink-400">
          <input type="checkbox" checked={bahsli} onChange={(e) => setBahsli(e.target.checked)} />
          Bahsli to'lovlarni qo'shish
        </label>

        <input
          className="input !py-1 text-xs md:w-56"
          placeholder="Shartnoma № yoki mijoz"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-ghost text-xs"
          disabled={download.isPending || !s || s.soni === 0}
          onClick={() => download.mutate()}
        >
          {download.isPending ? <Spinner /> : null}
          Excelga yuklash{s ? ` (${s.soni})` : ''}
        </button>
        {summary.isFetching ? <Spinner /> : null}
        {s ? <span className="text-xs text-emerald-400">{som(s.summa)}</span> : null}
      </div>

      {summary.error ? <ErrorNote error={summary.error} /> : null}
      {download.error ? <ErrorNote error={download.error} /> : null}
    </div>
  );
}
