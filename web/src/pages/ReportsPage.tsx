import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCan } from '@/store/auth';
import { som } from '@/lib/format';
import { EmptyState, ErrorNote, Spinner } from '@/components/ui';
import { TushumEksporti } from '@/components/TushumEksporti';

interface Buckets {
  d0_7: number;
  d8_30: number;
  d31plus: number;
}

interface GroupResult {
  clients: number;
  paidClients: number;
  amount: number;
  buckets: Buckets;
}

interface AttributionReport {
  from: string;
  to: string;
  contacted: GroupResult;
  notContacted: GroupResult;
}

interface CampaignRow {
  campaignId: string;
  name: string;
  sent: number;
  paidClients: number;
  amount: number;
}

interface UslubQatori {
  styleVersion: 'v1' | 'v2';
  xabarlar: number;
  javob3Kun: number;
  vadaOlingan: number;
  tolov14Kun: number;
  ortachaSoz: number;
  qisqaUlush: number;
}

interface AgentHisobotQatori {
  agentKaliti: string;
  agentIsmi: string;
  qongiroqlar: number;
  gaplashildi: number;
  kotarmadi: number;
  band: number;
  boshqaOdam: number;
  raqamNotogri: number;
  vadalar: number;
  bajarilgan: number;
  buzilgan: number;
  jamiSoniya: number;
}

const BUCKETS: Array<{ key: keyof Buckets; label: string }> = [
  { key: 'd0_7', label: '0–7 kun' },
  { key: 'd8_30', label: '8–30 kun' },
  { key: 'd31plus', label: '31+ kun' },
];

const pct = (a: number, b: number): string => (b ? `${Math.round((a / b) * 100)}%` : '—');

