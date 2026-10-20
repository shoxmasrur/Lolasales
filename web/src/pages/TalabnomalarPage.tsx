import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCan } from '@/store/auth';
import { dateUz, som } from '@/lib/format';
import { EmptyState, ErrorNote, Spinner } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { pdfYuklabOl, TalabnomaPdfKorinish } from '@/components/talabnoma/TalabnomaPdfKorinish';
import { MijozBatafsilOyna, type BatafsilMijoz } from '@/components/talabnoma/MijozBatafsilOyna';
import {
  BEKOR_JARAYONI,
  chopEtishPdfYoli,
  etRaqam,
  HOLAT_COLOR,
  HOLAT_LABEL,
  korinishPdfYoli,
  osilganmi,
  royxatEskirdimi,
  TALABNOMA_HOLATLARI,
  talabnomaApi,
  talabnomaPdfYoli,
  talabnomaXatoMatni,
  YOZILADIGAN_HOLATLAR,
  type CrmYangilashHolati,
  type ShartnomaHolati,
  type TalabnomaHolati,
  type TalabnomaQatori,
  type TayyorQator,
} from '@/lib/talabnoma';

type Tab = 'tayyor' | 'yuborilgan';

const SAHIFA_HAJMI = 50;

const KEY_TAYYOR = ['talabnoma', 'tayyor'] as const;
const KEY_YUBORILGAN = ['talabnoma', 'yuborilgan'] as const;

const KEY_CRM = ['talabnoma-crm-yangilash'] as const;
/** `['talabnoma']` ostida — yuborish/qayta/bekor dan keyin u ham yangilanadi. */
const KEY_VARIANTLAR = ['talabnoma', 'variantlar'] as const;

/**
 * Jadval filtri: shartnomaning CRM holati (kanonik kalit) va obyekt nomi.
 * `''` — «Hammasi». Filtrlar birga (VA) ishlaydi.
 */
interface Filtr {
  holat: string;
  obyekt: string;
}

const BOSH_FILTR: Filtr = { holat: '', obyekt: '' };

const filtrBormi = (f: Filtr): boolean => f.holat !== '' || f.obyekt !== '';

/** «kompaniya INN'i, obyekt manzili» → «Kompaniya INN'i, obyekt manzili hali sinxronlanmagan — …». */
const sinxdaYangilanadi = (yetishmaydi: string): string =>
  `${yetishmaydi.charAt(0).toUpperCase()}${yetishmaydi.slice(1)} hali sinxronlanmagan — yuborishda yangilanadi`;

/**
 * Yuborishni to'sadigan rekvizit sababi. `null` rekvizit (INN hali
 * sinxronlanmagan) to'smaydi: server yuborishda avval CRM'dan sinxlab,
 * rekvizitni qayta tekshiradi.
 */
const tosiqSababi = (q: TayyorQator): string | null => (q.rekvizit && !q.rekvizit.ok ? q.rekvizit.sabab : null);

/**
 * «Talabnomalar» — operator rasmiy talabnomani ko'rib, mijozga Telegram
 * orqali yuboradi (A variant: alohida sahifa, chapda ro'yxat, o'ngda PDF).
 *
 * Ro'yxat har safar serverda hisoblanadi: to'lov kelgan shartnoma
 * «tayyor»dan o'zi chiqadi. Tor ekranda ro'yxat va PDF ustma-ust turadi.
 */
