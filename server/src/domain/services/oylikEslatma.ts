import { ishKunimi, ishKuniga, type Bayram } from '@/domain/entities/bayram';

/**
 * Oylik to'lov eslatmasi — qachon va kimga (2026-09-22).
 *
 * Avval yozilgan mijozga yangi oylik to'lov sanasi kelganda bir marta
 * eslatiladi. Ikki guruh:
 *   • B — faqat shu oy to'lovi qolgan: sanadan OLDIN yumshoq eslatma;
 *   • C — ustiga oldingi oylardan ham to'lanmagani bor: sana KUNI,
 *     jami summa bilan.
 *
 * Modul bazaga ham, soatga ham tegmaydi — sanalar `YYYY-MM-DD` satri.
 */

export type EslatmaGuruhi = 'B' | 'C';

/** Sanadan keyin shuncha kun ichida eslatma hali ketishi mumkin (yetkazib olish). */
export const ESLATMA_OYNASI_KUN = 30;

export interface EslatmaQoidalari {
  /** B: sanadan necha kun oldin. */
  readonly oldinKun: number;
  /** C: sanadan necha kun keyin (0 — sana kuni). */
  readonly keyinKun: number;
  readonly bayramlar: Bayram[];
  readonly weekdays: number[];
}

/** Shartnoma jadvalining bitta qatori — `contract_payments` dan. */
export interface JadvalQatori {
  readonly contractId: string;
  /** YYYY-MM-DD */
  readonly datePayment: string;
  readonly amount: number;
  readonly amountPaid: number;
  readonly status: string;
  readonly type: string;
}

export const qatorKaliti = (contractId: string, datePayment: string): string => `${contractId}|${datePayment}`;

const kalit = (r: JadvalQatori): string => qatorKaliti(r.contractId, r.datePayment);

