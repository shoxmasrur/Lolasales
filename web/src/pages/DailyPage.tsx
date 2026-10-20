import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { som } from '@/lib/format';
import { useCan } from '@/store/auth';
import { EmptyState, ErrorNote, Spinner, StatCard } from '@/components/ui';
import { MultiSelect, type MultiSelectOption } from '@/components/MultiSelect';

const TOIFA_NOMI: Record<string, string> = {
  agent_xatosi: 'Agent xatosi',
  odam_kerak: 'Odam kerak',
  crm_xatosi: 'CRM xatosi',
  chek_tekshiruvi: 'Chek tekshiruvi',
  buzilgan_vada: "Buzilgan va'da",
  norozilik: 'Norozilik',
  texnik_uzilish: 'Texnik uzilish',
  bajarilmagan_vada: "Bajarilmagan va'da",
  salbiy_javob: 'Salbiy javob',
  takroriy: 'Takroriy',
  xabar_tuzatilgan: 'Xabar tuzatilgan',
  uzoq_suhbat: 'Uzoq suhbat',
};

/** Ro'yxat shuncha-shuncha ochiladi — 2000 ta qatorni birdan chizmaslik uchun. */
const SAHIFA = 50;

/** Jiddiylari qizil, qolgani kulrang — ko'z birinchi qizilga tushsin. */
const JIDDIY = new Set(['agent_xatosi', 'odam_kerak', 'crm_xatosi', 'norozilik', 'texnik_uzilish']);

interface Suhbat {
  conversationId: string;
  clientName: string;
  contractNo: string | null;
  toifalar: string[];
  eslatma: string | null;
  sabab: string | null;
  oxirgiMijozGapi: string | null;
  oxirgiHarakatAt: string;
  obyekt: string | null;
  /** Mijozning barcha obyektlari, asosiysi birinchi. */
  obyektlar: string[];
  akkauntId: string | null;
  akkauntNomi: string | null;
  /** CRM holati: kanonik kalit va CRM'dagi nomi (talabnoma sahifasidagi kabi). */
  holat: { kalit: string; nomi: string } | null;
}

interface Kun {
  date: string;
  raqamlar: {
    yozilganMijoz: number;
    javobBerganMijoz: number;
    javobUlushi: number | null;
    vadaSoni: number;
    vadaSummasi: number;
    tushumSummasi: number;
    odamKerak: Record<string, number>;
    takroriySoni: number;
  };
  suhbatlar: Suhbat[];
  jami: number;
  /** Filtr variantlari — shu kunning (filtrsiz) suhbatlaridan. */
  variantlar: {
    obyektlar: string[];
    akkauntlar: { id: string; nomi: string }[];
  };
}

/** Toshkent kuni — server ham shu qoidada hisoblaydi. */
function bugun(): string {
  return new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

const soat = (iso: string): string =>
  new Date(iso).toLocaleTimeString('uz-UZ', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tashkent',
  });

