import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import type { DashboardStats, ConversationState, PeriodStats } from '@/lib/types';
import { som, somShort, STATE_COLOR, STATE_LABEL } from '@/lib/format';
import { EmptyState, StatCard } from '@/components/ui';
import { PeriodPicker, type Period } from '@/components/PeriodPicker';
import { chartColors, useTheme } from '@/store/theme';
import { useIsMobile } from '@/lib/useBreakpoint';

const PIE_COLORS = ['#2b83f0', '#f59e0b', '#8b5cf6', '#10b981', '#ef4444', '#64748b', '#f97316'];

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['stats', 'dashboard'],
    queryFn: () => api.get<{ stats: DashboardStats }>('/stats/dashboard'),
    refetchInterval: 30_000,
  });

  // Sukut — joriy oy: sahifa birinchi ochilganda ham ma'noli raqam kerak.
  const [period, setPeriod] = useState<Period>({ preset: 'this_month' });
  // Grafik ranglari mavzuga qarab: qattiq yozilgan qorong'i ranglar
  // yorug' fonda umuman o'qilmasdi.
  const chart = chartColors(useTheme((s) => s.theme));
  const isMobile = useIsMobile();

  // Tayyor davrlarda faqat nom yuboriladi — sanani server hisoblaydi.
  // "O'z oralig'i" da esa ikkala sana ham to'ldirilgandagina so'raladi,
  // aks holda yarim to'ldirilgan maydonda keraksiz so'rov ketardi.
  const custom = period.preset === 'custom';
  const ready = !custom || Boolean(period.from && period.to);

  const periodQuery = useQuery({
    queryKey: ['stats', 'period', period.preset, period.from, period.to],
    queryFn: () =>
      api.get<PeriodStats>(
        '/stats/period',
        custom ? { from: period.from, to: period.to } : { preset: period.preset },
      ),
    enabled: ready,
    refetchInterval: 60_000,
  });

  const s = data?.stats;
  const p = periodQuery.data;

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="hidden border-b border-ink-800 px-4 py-3 md:block md:px-6 md:py-4">
        <h1 className="text-base font-semibold">Boshqaruv paneli</h1>
        <p className="mt-0.5 text-xs text-ink-500">
          Umumiy kechikkan to'lovlar holati va agentning bugungi faoliyati
        </p>
      </header>

      {isLoading || !s ? (
        <EmptyState title="Yuklanmoqda…" />
      ) : s.clientsTotal === 0 ? (
        <EmptyState
          title="Hali ma'lumot yo'q"
          hint="Debitor eksport faylini yuklang — mijozlar, shartnomalar va to'lovlar shu yerdan ko'rinadi."
          action={
            <Link to="/import" className="btn-primary">
              Faylni import qilish
            </Link>
          }
        />
      ) : (
        <div className="space-y-5 p-4 md:p-6">
          {/* ─── Davr bo'yicha statistika ────────────────────────────── */}
          <div className="card space-y-4">
            <PeriodPicker
              value={period}
              resolved={p ? { from: p.from, to: p.to } : undefined}
              onChange={setPeriod}
            />

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {/*
                Kechikkan to'lov tarixi saqlanmaydi (057-migratsiyadan boshlab yig'ilyapti),
                shuning uchun bu raqam davrga bog'liq EMAS. "hozirgi holat"
                deb yozib qo'yilmasa, operator uni davr raqami deb o'qirdi.
              */}
              <StatCard
                label="Jami kechikkan to'lov"
                value={p ? somShort(p.debtNow.total) : '—'}
                sub="hozirgi holat · davrga bog'liq emas"
                tone="bad"
              />
              <StatCard
                label="Biz undirganimiz"
                value={p ? somShort(p.collectedByUs.amount) : '—'}
                sub={p ? `${p.collectedByUs.clients} ta mijoz` : ''}
                tone="good"
              />
              {/*
                Bu raqam agentning qiymatini o'lchashning teskari tomoni:
                biz yozmagan mijozlar ham to'laydi. Uni ko'rsatmasak,
                undiruvning hammasi agent hisobiga yozilardi.
              */}
              <StatCard
                label="O'zi to'laganlar"
                value={p ? somShort(p.collectedWithoutUs.amount) : '—'}
                sub={p ? `${p.collectedWithoutUs.clients} ta mijoz · biz yozmagan` : ''}
              />
            </div>

            <div>
              <h2 className="text-sm font-medium text-ink-200">Kunlik to'lovlar</h2>
              <p className="mb-4 mt-0.5 text-xs text-ink-500">
                Mijozga birinchi xabar ketgan sanadan keyingi to'lov — bizniki;
                yozilmagan mijozniki — o'zi to'lagan
              </p>
              {periodQuery.isLoading ? (
                <p className="py-10 text-center text-xs text-ink-500">Yuklanmoqda…</p>
              ) : !p || p.daily.length === 0 ? (
                <p className="py-10 text-center text-xs text-ink-500">
                  Bu davrda to'lov bo'lmagan
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={isMobile ? 180 : 240}>
                  <AreaChart data={p.daily}>
                    <defs>
                      <linearGradient id="gByUs" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gSelf" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#64748b" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#64748b" stopOpacity={0} />
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
                    {/* Summalar millionlab — to'liq raqam o'qni yeb qo'yadi. */}
                    <YAxis
                      stroke={chart.axis}
                      fontSize={11}
                      tickFormatter={(v: number) => somShort(v)}
                      width={70}
                    />
                    <Tooltip
                      formatter={(v) => som(Number(v))}
                      contentStyle={{
                        background: chart.tooltipBg,
                        border: `1px solid ${chart.tooltipBorder}`,
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
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
                      dataKey="byUs"
                      name="Biz undirgan"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="url(#gByUs)"
                      dot={{ r: 3, strokeWidth: 0, fill: '#10b981' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="withoutUs"
                      name="O'zi to'lagan"
                      stroke="#64748b"
                      strokeWidth={2}
                      fill="url(#gSelf)"
                      dot={{ r: 3, strokeWidth: 0, fill: '#64748b' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Oyma-oy kechikish"
              value={somShort(s.debtMonthly)}
              sub={`${s.contractsTotal} ta shartnoma · umumiy ${somShort(s.debtTotal)}`}
              tone="bad"
            />
            <StatCard
              label="Va'da qilingan"
              value={somShort(s.debtCollectedPromised)}
              sub={`${s.promisesPending} ta ochiq va'da`}
              tone="good"
            />
            {/*
              Undiruv — va'daning natijasi, shuning uchun aynan uning yonida
              turadi: qancha va'da qilingan / qancha haqiqatan tushgan.
            */}
            <StatCard
              label="Unduruv summasi"
              value={somShort(s.collectedThisMonth)}
              sub={`shu oyda · ${s.collectedClientsThisMonth} ta mijoz to'ladi`}
              tone="good"
            />
            <StatCard
              label="Inson kerak"
              value={s.conversationsNeedingHuman}
              sub={`${s.conversationsTotal} ta suhbatdan`}
              tone={s.conversationsNeedingHuman > 0 ? 'warn' : 'default'}
            />
          </div>

          {/* Beshta: "Unduruv summasi" yuqoriga chiqqach "Mijozlar" shu qatorga tushdi. */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard
              label="Mijozlar"
              value={s.clientsTotal}
              sub={`${s.clientsWithPhone} raqamli · ${s.clientsOnTelegram} Telegramda`}
            />
            <StatCard label="Bugun yuborildi" value={s.messagesSentToday} />
            <StatCard label="Bugun javob keldi" value={s.messagesReceivedToday} />
            <StatCard label="Bajarilgan va'dalar" value={s.promisesKept} tone="good" />
            <StatCard label="Buzilgan va'dalar" value={s.promisesBroken} tone="bad" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="card lg:col-span-2">
              <h2 className="text-sm font-medium text-ink-200">Suhbatlar dinamikasi (14 kun)</h2>
              {/* Raqam odam soni ekanini sarlavhaning o'zi aytmaydi — grafikni
                  xabar soni deb o'qish oson, shuning uchun ochiq yozilgan. */}
              <p className="mb-4 mt-0.5 text-xs text-ink-500">
                Kuniga nechta MIJOZ bilan yozishilgani — xabarlar soni emas
              </p>
              {s.dailyActivity.length === 0 ? (
                <p className="py-10 text-center text-xs text-ink-500">Hali yozishma yo'q</p>
              ) : (
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
                    <Tooltip
                      contentStyle={{
                        background: chart.tooltipBg,
                        border: `1px solid ${chart.tooltipBorder}`,
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
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
              )}
            </div>

            <div className="card">
              <h2 className="mb-4 text-sm font-medium text-ink-200">Suhbat holatlari</h2>
              {s.byState.length === 0 ? (
                <p className="py-10 text-center text-xs text-ink-500">Hali suhbat yo'q</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={isMobile ? 130 : 160}>
                    <PieChart>
                      <Pie
                        data={s.byState}
                        dataKey="count"
                        nameKey="state"
                        innerRadius={45}
                        outerRadius={70}
                        paddingAngle={2}
                      >
                        {s.byState.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: chart.tooltipBg,
                          border: `1px solid ${chart.tooltipBorder}`,
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <ul className="mt-3 space-y-1.5">
                    {s.byState.map((row) => (
                      <li key={row.state} className="flex items-center justify-between text-xs">
                        <span
                          className={`chip ${STATE_COLOR[row.state as ConversationState] ?? 'bg-ink-800 text-ink-300'}`}
                        >
                          {STATE_LABEL[row.state as ConversationState] ?? row.state}
                        </span>
                        <span className="tabular-nums text-ink-300">{row.count}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>

          <div className="card">
            <h2 className="mb-3 text-sm font-medium text-ink-200">Eskalatsiya bosqichlari</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(['soft', 'hard', 'legal'] as const).map((stage) => {
                const row = s.byStage.find((b) => b.stage === stage);
                const labels = { soft: 'Eslatma (0–60 kun)', hard: 'Qat\'iy (60–180)', legal: 'Huquqiy (180+)' };
                return (
                  <div key={stage} className="rounded-lg border border-ink-800 bg-ink-950/50 p-3">
                    <p className="text-[11px] text-ink-500">{labels[stage]}</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">{row?.count ?? 0}</p>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] text-ink-600">
              Oyma-oy kechikish: {som(s.debtMonthly)} · Umumiy kechikish: {som(s.debtTotal)}
              {' '}· Ochiq va'dalar summasi: {som(s.debtCollectedPromised)}
              {' '}· Shu oyda undirilgan: {som(s.collectedThisMonth)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