export default function TalabnomalarPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Tab URL'da: F5 yoki "Orqaga" dan keyin operator o'sha tabda qolsin.
  const tab: Tab = searchParams.get('tab') === 'yuborilgan' ? 'yuborilgan' : 'tayyor';
  const setTab = (next: Tab): void => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === 'yuborilgan') p.set('tab', next);
        else p.delete('tab');
        return p;
      },
      { replace: true },
    );
  };

  const holatQuery = useQuery({ queryKey: ['talabnoma', 'holat'], queryFn: talabnomaApi.holat });
  const tayyorQuery = useQuery({ queryKey: KEY_TAYYOR, queryFn: talabnomaApi.tayyorlar });
  // Tab sarlavhasidagi son uchun — eng yengil so'rov (1 qator).
  const jamiQuery = useQuery({
    queryKey: [...KEY_YUBORILGAN, 'jami'],
    queryFn: () => talabnomaApi.list({ page: 1, limit: 1 }),
  });

  const sozlanmagan = holatQuery.data?.tayyor === false;
  // Filtr har tab uchun alohida va SHU YERDA turadi: tab almashganda
  // tab komponenti yo'qoladi, tanlangan filtr esa saqlansin.
  const [tayyorFiltr, setTayyorFiltr] = useState<Filtr>(BOSH_FILTR);
  const [yuborilganFiltr, setYuborilganFiltr] = useState<Filtr>(BOSH_FILTR);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="space-y-3 border-b border-ink-800 px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-medium text-ink-100">Talabnomalar</h1>
          <CrmYangilashTugma />
        </div>
        {sozlanmagan ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            Talabnoma sozlanmagan: muhr/imzo rasmlari yoki Chrome serverda yo'q
          </div>
        ) : null}
        <div className="flex flex-wrap gap-1">
          <TabTugma active={tab === 'tayyor'} onClick={() => setTab('tayyor')}>
            Yuborishga tayyor · {tayyorQuery.data?.length ?? '…'}
          </TabTugma>
          <TabTugma active={tab === 'yuborilgan'} onClick={() => setTab('yuborilgan')}>
            Yuborilgan · {jamiQuery.data?.total ?? '…'}
          </TabTugma>
        </div>
      </header>

      {tab === 'tayyor' ? (
        <TayyorTab
          items={tayyorQuery.data}
          loading={tayyorQuery.isLoading}
          error={tayyorQuery.error}
          sozlanmagan={sozlanmagan}
          filtr={tayyorFiltr}
          onFiltr={setTayyorFiltr}
        />
      ) : (
        <YuborilganTab sozlanmagan={sozlanmagan} filtr={yuborilganFiltr} onFiltr={setYuborilganFiltr} />
      )}
    </div>
  );
}

// ─── CRM'dan yangilash ──────────────────────────────────────────────────

/**
 * INN yoki manzili hali sinxronlanmagan nomzodlarni CRM'dan fonda
 * yangilaydi. Ish ketayotganda holat ~2 soniyada so'raladi; tugagach
 * ro'yxat yangilanadi va qisqa xulosa ko'rsatiladi (yopiladi).
 * Ishni boshqa operator boshlagan bo'lsa ham tugma progressni ko'rsatadi.
 */
function CrmYangilashTugma() {
  const canSend = useCan('talabnoma.send');
  const queryClient = useQueryClient();
  const [xulosa, setXulosa] = useState<CrmYangilashHolati | null>(null);
  /** Shu sahifada ishlayotganini ko'rdikmi — eski vazifaning xulosasi chiqmasin. */
  const kuzatildi = useRef(false);

  const holatQuery = useQuery({
    queryKey: KEY_CRM,
    queryFn: talabnomaApi.crmYangilashHolati,
    enabled: canSend,
    refetchInterval: (q) => (q.state.data?.holat === 'ishlayapti' ? 2000 : false),
  });
  const holat = holatQuery.data;

  const boshla = useMutation({
    mutationFn: talabnomaApi.crmYangila,
    onMutate: () => setXulosa(null),
    onSuccess: (data) => queryClient.setQueryData(KEY_CRM, data),
  });
  const { reset: boshlaReset } = boshla;

  // Holat muvaffaqiyatli kelgach eski boshlash xatosi o'chadi.
  useEffect(() => {
    if (holatQuery.isSuccess) boshlaReset();
  }, [holatQuery.dataUpdatedAt, holatQuery.isSuccess, boshlaReset]);

  useEffect(() => {
    if (!holat) return;
    if (holat.holat === 'ishlayapti') {
      kuzatildi.current = true;
      return;
    }
    // `bosh` — ish ketayotganini ko'rgan edik, endi server hech narsa
    // bilmaydi: u qayta ishga tushgan (holat xotirada edi).
    if (kuzatildi.current) {
      kuzatildi.current = false;
      setXulosa(holat);
      void queryClient.invalidateQueries({ queryKey: ['talabnoma'] });
    }
  }, [holat, queryClient]);

  if (!canSend) return null;
  const ishlayapti = holat?.holat === 'ishlayapti';

  return (
    <div className="flex flex-wrap items-center gap-2">
      {xulosa ? (
        <span
          className={clsx(
            'flex items-center gap-2 rounded-lg px-2 py-1 text-xs',
            xulosa.holat === 'tugadi' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300',
          )}
        >
          {xulosa.holat === 'xato'
            ? `Yangilanmadi: ${xulosa.sabab ?? "noma'lum xato"}`
            : xulosa.holat === 'bosh'
              ? "Yangilash to'xtadi (server qayta ishga tushdi) — qayta bosing"
              : `Yangilandi: ${xulosa.yangilandi}, xato: ${xulosa.xatolar}`}
          <button type="button" className="opacity-70 hover:opacity-100" title="Yopish" onClick={() => setXulosa(null)}>
            ✕
          </button>
        </span>
      ) : null}
      {boshla.error ? (
        <span className="flex items-center gap-2 rounded-lg bg-red-500/10 px-2 py-1 text-xs text-red-300">
          {talabnomaXatoMatni(boshla.error)}
          <button type="button" className="opacity-70 hover:opacity-100" title="Yopish" onClick={() => boshla.reset()}>
            ✕
          </button>
        </span>
      ) : null}
      <button
        type="button"
        className="btn-ghost !py-1.5 text-xs"
        disabled={ishlayapti || boshla.isPending}
        title="Kompaniya INN'i yoki manzili hali sinxronlanmagan shartnomalarni CRM'dan yangilaydi"
        onClick={() => boshla.mutate()}
      >
        {ishlayapti || boshla.isPending ? <Spinner /> : null}
        {ishlayapti
          ? holat.jami === 0 && holat.bajarildi === 0
            ? 'Yangilanmoqda…'
            : `Yangilanmoqda: ${holat.bajarildi}/${holat.jami}`
          : "CRM'dan yangilash"}
      </button>
    </div>
  );
}

