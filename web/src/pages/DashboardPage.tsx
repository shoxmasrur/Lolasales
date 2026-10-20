import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import type { ClientSource, DashboardStats } from '@/lib/types';
import { som, somShort } from '@/lib/format';
import { BOSQICH_CLASS, MANBA_YORLIGI } from '@/lib/xarid';
import { EmptyState, StatCard } from '@/components/ui';
import { chartColors, useTheme } from '@/store/theme';
import { useIsMobile } from '@/lib/useBreakpoint';

const MANBALAR: ClientSource[] = ['reklama', 'guruh', 'raqam', 'qolda'];

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['stats', 'dashboard'],
    queryFn: () => api.get<{ stats: DashboardStats }>('/stats/dashboard'),
    refetchInterval: 30_000,
  });

  // Grafik ranglari mavzuga qarab: qattiq yozilgan qorong'i ranglar
  // yorug' fonda umuman o'qilmasdi.
  const chart = chartColors(useTheme((s) => s.theme));
  const isMobile = useIsMobile();

  const s = data?.stats;

  const bugungiJami = s ? Object.values(s.bugunManbalar).reduce((sum, n) => sum + (n ?? 0), 0) : 0;

  const tooltipStyle = {
    background: chart.tooltipBg,
    border: `1px solid ${chart.tooltipBorder}`,
    borderRadius: 8,
    fontSize: 12,
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="hidden border-b border-ink-800 px-4 py-3 md:block md:px-6 md:py-4">
        <h1 className="text-base font-semibold">Boshqaruv paneli</h1>
        <p className="mt-0.5 text-xs text-ink-500">
          Sotuv voronkasi, bugungi mijozlar va to'lovlar
        </p>
      </header>

      {isLoading || !s ? (
        <EmptyState title="Yuklanmoqda…" />
      ) : s.clientsTotal === 0 ? (
        <EmptyState
          title="Hali mijoz yo'q"
          hint="Telegram akkauntni ulang va kurs qo'shing — reklamadan yozganlar, guruh izohlari yoki import qilingan raqamlar shu yerda ko'rinadi."
          action={
            <Link to="/import" className="btn-primary">
              Mijozlarni import qilish
            </Link>
          }
        />
      ) : (
        <div className="space-y-5 p-4 md:p-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              label="Bugun yangi mijozlar"
              value={bugungiJami}
              sub={MANBALAR.map((m) => `${MANBA_YORLIGI[m]} ${s.bugunManbalar[m] ?? 0}`).join(' · ')}
            />
            <StatCard
              label="Bugun tasdiqlangan to'lovlar"
              value={somShort(s.bugunTolovlar.summa)}
              sub={`${s.bugunTolovlar.soni} ta chek · ${som(s.bugunTolovlar.summa)}`}
              tone="good"
            />
            <StatCard
              label="Navbatdagi cheklar"
              value={
                s.navbatdagiCheklar > 0 ? (
                  <Link to="/chat?filter=receipt" className="hover:underline">
                    {s.navbatdagiCheklar}
                  </Link>
                ) : (
                  0
                )
              }
              sub="menejer tasdig'ini kutmoqda"
              tone={s.navbatdagiCheklar > 0 ? 'warn' : 'default'}
            />
          </div>

          <div className="card">
            <h2 className="text-sm font-medium text-ink-200">Sotuv voronkasi</h2>
            <p className="mb-4 mt-0.5 text-xs text-ink-500">
              Har bir mijozning joriy xaridi qaysi bosqichda. Ulush — rad etilganlarsiz jami xaridga nisbatan
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {s.voronka.map((v) => (
                <div
                  key={v.stage}
                  className="flex min-w-[104px] flex-1 flex-col justify-between rounded-lg border border-ink-800 p-3"
                >
                  <span className={BOSQICH_CLASS[v.stage]}>{v.label}</span>
                  <div className="mt-3 text-xl font-semibold tabular-nums">{v.count}</div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded bg-ink-800">
                    <div
                      className={`h-full ${v.stage === 'rad_etdi' ? 'bg-red-400' : 'bg-brand-500'}`}
                      style={{ width: `${Math.round(v.ulush * 100)}%` }}
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-ink-500">{Math.round(v.ulush * 100)}%</div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Inson kerak"
              value={s.conversationsNeedingHuman}
              sub={`${s.conversationsTotal} ta suhbatdan`}
              tone={s.conversationsNeedingHuman > 0 ? 'warn' : 'default'}
            />
            <StatCard label="Mijozlar" value={s.clientsTotal} sub={`${s.clientsOnTelegram} Telegramda`} />
            <StatCard label="Bugun yuborildi" value={s.messagesSentToday} />
            <StatCard label="Bugun javob keldi" value={s.messagesReceivedToday} />
          </div>

          <div className="card">
            <h2 className="text-sm font-medium text-ink-200">Suhbatlar dinamikasi (14 kun)</h2>
            {/* Raqam odam soni ekanini sarlavhaning o'zi aytmaydi — grafikni
                xabar soni deb o'qish oson, shuning uchun ochiq yozilgan. */}
            <p className="mb-4 mt-0.5 text-xs text-ink-500">
              Kuniga nechta MIJOZ bilan yozishilgani — xabarlar soni emas
            </p>
            <ResponsiveContainer width="100%" height={isMobile ? 170 : 220}>
              <AreaChart data={s.dailyActivity}>
                <defs>
                  <linearGradient id="gSent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2b83f0" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#2b83f0" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gRecv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                <XAxis
                  dataKey="day"
                  stroke={chart.axis}
                  fontSize={11}
                  tickFormatter={(v: string) => v.slice(5)}
                  interval={isMobile ? 'preserveStartEnd' : undefined}
                />
                <YAxis stroke={chart.axis} fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={28}
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, color: chart.legend }}
                />
                <Area
                  type="monotone"
                  dataKey="writtenTo"
                  name="Yozdik (mijoz)"
                  stroke="#2b83f0"
                  strokeWidth={2}
                  fill="url(#gSent)"
                  dot={{ r: 3, strokeWidth: 0, fill: '#2b83f0' }}
                />
                <Area
                  type="monotone"
                  dataKey="replied"
                  name="Javob berdi (mijoz)"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#gRecv)"
                  dot={{ r: 3, strokeWidth: 0, fill: '#10b981' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
