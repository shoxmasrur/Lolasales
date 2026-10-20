/**
 * Tushumlar eksporti: har bir bank to'lovining belgilari va yig'indilar.
 *
 * SQL faqat xom ma'lumotni beradi, qoida shu yerda — aks holda "kechikkan"
 * ta'rifini sinab bo'lmasdi va u ekrandagi raqam bilan jimgina ajralib
 * ketardi.
 *
 * Sanalar YYYY-MM-DD satr: `date_paid` va grafik ustunlari vaqtsiz `DATE`,
 * satr taqqoslash esa vaqt mintaqasi siljishidan xoli.
 */

export interface GrafikQatori {
  /** Grafik bo'yicha muddat. */
  readonly datePayment: string;
  /** CRM qatorni yopgan sana; qisman to'langanda oxirgi to'lov sanasi. */
  readonly datePaid: string | null;
  /** paid | partially | waiting */
  readonly status: string;
}

export interface XomTolov {
  readonly eventId: string;
  readonly contractNo: string;
  readonly clientName: string;
  readonly objectName: string | null;
  readonly amount: number;
  readonly datePaid: string;
  readonly paymentType: string | null;
  readonly purpose: string | null;
  readonly isProblematic: boolean;
  /** Birinchi muvaffaqiyatli chiquvchi xabar sanasi; xabar ketmagan bo'lsa null. */
  readonly anchorDate: string | null;
  readonly grafik: readonly GrafikQatori[];
}

/** `nomalum` — grafik yo'q; bunday to'lovni "kechikmagan" deyish yolg'on bo'lardi. */
export type KechikishBelgisi = 'ha' | 'yoq' | 'nomalum';

export interface TushumQatori extends XomTolov {
  readonly gaplashilgan: boolean;
  readonly xabardanKeyinKun: number | null;
  readonly kechikkan: KechikishBelgisi;
  readonly kechikishKuni: number | null;
}

export type Qamrov = 'all' | 'contacted' | 'overdue';
export const QAMROVLAR: readonly Qamrov[] = ['all', 'contacted', 'overdue'];

const KUN_MS = 24 * 60 * 60 * 1000;

/** `katta − kichik` kunlarda. */
export function kunFarqi(katta: string, kichik: string): number {
  return Math.round(
    (Date.parse(`${katta}T00:00:00Z`) - Date.parse(`${kichik}T00:00:00Z`)) / KUN_MS,
  );
}

/**
 * To'lov kuni D da muddati o'tgan va hali yopilmagan grafik qatori bormi.
 *
 * `datePaid >= D` ham OCHIQ sanaladi: qatorni aynan shu to'lov yopgan
 * bo'lishi mumkin — demak to'lov kelguncha u kechikkan edi. `paid` bo'lmagan
 * qator sanasidan qat'i nazar ochiq: qisman to'lovda `datePaid` oxirgi
 * bo'lak sanasi, qarz esa yopilmagan.
 */
export function kechikishHolati(
  datePaid: string,
  grafik: readonly GrafikQatori[],
): { kechikkan: KechikishBelgisi; kechikishKuni: number | null } {
  if (grafik.length === 0) return { kechikkan: 'nomalum', kechikishKuni: null };

  let engEski: string | null = null;
  for (const q of grafik) {
    if (q.datePayment >= datePaid) continue;
    const ochiq = q.status !== 'paid' || q.datePaid === null || q.datePaid >= datePaid;
    if (ochiq && (engEski === null || q.datePayment < engEski)) engEski = q.datePayment;
  }

  return engEski === null
    ? { kechikkan: 'yoq', kechikishKuni: null }
    : { kechikkan: 'ha', kechikishKuni: kunFarqi(datePaid, engEski) };
}