/** `2026-09-30`, 1 → `2026-10-01`. UTC — mintaqa siljishi bo'lmasin. */
export function kunQosh(sanaIso: string, kun: number): string {
  const d = new Date(`${sanaIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + kun);
  return d.toISOString().slice(0, 10);
}

/**
 * Shu sana ish kuni bo'lsa — o'zi, aks holda OLDINGI ish kuni.
 * `ishKuniga` ning ko'zgusi; 60 kunlik chegara o'sha sababdan.
 */
export function oldingiIshKuniga(sanaIso: string, bayramlar: Bayram[], weekdays: number[]): string {
  let kun = sanaIso;
  for (let i = 0; i < 60; i += 1) {
    if (ishKunimi(kun, bayramlar, weekdays)) return kun;
    kun = kunQosh(kun, -1);
  }
  throw new Error(`${sanaIso} dan oldin 60 kun ichida ish kuni topilmadi — sozlamani tekshiring`);
}

/**
 * Eslatma eng erta qaysi kuni ketadi.
 *
 * B orqaga suriladi: "sana yaqinlashyapti" degan eslatma sanadan KEYIN
 * kelsa ma'nosi qolmaydi. C oldinga suriladi: sana kelmasdan "kechikdi"
 * deyish mumkin emas.
 */
export function boshlanishSanasi(datePayment: string, guruh: EslatmaGuruhi, q: EslatmaQoidalari): string {
  return guruh === 'B'
    ? oldingiIshKuniga(kunQosh(datePayment, -q.oldinKun), q.bayramlar, q.weekdays)
    : ishKuniga(kunQosh(datePayment, q.keyinKun), q.bayramlar, q.weekdays);
}

export function oynadami(datePayment: string, guruh: EslatmaGuruhi, todayIso: string, q: EslatmaQoidalari): boolean {
  return boshlanishSanasi(datePayment, guruh, q) <= todayIso
    && todayIso <= kunQosh(datePayment, ESLATMA_OYNASI_KUN);
}

/**
 * Bu sana uchun eslatma bugun HALI hech qaysi guruhda ketolmaydi.
 *
 * Kuzatuvchi nomzodlarni oldindan (bir necha kun ko'proq) oladi — ularni
 * CRM'dan har tsiklda sinxronlash behuda. B ning boshlanishi har doim
 * C nikidan oldin (`D - oldinKun` orqaga, `D + keyinKun` oldinga
 * suriladi), shuning uchun B bo'yicha erta bo'lsa — ikkalasida ham erta:
 * sinxni o'tkazib yuborish tayyor eslatmani yashirmaydi.
 */
export function ertami(datePayment: string, todayIso: string, q: EslatmaQoidalari): boolean {
  return boshlanishSanasi(datePayment, 'B', q) > todayIso;
}

const qoldiq = (r: JadvalQatori): number => Math.max(0, r.amount - r.amountPaid);
const tolanmaganmi = (r: JadvalQatori): boolean => r.status !== 'paid' && qoldiq(r) > 0;

/** Har shartnoma bo'yicha eng kech sanali qator — "shu oy to'lovi". */
function asosiyKalitlar(ochiq: readonly JadvalQatori[]): Set<string> {
  const eng = new Map<string, JadvalQatori>();
  for (const r of ochiq) {
    const bor = eng.get(r.contractId);
    if (!bor || r.datePayment > bor.datePayment) eng.set(r.contractId, r);
  }
  return new Set([...eng.values()].map(kalit));
}

/** "Asosiy" qatorlardan TASHQARI, sanasi o'tgan va to'lanmagan qatorlar. */
function boshqaKechikkanlar(jadval: readonly JadvalQatori[], asosiy: ReadonlySet<string>, todayIso: string): JadvalQatori[] {
  return jadval.filter((r) => r.datePayment < todayIso && tolanmaganmi(r) && !asosiy.has(kalit(r)));
}

export interface EslatmaQarori {
  /** Nomzod edi, lekin yangilangan jadvalda to'langan — `skipped/tolangan` bo'lib yoziladi. */
  readonly tolangan: JadvalQatori[];
  readonly guruh: EslatmaGuruhi;
  /** Bugun yuboriladiganlar. Bo'sh — hali vaqti emas. */
  readonly tayyor: JadvalQatori[];
}

/**
 * Bitta mijoz bo'yicha qaror — YANGILANGAN jadvaldan.
 *
 * `jadval` — mijozning BARCHA "Сотилди" shartnomalari qatorlari (boshlang'ich
 * to'lov ham): C guruhini aniqlash uchun hamma kechikish kerak.
 */
export function eslatmaQarori(
  nomzodKalitlari: ReadonlySet<string>,
  jadval: readonly JadvalQatori[],
  todayIso: string,
  minDebt: number,
  q: EslatmaQoidalari,
): EslatmaQarori {
  const nomzodlar = jadval.filter((r) => r.type === 'monthly' && nomzodKalitlari.has(kalit(r)));
  const tolangan = nomzodlar.filter((r) => !tolanmaganmi(r));
  const ochiq = nomzodlar.filter(tolanmaganmi);

  const boshqa = boshqaKechikkanlar(jadval, asosiyKalitlar(ochiq), todayIso)
    .reduce((s, r) => s + qoldiq(r), 0);
  const guruh: EslatmaGuruhi = boshqa > minDebt ? 'C' : 'B';

  return { tolangan, guruh, tayyor: ochiq.filter((r) => oynadami(r.datePayment, guruh, todayIso, q)) };
}

export interface EslatmaTolovi {
  readonly contractNo: string;
  /** YYYY-MM-DD */
  readonly datePayment: string;
  readonly qoldiq: number;
}

/** Agentga beriladigan tayyor faktlar — modelga hisoblatilmaydi. */
export interface OylikEslatmaMalumoti {
  readonly guruh: EslatmaGuruhi;
  /** Eslatilayotgan oylik to'lovlar (shu oy va oynadagi eski nomzodlar). */
  readonly tolovlar: EslatmaTolovi[];
  /** C: boshqa kechikkan to'lovlar. B da bo'sh. */
  readonly kechikkanlar: EslatmaTolovi[];
  /** Eslatilayotgan HAMMA to'lovning sanasi bugundan oldin. */
  readonly sanaOtgan: boolean;
  /** `tolovlar` + `kechikkanlar` qoldiqlari yig'indisi. */
  readonly jami: number;
  /** Faqat bitta shartnoma — shartnoma raqami tilga olinmaydi. */
  readonly bittaShartnoma: boolean;
}

export function eslatmaMalumoti(
  guruh: EslatmaGuruhi,
  tayyor: readonly JadvalQatori[],
  jadval: readonly JadvalQatori[],
  raqamlar: ReadonlyMap<string, string>,
  todayIso: string,
): OylikEslatmaMalumoti {
  const tolov = (r: JadvalQatori): EslatmaTolovi => ({
    contractNo: raqamlar.get(r.contractId) ?? '',
    datePayment: r.datePayment,
    qoldiq: qoldiq(r),
  });
  const tartib = (a: EslatmaTolovi, b: EslatmaTolovi): number => a.datePayment.localeCompare(b.datePayment);

  const tayyorKalitlari = new Set(tayyor.map(kalit));
  const tolovlar = tayyor.map(tolov).sort(tartib);
  const kechikkanlar = guruh === 'C'
    ? boshqaKechikkanlar(jadval, tayyorKalitlari, todayIso).map(tolov).sort(tartib)
    : [];
  const hammasi = [...tolovlar, ...kechikkanlar];

  return {
    guruh,
    tolovlar,
    kechikkanlar,
    sanaOtgan: tolovlar.every((t) => t.datePayment < todayIso),
    jami: hammasi.reduce((s, t) => s + t.qoldiq, 0),
    bittaShartnoma: new Set(hammasi.map((t) => t.contractNo)).size <= 1,
  };
}