/** Sukut: oxirgi 30 kun. */
function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default function ReportsPage() {
  const canView = useCan('reports.view');
  const [range, setRange] = useState(defaultRange);

  const report = useQuery({
    queryKey: ['report-attribution', range.from, range.to],
    queryFn: () => api.get<AttributionReport>('/reports/attribution', range),
    enabled: canView,
  });

  const campaigns = useQuery({
    queryKey: ['report-campaigns'],
    queryFn: () => api.get<{ items: CampaignRow[] }>('/reports/campaigns'),
    enabled: canView,
  });

  const uslub = useQuery({
    queryKey: ['report-uslub', range.from, range.to],
    queryFn: () => api.get<{ items: UslubQatori[] }>('/reports/uslub', range),
    enabled: canView,
  });

  const qongiroqlar = useQuery({
    queryKey: ['report-qongiroqlar', range.from, range.to],
    queryFn: () => api.get<{ items: AgentHisobotQatori[] }>('/reports/qongiroqlar', range),
    enabled: canView,
  });

  if (!canView) {
    return (
      <EmptyState
        title="Ruxsat yo'q"
        hint="Bu sahifa uchun «Tushum hisoboti» ruxsati kerak."
      />
    );
  }

  const data = report.data;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="hidden md:block">
        <h1 className="text-lg font-medium text-ink-100">Tushum hisoboti</h1>
        {/* Bu izoh MAJBURIY. O'lchov qoidasi sodda ("gaplashgandan keyingi
            har qanday to'lov"), shuning uchun raqam katta chiqadi va uni
            cheklovsiz o'qish noto'g'ri qarorga olib keladi. */}
        <p className="mt-1 max-w-3xl text-xs leading-relaxed text-ink-500">
          Biz gaplashgan mijozlardan tushgan to'lov.{' '}
          <span className="text-ink-300">Bu sababni isbotlamaydi</span>: guruhlar teng
          emas — biz odatda eng katta kechikishi borlardan boshlaymiz, Telegramda
          topilgan mijoz boshqa xulq-atvorga ega bo'lishi mumkin, va bir vaqtda
          boshqa kanallar ham ishlaydi. Raqamni shu cheklov bilan o'qing.
        </p>
      </div>

      <TushumEksporti />

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-ink-500">
          Boshlanish
          <input
            type="date"
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className="mt-1 block rounded-lg border border-ink-800 bg-ink-950 px-2 py-1 text-xs text-ink-200"
          />
        </label>
        <label className="text-xs text-ink-500">
          Tugash
          <input
            type="date"
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className="mt-1 block rounded-lg border border-ink-800 bg-ink-950 px-2 py-1 text-xs text-ink-200"
          />
        </label>
      </div>

      {report.isLoading ? <Spinner /> : null}
      {report.error ? <ErrorNote error={report.error} /> : null}

      {data ? (
        <>
          <div className="table-wrap rounded-xl border border-ink-800">
            <table className="w-full text-xs">
              <thead className="bg-ink-900/60 uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Guruh</th>
                  <th className="px-3 py-2 text-right font-medium">Mijozlar</th>
                  <th className="px-3 py-2 text-right font-medium">To'laganlar</th>
                  <th className="px-3 py-2 text-right font-medium">Ulush</th>
                  <th className="px-4 py-2 text-right font-medium">Summa</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['Gaplashilgan', data.contacted],
                    ['Gaplashilmagan', data.notContacted],
                  ] as const
                ).map(([label, g]) => (
                  <tr key={label} className="border-t border-ink-800/60">
                    <td className="px-4 py-2 text-ink-200">{label}</td>
                    <td className="px-3 py-2 text-right text-ink-400">{g.clients}</td>
                    <td className="px-3 py-2 text-right text-ink-400">{g.paidClients}</td>
                    <td className="px-3 py-2 text-right text-ink-200">
                      {pct(g.paidClients, g.clients)}
                    </td>
                    <td className="px-4 py-2 text-right text-emerald-400">{som(g.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.notContacted.clients === 0 ? (
            <p className="text-[11px] text-amber-400">
              Solishtirish guruhi bo'sh — kechikkan to'lovi bor hamma mijoz bilan
              gaplashilgan. Bu holda raqamni faqat quyidagi vaqt guruhlari orqali
              baholash mumkin.
            </p>
          ) : null}

          <div>
            <p className="mb-2 text-[11px] uppercase tracking-wide text-ink-500">
              Gaplashilganlar — xabardan keyin qancha vaqtda to'langan
            </p>
            {/* Yaqin kunlardagi to'lov bilan 90 kundan keyingisi bir xil
                vaznda emas — o'qiyotgan odam buni ko'rib turishi kerak. */}
            <div className="grid gap-3 sm:grid-cols-3">
              {BUCKETS.map((b) => (
                <div key={b.key} className="rounded-xl border border-ink-800 p-3">
                  <p className="text-[10px] uppercase text-ink-500">{b.label}</p>
                  <p className="mt-1 text-sm text-ink-200">{som(data.contacted.buckets[b.key])}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {campaigns.data?.items.length ? (
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-wide text-ink-500">Kampaniyalar</p>
          <div className="table-wrap rounded-xl border border-ink-800">
            <table className="w-full text-xs">
              <thead className="bg-ink-900/60 uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Kampaniya</th>
                  <th className="px-3 py-2 text-right font-medium">Yuborildi</th>
                  <th className="px-3 py-2 text-right font-medium">To'laganlar</th>
                  <th className="px-4 py-2 text-right font-medium">Summa</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.data.items.map((c) => (
                  <tr key={c.campaignId} className="border-t border-ink-800/60">
                    <td className="px-4 py-1.5 text-ink-300">{c.name}</td>
                    <td className="px-3 py-1.5 text-right text-ink-400">{c.sent}</td>
                    <td className="px-3 py-1.5 text-right text-ink-400">
                      {c.paidClients} ({pct(c.paidClients, c.sent)})
                    </td>
                    <td className="px-4 py-1.5 text-right text-emerald-400">{som(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-[11px] text-ink-600">
            Mijoz bir necha kampaniyaga tushgan bo'lsa, to'lovi har biriga alohida
            yoziladi — kampaniyalarni bir-biriga qo'shib bo'lmaydi.
          </p>
        </div>
      ) : null}

      {uslub.data?.items.length ? (
        <div>
          <p className="mb-2 text-[11px] uppercase tracking-wide text-ink-500">
            Uslub versiyalarini taqqoslash (v1 / v2)
          </p>
          <div className="table-wrap rounded-xl border border-ink-800">
            <table className="w-full text-xs">
              <thead className="bg-ink-900/60 uppercase tracking-wide text-ink-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Ko'rsatkich</th>
                  {uslub.data.items.map((u) => (
                    <th key={u.styleVersion} className="px-3 py-2 text-right font-medium">
                      {u.styleVersion}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['Xabarlar', (u: UslubQatori) => u.xabarlar],
                    ['Javob 3 kun ichida', (u: UslubQatori) => `${u.javob3Kun}%`],
                    ["Va'da olingan", (u: UslubQatori) => `${u.vadaOlingan}%`],
                    ["To'lov 14 kun ichida", (u: UslubQatori) => `${u.tolov14Kun}%`],
                    ["O'rtacha so'z", (u: UslubQatori) => u.ortachaSoz],
                    ['Qisqa xabar ulushi', (u: UslubQatori) => `${u.qisqaUlush}%`],
                  ] as const
                ).map(([label, get]) => (
                  <tr key={label} className="border-t border-ink-800/60">
                    <td className="px-4 py-2 text-ink-200">{label}</td>
                    {uslub.data?.items.map((u) => (
                      <td key={u.styleVersion} className="px-3 py-2 text-right text-ink-300">
                        {get(u)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Bu izoh MAJBURIY (Task 8 briefi): to'lov ko'rsatkichlari suhbat
              darajasida, suhbatning oxirgi tamg'alangan xabari orqali
              bog'lanadi — bu taxminiy bog'lanish, sabab isboti emas. */}
          <p className="mt-1 text-[11px] text-ink-600">
            Bu kuzatuv, tajriba emas: akkauntlar va mijozlar teng taqsimlanmagan.
          </p>
        </div>
      ) : null}

      <div>
        <p className="mb-2 text-[11px] uppercase tracking-wide text-ink-500">
          Ovozli agentlar (qo'ng'iroqlar)
        </p>
        {qongiroqlar.isLoading ? <Spinner /> : null}
        {qongiroqlar.error ? <ErrorNote error={qongiroqlar.error} /> : null}
        {qongiroqlar.data && !qongiroqlar.data.items.length ? (
          <EmptyState title="Bu davrda ovozli agent qo'ng'iroq qilmagan" />
        ) : null}
        {qongiroqlar.data?.items.length ? (
          <>
            <div className="table-wrap rounded-xl border border-ink-800">
              <table className="w-full text-xs">
                <thead className="bg-ink-900/60 uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Agent</th>
                    <th className="px-3 py-2 text-right font-medium">Qo'ng'iroqlar</th>
                    <th className="px-3 py-2 text-right font-medium">Gaplashildi</th>
                    <th className="px-3 py-2 text-right font-medium">Ko'tarmadi/band</th>
                    <th className="px-3 py-2 text-right font-medium">Boshqa odam</th>
                    <th className="px-3 py-2 text-right font-medium">Raqam noto'g'ri</th>
                    <th className="px-3 py-2 text-right font-medium">Va'dalar</th>
                    <th className="px-3 py-2 text-right font-medium">Bajarilgan</th>
                    <th className="px-3 py-2 text-right font-medium">Buzilgan</th>
                    <th className="px-4 py-2 text-right font-medium">Umumiy vaqt</th>
                  </tr>
                </thead>
                <tbody>
                  {qongiroqlar.data.items.map((a) => (
                    <tr key={a.agentKaliti} className="border-t border-ink-800/60">
                      <td className="px-4 py-1.5 text-ink-300">
                        {a.agentIsmi}
                        <span className="block text-[10px] text-ink-600">{a.agentKaliti}</span>
                      </td>
                      <td className="px-3 py-1.5 text-right text-ink-400">{a.qongiroqlar}</td>
                      <td className="px-3 py-1.5 text-right text-ink-400">
                        {a.gaplashildi} ({pct(a.gaplashildi, a.qongiroqlar)})
                      </td>
                      <td className="px-3 py-1.5 text-right text-ink-400">{a.kotarmadi + a.band}</td>
                      <td className="px-3 py-1.5 text-right text-ink-400">{a.boshqaOdam}</td>
                      <td className="px-3 py-1.5 text-right text-ink-400">{a.raqamNotogri}</td>
                      <td className="px-3 py-1.5 text-right text-ink-400">{a.vadalar}</td>
                      <td className="px-3 py-1.5 text-right text-emerald-400">
                        {a.bajarilgan} ({pct(a.bajarilgan, a.vadalar)})
                      </td>
                      <td className="px-3 py-1.5 text-right text-ink-400">{a.buzilgan}</td>
                      <td className="px-4 py-1.5 text-right text-ink-400">
                        {Math.round(a.jamiSoniya / 60)} daqiqa
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-[11px] text-ink-600">
              Bajarilgan/buzilgan — Telegram suhbati bor mijozlardagi telefon va'dalari bo'yicha;
              suhbati yo'q mijozning va'dasi kuzatilmaydi.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