/** Hisobot sahifasi bilan bir xil qoida: birinchi xabar kuni yoki undan keyin. */
export function belgila(x: XomTolov): TushumQatori {
  const anchor = x.anchorDate;
  const gaplashilgan = anchor !== null && x.datePaid >= anchor;
  return {
    ...x,
    gaplashilgan,
    xabardanKeyinKun: gaplashilgan ? kunFarqi(x.datePaid, anchor) : null,
    ...kechikishHolati(x.datePaid, x.grafik),
  };
}

export function qamrovgaMos(r: TushumQatori, qamrov: Qamrov): boolean {
  if (qamrov === 'contacted') return r.gaplashilgan;
  if (qamrov === 'overdue') return r.kechikkan === 'ha';
  return true;
}

export interface ShartnomaYigindisi {
  readonly contractNo: string;
  readonly clientName: string;
  readonly objectName: string | null;
  readonly soni: number;
  readonly jami: number;
  readonly gaplashilgandanKeyin: number;
  readonly kechikkan: number;
  readonly anchorDate: string | null;
}

/** Har shartnoma bitta qator, jami summa bo'yicha kamayish tartibida. */
export function shartnomalarKesimi(rows: readonly TushumQatori[]): ShartnomaYigindisi[] {
  const map = new Map<string, ShartnomaYigindisi>();
  for (const r of rows) {
    const eski = map.get(r.contractNo);
    map.set(r.contractNo, {
      contractNo: r.contractNo,
      clientName: r.clientName,
      objectName: r.objectName,
      soni: (eski?.soni ?? 0) + 1,
      jami: (eski?.jami ?? 0) + r.amount,
      gaplashilgandanKeyin: (eski?.gaplashilgandanKeyin ?? 0) + (r.gaplashilgan ? r.amount : 0),
      kechikkan: (eski?.kechikkan ?? 0) + (r.kechikkan === 'ha' ? r.amount : 0),
      anchorDate: r.anchorDate ?? eski?.anchorDate ?? null,
    });
  }
  return [...map.values()].sort(
    (a, b) => b.jami - a.jami || a.contractNo.localeCompare(b.contractNo),
  );
}

export interface SoniSumma {
  readonly soni: number;
  readonly summa: number;
}

export interface JamiYigindi {
  readonly hammasi: SoniSumma;
  readonly gaplashilgan: SoniSumma;
  readonly kechikkan: SoniSumma;
  readonly nomalum: SoniSumma;
  readonly bahsli: SoniSumma;
}

export function jamiYigindi(rows: readonly TushumQatori[]): JamiYigindi {
  const yig = (f: (r: TushumQatori) => boolean): SoniSumma => {
    const mos = rows.filter(f);
    return { soni: mos.length, summa: mos.reduce((s, r) => s + r.amount, 0) };
  };
  return {
    hammasi: yig(() => true),
    gaplashilgan: yig((r) => r.gaplashilgan),
    kechikkan: yig((r) => r.kechikkan === 'ha'),
    nomalum: yig((r) => r.kechikkan === 'nomalum'),
    bahsli: yig((r) => r.isProblematic),
  };
}

/** 366 kun — kabisa yilini ham to'liq sig'diradi. */
const ENG_UZUN_FARQ = 365;

/**
 * Regexga mos, lekin kalendarda yo'q sana (masalan `2026-02-31`, `2026-13-01`)ni
 * ushlaydi — `Date.parse` bunday sanalarni "to'g'rilab" keyingi kunga aylantirib
 * qo'yadi, shuning uchun natija orqaga ISO ko'rinishga qaytarilib solishtiriladi.
 */
function sanaHaqiqiymi(iso: string): boolean {
  const vaqt = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(vaqt)) return false;
  return new Date(vaqt).toISOString().slice(0, 10) === iso;
}

export function eksportDavriXatosi(from: string, to: string): string | null {
  if (!sanaHaqiqiymi(from) || !sanaHaqiqiymi(to)) return "Sana noto'g'ri";
  if (from > to) return 'Boshlanish sanasi tugash sanasidan keyin';
  if (kunFarqi(to, from) > ENG_UZUN_FARQ) return 'Davr 366 kundan oshmasin';
  return null;
}