// ─── Yuborishga tayyor ──────────────────────────────────────────────────

function TayyorTab({
  items,
  loading,
  error,
  sozlanmagan,
  filtr,
  onFiltr,
}: {
  items: TayyorQator[] | undefined;
  loading: boolean;
  error: unknown;
  sozlanmagan: boolean;
  filtr: Filtr;
  onFiltr: (f: Filtr) => void;
}) {
  const queryClient = useQueryClient();
  const canSend = useCan('talabnoma.send');
  const [tanlangan, setTanlangan] = useState<string | null>(null);
  const [tasdiq, setTasdiq] = useState(false);
  // «Batafsil» oynasi — tanlov va filtrga tegmaydi.
  const [batafsil, setBatafsil] = useState<BatafsilMijoz | null>(null);

  const qator = useMemo(() => items?.find((q) => q.contractId === tanlangan) ?? null, [items, tanlangan]);
  const tosiq = qator ? tosiqSababi(qator) : null;

  // Ro'yxat to'liq keladi (sahifalanmaydi) — filtr shu yerda, brauzerda.
  const obyektlar = useMemo(() => obyektVariantlari(items ?? []), [items]);
  const korinadi = useMemo(
    () =>
      (items ?? []).filter(
        (q) =>
          (filtr.holat === '' || q.shartnomaHolati?.kalit === filtr.holat) &&
          (filtr.obyekt === '' || (q.objectName ?? '').trim() === filtr.obyekt),
      ),
    [items, filtr],
  );

  // Ro'yxat yangilanib qator chiqib ketsa (to'lov keldi) yoki filtr uni
  // yashirsa — tanlov ham tushadi: panel ko'rinmayotgan qatorni ko'rsatmasin.
  useEffect(() => {
    if (tanlangan && items && !korinadi.some((q) => q.contractId === tanlangan)) setTanlangan(null);
  }, [items, korinadi, tanlangan]);

  /**
   * Yuborish xatosi panel ICHIDA emas, jadval tepasida turadi: 409
   * (to'lov keldi / allaqachon yuborilgan) dan keyin ro'yxat yangilanib
   * qator chiqib ketadi va panel yopiladi — xabar ham u bilan yo'qolardi.
   * Operator yopguncha yoki keyingi yuborishgacha qoladi.
   */
  const [xato, setXato] = useState<{ kim: string; matn: string } | null>(null);

  const yubor = useMutation({
    mutationFn: (q: TayyorQator) => talabnomaApi.yubor(q.contractId),
    onMutate: () => setXato(null),
    onSuccess: (_data, q) => {
      setTasdiq(false);
      // Operator shu orada boshqa qatorga o'tgan bo'lsa, uning tanlovi qoladi.
      setTanlangan((cur) => (cur === q.contractId ? null : cur));
      void queryClient.invalidateQueries({ queryKey: ['talabnoma'] });
    },
    onError: (err, q) => {
      setTasdiq(false);
      setXato({ kim: `${q.fullName} · №${q.contractNo}`, matn: talabnomaXatoMatni(err) });
      if (royxatEskirdimi(err)) void queryClient.invalidateQueries({ queryKey: KEY_TAYYOR });
    },
  });

  const tanla = (contractId: string): void => setTanlangan(contractId);

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:overflow-hidden">
      <div className="min-h-0 overflow-y-auto lg:border-r lg:border-ink-800">
        {xato ? (
          <div className="flex items-start gap-2 border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300 md:px-6">
            <p className="min-w-0 flex-1">
              <span className="font-medium">{xato.kim}:</span> {xato.matn}
            </p>
            <button
              type="button"
              className="shrink-0 text-red-300/70 hover:text-red-200"
              title="Yopish"
              onClick={() => setXato(null)}
            >
              ✕
            </button>
          </div>
        ) : null}
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : error ? (
          <div className="p-4 md:p-6">
            <ErrorNote error={error} />
          </div>
        ) : !items || items.length === 0 ? (
          <EmptyState title="Hozircha talabnoma yuboriladigan mijoz yo'q" />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-ink-800 px-4 py-2 md:px-6">
              <FiltrPaneli filtr={filtr} onFiltr={onFiltr} holatlar={YOZILADIGAN_HOLATLAR} obyektlar={obyektlar} />
              {filtrBormi(filtr) ? (
                <span className="text-xs tabular-nums text-ink-500">
                  {korinadi.length} / {items.length}
                </span>
              ) : null}
            </div>
            {korinadi.length === 0 ? (
              <EmptyState title="Filtrga mos mijoz yo'q" />
            ) : (
              <div className="table-wrap">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Mijoz</th>
                      <th>Shartnoma</th>
                      <th title="Shartnomaning CRM'dagi hozirgi holati">Holat</th>
                      <th>Obyekt</th>
                      <th className="!text-right" title="Faqat kechikkan oylik to'lovlar">
                        Kechikkan summa
                      </th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {korinadi.map((q) => (
                      <tr
                        key={q.contractId}
                        className={clsx('cursor-pointer', q.contractId === tanlangan && '!bg-ink-800/70')}
                        onClick={() => tanla(q.contractId)}
                      >
                        <td>
                          <MijozNomi
                            fullName={q.fullName}
                            className="font-medium text-ink-100"
                            onOpen={() => setBatafsil({ clientId: q.clientId, fullName: q.fullName })}
                          />
                          <div className="mt-1 flex flex-wrap gap-1">
                            {q.qarindoshOrqali ? (
                              <span className="chip bg-amber-500/15 text-amber-300">Qarindoshi orqali</span>
                            ) : null}
                            {tosiqSababi(q) ? (
                              <span className="chip whitespace-normal bg-red-500/15 text-red-300">{tosiqSababi(q)}</span>
                            ) : null}
                            {q.malumotYetishmaydi ? (
                              <span className="chip whitespace-normal bg-ink-700/60 text-ink-400">
                                {sinxdaYangilanadi(q.malumotYetishmaydi)}
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="whitespace-nowrap text-ink-300">{q.contractNo}</td>
                        <td>
                          <HolatChip holat={q.shartnomaHolati} />
                        </td>
                        <td className="text-ink-400">{q.objectName ?? '—'}</td>
                        <td className="whitespace-nowrap text-right font-medium tabular-nums text-red-300">
                          {som(q.debtMonthly)}
                        </td>
                        <td className="text-right">
                          <button
                            type="button"
                            className="btn-ghost !px-2 !py-1 text-xs"
                            onClick={(e) => {
                              // Qator bosilishi (tanlash → PDF) ishlamasin.
                              e.stopPropagation();
                              setBatafsil({ clientId: q.clientId, fullName: q.fullName });
                            }}
                          >
                            Batafsil
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <aside className="flex min-h-0 flex-col border-t border-ink-800 lg:border-t-0">
        {!qator ? (
          <EmptyState title="Mijozni tanlang" hint="Talabnoma ko'rinishi shu yerda ochiladi." />
        ) : (
          <>
            <div className="space-y-2 border-b border-ink-800 px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-100">{qator.fullName}</p>
                  <p className="text-xs text-ink-500">
                    Shartnoma №{qator.contractNo} · <span className="tabular-nums">{som(qator.debtMonthly)}</span>
                  </p>
                  {bekorJarayonida(qator.shartnomaHolati) ? (
                    <p className="mt-1">
                      <HolatChip holat={qator.shartnomaHolati} />
                    </p>
                  ) : null}
                </div>
                {canSend ? (
                  <button
                    type="button"
                    className="btn-primary !py-1.5 text-xs"
                    disabled={tosiq !== null || sozlanmagan || yubor.isPending}
                    title={tosiq ?? undefined}
                    onClick={() => setTasdiq(true)}
                  >
                    {yubor.isPending ? <Spinner /> : null}
                    Yuborish
                  </button>
                ) : (
                  <span className="text-[11px] text-ink-500">Yuborish uchun huquq yo'q</span>
                )}
              </div>
              {tosiq ? <p className="text-xs text-red-300">Yuborib bo'lmaydi: {tosiq}</p> : null}
            </div>
            <div className="min-h-0 flex-1 p-3">
              {/* Rekvizit, INN yoki manzil yo'q bo'lsa server ko'rinishni chizmaydi — so'ramaymiz.
                  INN/manzil yo'qligi yuborishni to'smaydi: yuborishda CRM sinxi ularni to'ldiradi. */}
              {tosiq ? (
                <EmptyState title="Ko'rinish yo'q" hint={tosiq} />
              ) : qator.malumotYetishmaydi ? (
                <EmptyState title="Ko'rinish yo'q" hint={sinxdaYangilanadi(qator.malumotYetishmaydi)} />
              ) : (
                <TalabnomaPdfKorinish
                  key={qator.contractId}
                  path={korinishPdfYoli(qator.contractId)}
                  title={`Talabnoma — ${qator.fullName}`}
                />
              )}
            </div>
          </>
        )}
      </aside>

      {tasdiq && qator ? (
        <Tasdiq
          title="Talabnomani yuborish"
          pending={yubor.isPending}
          tugma="Yuborish"
          onClose={() => setTasdiq(false)}
          onConfirm={() => yubor.mutate(qator)}
        >
          <p className="text-sm font-medium text-ink-100">
            {qator.fullName} · Shartnoma №{qator.contractNo}
          </p>
          <p className="text-sm text-ink-300">ET raqami beriladi va mijozga Telegram orqali yuboriladi</p>
          {bekorJarayonida(qator.shartnomaHolati) ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              Shartnoma CRM'da bekor qilish jarayonida («{qator.shartnomaHolati?.nomi}»). Yuborishdan oldin
              tekshiring.
            </p>
          ) : null}
          {qator.malumotYetishmaydi ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              Hujjat ko'rib chiqilmagan — rekvizit va manzil yuborishda CRM'dan olinadi. Avval «CRM'dan
              yangilash»ni bosib, ko'rinishni tekshirish tavsiya etiladi.
            </p>
          ) : null}
        </Tasdiq>
      ) : null}

      <MijozBatafsilOyna mijoz={batafsil} onClose={() => setBatafsil(null)} />
    </div>
  );
}

// ─── Yuborilgan ─────────────────────────────────────────────────────────

function YuborilganTab({
  sozlanmagan,
  filtr,
  onFiltr,
}: {
  sozlanmagan: boolean;
  filtr: Filtr;
  onFiltr: (f: Filtr) => void;
}) {
  const queryClient = useQueryClient();
  const canSend = useCan('talabnoma.send');

  const [holat, setHolat] = useState<TalabnomaHolati | ''>('');
  const [page, setPage] = useState(1);
  const [tanlangan, setTanlangan] = useState<string | null>(null);
  const [amal, setAmal] = useState<{ tur: 'qayta' | 'bekor'; t: TalabnomaQatori } | null>(null);
  const [batafsil, setBatafsil] = useState<BatafsilMijoz | null>(null);

  // Chop etish uchun nusxa serverda Chrome bilan chiziladi — bir necha soniya.
  const chop = useMutation({
    mutationFn: (t: TalabnomaQatori): Promise<void> =>
      pdfYuklabOl(chopEtishPdfYoli(t.id), `Talabnoma ${etRaqam(t.raqam)} (chop etish).pdf`),
  });

  // Ro'yxat serverda sahifalanadi — filtr ham serverda (`shartnomaHolati`,
  // `obyekt`); variantlar alohida so'rov: joriy sahifadan yig'ib bo'lmaydi.
  const listQuery = useQuery({
    queryKey: [...KEY_YUBORILGAN, holat, filtr.holat, filtr.obyekt, page],
    queryFn: () =>
      talabnomaApi.list({ holat, shartnomaHolati: filtr.holat, obyekt: filtr.obyekt, page, limit: SAHIFA_HAJMI }),
    placeholderData: (prev) => prev,
  });
  const variantlarQuery = useQuery({ queryKey: KEY_VARIANTLAR, queryFn: talabnomaApi.variantlar });
  const setFiltr = (f: Filtr): void => {
    onFiltr(f);
    setPage(1);
  };

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const sahifalar = Math.max(1, Math.ceil(total / SAHIFA_HAJMI));
  const qator = items.find((t) => t.id === tanlangan) ?? null;

  const yangila = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['talabnoma'] });
  };

  const bajar = useMutation({
    mutationFn: (a: { tur: 'qayta' | 'bekor'; id: string }): Promise<unknown> =>
      a.tur === 'qayta' ? talabnomaApi.qayta(a.id) : talabnomaApi.bekor(a.id),
    onSuccess: () => {
      setAmal(null);
      yangila();
    },
    onError: () => {
      setAmal(null);
      // Qayta urinish yiqilsa ham server xato sababini yozadi — ro'yxatda ko'rinsin.
      yangila();
    },
  });

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] lg:overflow-hidden">
      <div className="flex min-h-0 flex-col lg:border-r lg:border-ink-800">
        <div className="flex flex-wrap gap-1 border-b border-ink-800 px-4 py-2 md:px-6">
          {(['', ...TALABNOMA_HOLATLARI] as const).map((h) => (
            <button
              key={h || 'all'}
              type="button"
              className={clsx(
                'chip border',
                holat === h
                  ? 'border-brand-500/50 bg-brand-500/15 text-brand-200'
                  : 'border-ink-800 bg-ink-900 text-ink-400 hover:text-ink-200',
              )}
              onClick={() => {
                setHolat(h);
                setPage(1);
              }}
            >
              {h ? HOLAT_LABEL[h] : 'Hammasi'}
            </button>
          ))}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <FiltrPaneli
              filtr={filtr}
              onFiltr={setFiltr}
              holatlar={variantlarQuery.data?.holatlar ?? []}
              obyektlar={variantlarQuery.data?.obyektlar ?? []}
            />
          </div>
        </div>

        {bajar.error ? (
          <div className="px-4 pt-3 md:px-6">
            <ErrorNote error={talabnomaXatoMatni(bajar.error)} />
          </div>
        ) : null}
        {chop.error ? (
          <div className="px-4 pt-3 md:px-6">
            <ErrorNote error={`Chop etish nusxasi yuklanmadi: ${talabnomaXatoMatni(chop.error)}`} />
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {listQuery.isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : listQuery.error ? (
            <div className="p-4 md:p-6">
              <ErrorNote error={listQuery.error} />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              title={holat !== '' || filtrBormi(filtr) ? "Filtrga mos talabnoma yo'q" : 'Talabnoma hali yuborilmagan'}
            />
          ) : (
            <div className="table-wrap">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Raqam</th>
                    <th>Sana</th>
                    <th>Mijoz</th>
                    <th className="!text-right">Summa</th>
                    <th>Kim yubordi</th>
                    <th title="Shartnomaning CRM'dagi hozirgi holati">Holat</th>
                    <th title="Talabnomaning yuborilish holati">Yuborish</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((t) => (
                    <tr key={t.id} className={clsx(t.id === tanlangan && '!bg-ink-800/70')}>
                      <td className="whitespace-nowrap font-medium tabular-nums text-ink-100">{etRaqam(t.raqam)}</td>
                      <td className="whitespace-nowrap text-ink-400">{dateUz(t.sentAt ?? t.createdAt)}</td>
                      <td>
                        <MijozNomi
                          fullName={t.fullName}
                          className="text-ink-100"
                          onOpen={() => setBatafsil({ clientId: t.clientId, fullName: t.fullName })}
                        />
                        <p className="text-[11px] text-ink-500">
                          №{t.contractNo}
                          {t.objectName ? ` · ${t.objectName}` : ''}
                        </p>
                      </td>
                      <td className="whitespace-nowrap text-right tabular-nums text-ink-200">{som(t.summa)}</td>
                      <td className="whitespace-nowrap text-ink-400">{t.sentByName ?? '—'}</td>
                      <td>
                        <HolatChip holat={t.shartnomaHolati} />
                      </td>
                      <td>
                        <span className={clsx('chip', HOLAT_COLOR[t.holat])}>{HOLAT_LABEL[t.holat]}</span>
                        {t.holat === 'xato' && t.xatoSababi ? (
                          <p className="mt-1 max-w-[16rem] text-[11px] text-red-300">{t.xatoSababi}</p>
                        ) : null}
                        {osilganmi(t) ? (
                          <p className="mt-1 max-w-[16rem] text-[11px] text-amber-300">
                            10 daqiqadan beri tugamadi — qayta urinib ko'ring
                          </p>
                        ) : null}
                      </td>
                      <td>
                        <div className="flex flex-wrap justify-end gap-1">
                          <button
                            type="button"
                            className="btn-ghost !px-2 !py-1 text-xs"
                            onClick={() => setBatafsil({ clientId: t.clientId, fullName: t.fullName })}
                          >
                            Batafsil
                          </button>
                          {/* PDF faqat yuborishga yetib kelganda saqlanadi — undan oldin ochadigan narsa yo'q. */}
                          {t.pdfPath ? (
                            <button
                              type="button"
                              className="btn-ghost !px-2 !py-1 text-xs"
                              onClick={() => setTanlangan(t.id)}
                            >
                              PDF
                            </button>
                          ) : null}
                          {/* Muhr va imzosiz nusxa: operator chop etib, qo'lda muhrlab arxivlaydi. */}
                          {t.holat === 'yuborildi' ? (
                            <button
                              type="button"
                              className="btn-ghost !px-2 !py-1 text-xs"
                              disabled={sozlanmagan || chop.isPending}
                              onClick={() => chop.mutate(t)}
                            >
                              {chop.isPending && chop.variables?.id === t.id ? 'Tayyorlanmoqda…' : 'Chop etish uchun (muhrsiz)'}
                            </button>
                          ) : null}
                          {/* Osilgan `yuborilmoqda` (jarayon yiqilgan) ham qayta urinishga ochiq —
                              server o'sha 10 daqiqalik chegara bilan qabul qiladi. Bekor esa faqat xatoda. */}
                          {canSend && (t.holat === 'xato' || osilganmi(t)) ? (
                            <>
                              <button
                                type="button"
                                className="btn-primary !px-2 !py-1 text-xs"
                                disabled={sozlanmagan || bajar.isPending}
                                onClick={() => {
                                  bajar.reset();
                                  setAmal({ tur: 'qayta', t });
                                }}
                              >
                                Qayta urinish
                              </button>
                              {t.holat === 'xato' ? (
                                <button
                                  type="button"
                                  className="btn-ghost !px-2 !py-1 text-xs text-red-300"
                                  disabled={bajar.isPending}
                                  onClick={() => {
                                    bajar.reset();
                                    setAmal({ tur: 'bekor', t });
                                  }}
                                >
                                  Bekor qilish
                                </button>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {sahifalar > 1 ? (
          <div className="flex items-center justify-between border-t border-ink-800 px-4 py-2 text-xs text-ink-400 md:px-6">
            <button type="button" className="btn-ghost !py-1 text-xs" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              ← Oldingi
            </button>
            <span className="tabular-nums">
              {page} / {sahifalar}
            </span>
            <button
              type="button"
              className="btn-ghost !py-1 text-xs"
              disabled={page >= sahifalar}
              onClick={() => setPage(page + 1)}
            >
              Keyingi →
            </button>
          </div>
        ) : null}
      </div>

      <aside className="flex min-h-0 flex-col border-t border-ink-800 lg:border-t-0">
        {!qator || !qator.pdfPath ? (
          <EmptyState title="Talabnomani tanlang" hint="«PDF» bosilsa hujjat shu yerda ochiladi." />
        ) : (
          <>
            <div className="border-b border-ink-800 px-4 py-3">
              <p className="font-medium text-ink-100">
                {etRaqam(qator.raqam)} · {qator.fullName}
              </p>
              <p className="text-xs text-ink-500">
                Shartnoma №{qator.contractNo}
                {qator.muddatSanasi ? ` · muddat ${dateUz(qator.muddatSanasi)}` : ''}
              </p>
            </div>
            <div className="min-h-0 flex-1 p-3">
              <TalabnomaPdfKorinish
                key={qator.id}
                path={talabnomaPdfYoli(qator.id)}
                // Qayta urinishdan keyin PDF yangilanadi — holat o'zgarsa qayta yuklaymiz.
                kalit={`${qator.holat}:${qator.raqam ?? ''}`}
                title={`Talabnoma ${etRaqam(qator.raqam)}`}
              />
            </div>
          </>
        )}
      </aside>

      {amal ? (
        <Tasdiq
          title={amal.tur === 'qayta' ? 'Qayta urinish' : 'Talabnomani bekor qilish'}
          tugma={amal.tur === 'qayta' ? 'Qayta yuborish' : 'Bekor qilish'}
          danger={amal.tur === 'bekor'}
          pending={bajar.isPending}
          onClose={() => setAmal(null)}
          onConfirm={() => bajar.mutate({ tur: amal.tur, id: amal.t.id })}
        >
          <p className="text-sm font-medium text-ink-100">
            {etRaqam(amal.t.raqam)} · {amal.t.fullName}
          </p>
          <p className="text-sm text-ink-300">
            {amal.tur === 'qayta'
              ? 'Talabnoma o\'sha raqam bilan mijozga Telegram orqali qayta yuboriladi'
              : 'Talabnoma bekor qilinadi va mijozga yuborilmaydi'}
          </p>
        </Tasdiq>
      ) : null}

      <MijozBatafsilOyna mijoz={batafsil} onClose={() => setBatafsil(null)} />
    </div>
  );
}

// ─── Umumiy ─────────────────────────────────────────────────────────────

const bekorJarayonida = (h: ShartnomaHolati | null): boolean => h?.kalit === BEKOR_JARAYONI;

/** Qatorlardagi obyekt nomlari — takrorsiz, qirqilgan, alifbo tartibida. */
function obyektVariantlari(items: readonly { objectName: string | null }[]): string[] {
  const nomlar = items.map((q) => (q.objectName ?? '').trim()).filter((n) => n !== '');
  return [...new Set(nomlar)].sort((a, b) => a.localeCompare(b));
}

/**
 * Shartnomaning CRM holati. «Проц. отказ» — sariq: bekor qilinayotgan
 * shartnomaga talabnoma yuborishdan oldin operator ko'zi tushsin.
 */
function HolatChip({ holat }: { holat: ShartnomaHolati | null }) {
  if (!holat) return <span className="text-ink-500">—</span>;
  const bekor = bekorJarayonida(holat);
  return (
    <span
      className={clsx(
        'chip whitespace-nowrap',
        bekor ? 'bg-amber-500/20 font-medium text-amber-300' : 'bg-ink-700/60 text-ink-300',
      )}
      title={bekor ? 'Shartnoma bekor qilish jarayonida' : undefined}
    >
      {holat.nomi}
    </span>
  );
}

/**
 * «Holat» va «Obyekt» tanlovlari. Tanlangan qiymat variantlarda bo'lmasa
 * ham (ro'yxat yangilanib chiqib ketgan) ro'yxatda qoladi — aks holda
 * select «Hammasi» ni ko'rsatib, filtr esa jimgina ishlab turardi.
 */
function FiltrPaneli({
  filtr,
  onFiltr,
  holatlar,
  obyektlar,
}: {
  filtr: Filtr;
  onFiltr: (f: Filtr) => void;
  holatlar: readonly ShartnomaHolati[];
  obyektlar: readonly string[];
}) {
  const holatVariantlari =
    filtr.holat === '' || holatlar.some((h) => h.kalit === filtr.holat)
      ? holatlar
      : [...holatlar, { kalit: filtr.holat, nomi: filtr.holat }];
  const obyektVariantlari = filtr.obyekt === '' || obyektlar.includes(filtr.obyekt) ? obyektlar : [...obyektlar, filtr.obyekt];
  return (
    <>
      <label className="flex items-center gap-1.5 text-xs text-ink-500">
        Holat
        <select
          className="input !py-1 text-xs max-md:min-h-[40px]"
          value={filtr.holat}
          onChange={(e) => onFiltr({ ...filtr, holat: e.target.value })}
        >
          <option value="">Hammasi</option>
          {holatVariantlari.map((h) => (
            <option key={h.kalit} value={h.kalit}>
              {h.nomi}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5 text-xs text-ink-500">
        Obyekt
        <select
          className="input !py-1 max-w-[14rem] text-xs max-md:min-h-[40px]"
          value={filtr.obyekt}
          onChange={(e) => onFiltr({ ...filtr, obyekt: e.target.value })}
        >
          <option value="">Hammasi</option>
          {obyektVariantlari.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

/**
 * Mijoz ismi — bosilsa «Batafsil» oynasi ochiladi. Qator bosilishi
 * (tanlash → PDF) ishlamasin: `stopPropagation`.
 */
function MijozNomi({ fullName, className, onOpen }: { fullName: string; className: string; onOpen: () => void }) {
  return (
    <button
      type="button"
      className={clsx(className, 'text-left hover:text-brand-300 hover:underline')}
      title="Batafsil: shartnoma va suhbat tarixi"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      {fullName}
    </button>
  );
}

function TabTugma({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'rounded-lg px-3 py-1.5 text-sm font-medium tabular-nums transition-colors',
        active ? 'bg-ink-800 text-ink-50' : 'text-ink-400 hover:bg-ink-900 hover:text-ink-200',
      )}
    >
      {children}
    </button>
  );
}

/** Mijozga rasmiy xat ketadi — bir bosishda emas, tasdiq bilan. */
function Tasdiq({
  title,
  tugma,
  danger = false,
  pending,
  onClose,
  onConfirm,
  children,
}: {
  title: string;
  tugma: string;
  danger?: boolean;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
  children: ReactNode;
}) {
  return (
    <Sheet
      open
      onClose={() => {
        if (!pending) onClose();
      }}
      title={title}
      maxWidth="max-w-md"
    >
      <div className="space-y-3 p-4 md:p-5">
        {children}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" disabled={pending} onClick={onClose}>
            Ortga
          </button>
          <button type="button" className={danger ? 'btn-danger' : 'btn-primary'} disabled={pending} onClick={onConfirm}>
            {pending ? <Spinner /> : null}
            {tugma}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