/** Ro'yxat orqaga qancha ochiladi — server ham shu chegarani tekshiradi. */
const ENG_ESKI_KUN = 30;
const engEskiSana = (): string =>
  new Date(Date.now() + 5 * 60 * 60 * 1000 - ENG_ESKI_KUN * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

/** "Odam kerak" kartasining pastki qatori — sabab kesimida, nollari yashirin. */
const ODAM_KERAK_SABABLARI: readonly [string, string][] = [
  ['agent_error', 'xato'],
  ['crm_xato', 'CRM'],
  ['chek_tekshiruvi', 'chek'],
  ['broken_promise', "va'da"],
  ['boshqa', 'boshqa'],
];

function odamKerakSabablari(odamKerak: Record<string, number>): string {
  return ODAM_KERAK_SABABLARI.filter(([kalit]) => (odamKerak[kalit] ?? 0) > 0)
    .map(([kalit, nom]) => `${nom}: ${odamKerak[kalit]}`)
    .join(' · ');
}

export default function DailyPage() {
  const canView = useCan('conversations.view');
  const [kun, setKun] = useState(bugun);
  const navigate = useNavigate();

  // Filtrlar sana almashganda saqlanadi. Tanlangan qiymat yangi kunda
  // bo'lmasa ham tanlangan bo'lib qoladi (natija 0) — operator uni
  // o'zi «Hammasi» ga qaytaradi.
  const [obyekt, setObyekt] = useState('');
  const [akkaunt, setAkkaunt] = useState('');
  const [toifalar, setToifalar] = useState<string[]>([]);
  const [holat, setHolat] = useState('');
  const [korsatish, setKorsatish] = useState(SAHIFA);

  /** Filtr yoki sana o'zgarsa ro'yxat yana boshidan 50 ta. */
  const almashtir =
    <T,>(set: (v: T) => void) =>
    (v: T): void => {
      set(v);
      setKorsatish(SAHIFA);
    };

  const q = useQuery({
    queryKey: ['daily', kun, obyekt, akkaunt],
    queryFn: () =>
      api.get<Kun>('/daily', {
        date: kun,
        obyekt: obyekt || undefined,
        akkaunt: akkaunt || undefined,
      }),
    enabled: canView,
    // Filtr almashganda eski ro'yxat yangisi kelguncha ko'rinib turadi.
    placeholderData: keepPreviousData,
    // Funksiya ko'rinishida — TanStack Query buni har tikda qayta chaqiradi,
    // shuning uchun ochiq turgan oyna yarim tundan o'tib sana almashganda ham
    // to'g'ri to'xtaydi/davom etadi. Bugungi kun tirik — o'tgan kun
    // o'zgarmaydi, uni qayta so'rash shart emas.
    refetchInterval: () => (kun === bugun() ? 60_000 : false),
  });

  const d = q.data;

  // Muammo turi va Shartnoma holati — mijoz tomonda (kartalarga ta'sir qilmaydi).
  const korinadi = useMemo(
    () =>
      (d?.suhbatlar ?? []).filter(
        (s) =>
          (toifalar.length === 0 || s.toifalar.some((t) => toifalar.includes(t))) &&
          (!holat || s.holat?.kalit === holat),
      ),
    [d, toifalar, holat],
  );

  const toifaVariantlari = useMemo<MultiSelectOption<string>[]>(() => {
    const bor = new Set<string>(toifalar);
    for (const s of d?.suhbatlar ?? []) for (const t of s.toifalar) bor.add(t);
    return Object.keys(TOIFA_NOMI)
      .filter((t) => bor.has(t))
      .map((t) => ({ value: t, label: TOIFA_NOMI[t]! }));
  }, [d, toifalar]);

  const holatVariantlari = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of d?.suhbatlar ?? []) if (s.holat) map.set(s.holat.kalit, s.holat.nomi);
    if (holat && !map.has(holat)) map.set(holat, holat);
    return [...map].map(([kalit, nomi]) => ({ kalit, nomi }));
  }, [d, holat]);

  const obyektVariantlari = useMemo(() => {
    const v = [...(d?.variantlar.obyektlar ?? [])];
    if (obyekt && !v.includes(obyekt)) v.push(obyekt);
    return v;
  }, [d, obyekt]);

  const akkauntVariantlari = useMemo(() => {
    const v = [...(d?.variantlar.akkauntlar ?? [])];
    if (akkaunt && !v.some((a) => a.id === akkaunt)) v.push({ id: akkaunt, nomi: "(bu kunda yo'q)" });
    return v;
  }, [d, akkaunt]);

  if (!canView) {
    return <EmptyState title="Ruxsat yo'q" hint="Bu sahifa uchun «Suhbatlarni ko'rish» ruxsati kerak." />;
  }

  const r = d?.raqamlar;
  const odamKerak = r ? Object.values(r.odamKerak).reduce((s, n) => s + n, 0) : 0;
  const kartaFiltri = Boolean(obyekt || akkaunt);
  const royxatFiltri = toifalar.length > 0 || Boolean(holat);
  // Server 2000 tadan ortig'ini qaytarmaydi — `jami` baribir hammasi.
  const kesilgan = d ? d.jami - d.suhbatlar.length : 0;
  const ochiq = korinadi.slice(0, korsatish);
  // Sana/filtr almashgach yangi javob kelguncha eski ma'lumot xira turadi —
  // uni yangi natija deb o'ylamaslik uchun.
  const xira = q.isPlaceholderData ? 'opacity-50 transition-opacity' : 'transition-opacity';

  return (
    // Layout'ning <main> i `overflow-hidden` — sahifa o'zi aylanadi.
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-medium text-ink-100">Kunlik xulosa</h1>
          <input
            type="date"
            className="input !py-1 text-xs"
            value={kun}
            min={engEskiSana()}
            max={bugun()}
            onChange={(e) => almashtir(setKun)(e.target.value)}
          />
          {q.isFetching ? <Spinner /> : null}
        </div>

        {q.error ? <ErrorNote error={q.error} /> : null}

        {d ? (
          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center">
              <select
                className="input text-xs md:max-w-[200px]"
                value={obyekt}
                onChange={(e) => almashtir(setObyekt)(e.target.value)}
                aria-label="Obyekt"
              >
                <option value="">Obyekt: hammasi</option>
                {obyektVariantlari.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <select
                className="input text-xs md:max-w-[200px]"
                value={akkaunt}
                onChange={(e) => almashtir(setAkkaunt)(e.target.value)}
                aria-label="Agent"
              >
                <option value="">Agent: hammasi</option>
                {akkauntVariantlari.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nomi}
                  </option>
                ))}
              </select>
              <MultiSelect
                nom="Muammo turi"
                className="w-full md:max-w-[210px]"
                options={toifaVariantlari}
                value={toifalar}
                onChange={almashtir(setToifalar)}
              />
              <select
                className="input text-xs md:max-w-[200px]"
                value={holat}
                onChange={(e) => almashtir(setHolat)(e.target.value)}
                aria-label="Shartnoma holati"
              >
                <option value="">Shartnoma holati: hammasi</option>
                {holatVariantlari.map((h) => (
                  <option key={h.kalit} value={h.kalit}>
                    {h.nomi}
                  </option>
                ))}
              </select>
            </div>
            {/* Qaror (2026-10-19): kartalar Obyekt va Agent bo'yicha qayta
                hisoblanadi; Muammo turi va Shartnoma holati faqat ro'yxatni
                toraytiradi — buni ko'rsatib turamiz, aks holda karta va
                ro'yxat sonlari "mos emas" bo'lib ko'rinardi. */}
            <p className="text-[11px] text-ink-600">
              {kartaFiltri
                ? 'Kartalar tanlangan obyekt va agent bo\'yicha hisoblangan.'
                : 'Kartalar Obyekt va Agent filtri bo\'yicha qayta hisoblanadi.'}
              {royxatFiltri ? ' Muammo turi va shartnoma holati faqat ro\'yxatga ta\'sir qiladi.' : ''}
            </p>
          </div>
        ) : null}

        {r ? (
          <div className={`grid grid-cols-2 gap-3 lg:grid-cols-3 ${xira}`}>
            <StatCard label="Xabar yozilgan mijozlar" value={r.yozilganMijoz} />
            <StatCard
              label="Javob berganlar"
              value={r.javobBerganMijoz}
              sub={r.javobUlushi === null ? '—' : `${r.javobUlushi}%`}
              tone="good"
            />
            <StatCard label="Yangi va'dalar" value={r.vadaSoni} sub={som(r.vadaSummasi)} />
            <StatCard label="Bugungi tushum" value={som(r.tushumSummasi)} tone="good" />
            <StatCard
              label="Odam kerak"
              value={odamKerak}
              sub={odamKerakSabablari(r.odamKerak) || '—'}
              tone={odamKerak ? 'warn' : 'default'}
            />
            <StatCard label="Takroriy yozilganlar" value={r.takroriySoni} />
          </div>
        ) : null}

        {d ? (
          <div className={xira}>
            <p className="mb-2 text-[11px] uppercase tracking-wide text-ink-500">
              Muammoli suhbatlar
              {korinadi.length > 0 ? ` — ${ochiq.length} ta ko'rsatildi, jami ${korinadi.length}` : ''}
              {royxatFiltri && d.jami > 0 ? ` (filtrsiz ${d.jami})` : ''}
            </p>
            {kesilgan > 0 ? (
              <p className="mb-2 text-[11px] text-amber-300">
                Serverdan {d.suhbatlar.length} tasi olindi, yana {kesilgan} tasi ko'rsatilmaydi —
                filtr bilan toraytiring.
              </p>
            ) : null}

            {korinadi.length === 0 ? (
              <EmptyState
                title="Muammoli suhbat yo'q"
                hint={
                  kartaFiltri || royxatFiltri
                    ? 'Tanlangan filtrlar bo\'yicha suhbat topilmadi.'
                    : "Bu kunda e'tibor talab qiladigan suhbat topilmadi."
                }
              />
            ) : (
              <div className="space-y-2">
                {ochiq.map((s) => (
                  <button
                    key={s.conversationId}
                    type="button"
                    onClick={() => navigate(`/chat/${s.conversationId}`)}
                    className="block w-full rounded-xl border border-ink-800 p-3 text-left hover:bg-ink-900/60"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-ink-100">{s.clientName}</span>
                      {s.contractNo ? (
                        <span className="text-[11px] text-ink-500">{s.contractNo}</span>
                      ) : null}
                      {s.holat ? (
                        <span className="chip bg-ink-800 text-ink-300">{s.holat.nomi}</span>
                      ) : null}
                      <span className="ml-auto text-[11px] text-ink-600">{soat(s.oxirgiHarakatAt)}</span>
                    </div>

                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink-500">
                      <span>
                        {s.obyektlar.length > 1 ? 'Obyektlar' : 'Obyekt'}:{' '}
                        {s.obyektlar.length ? s.obyektlar.join(', ') : '—'}
                      </span>
                      <span>Agent: {s.akkauntNomi ?? '—'}</span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {s.toifalar.map((t) => (
                        <span
                          key={t}
                          className={
                            JIDDIY.has(t)
                              ? 'chip bg-red-500/10 text-red-300'
                              : 'chip bg-ink-800 text-ink-400'
                          }
                        >
                          {TOIFA_NOMI[t] ?? t}
                        </span>
                      ))}
                    </div>

                    {s.eslatma ? (
                      <p className="mt-1.5 text-xs text-ink-400">{s.eslatma}</p>
                    ) : s.sabab ? (
                      <p className="mt-1.5 text-xs text-ink-400">{s.sabab}</p>
                    ) : null}
                    {s.oxirgiMijozGapi ? (
                      <p className="mt-1 line-clamp-2 text-xs text-ink-500">
                        «{s.oxirgiMijozGapi}»
                      </p>
                    ) : null}
                  </button>
                ))}

                {korinadi.length > ochiq.length ? (
                  <button
                    type="button"
                    className="btn-ghost w-full text-xs"
                    onClick={() => setKorsatish((n) => n + SAHIFA)}
                  >
                    Yana ko'rsatish ({Math.min(SAHIFA, korinadi.length - ochiq.length)} ta)
                  </button>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        {q.isLoading ? <Spinner /> : null}
      </div>
    </div>
  );
}
