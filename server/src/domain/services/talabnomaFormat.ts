/**
 * Elektron talabnoma uchun sof formatlar (o'zbek kirillcha). Hech narsani
 * import qilmaydi: `shared/config` zanjiriga tushmasligi uchun («Birlik
 * testlari»da ishlaydi).
 */

const BIRLIK = ['', 'бир', 'икки', 'уч', 'тўрт', 'беш', 'олти', 'етти', 'саккиз', 'тўққиз'];
const ONLIK = ['', 'ўн', 'йигирма', 'ўттиз', 'қирқ', 'эллик', 'олтмиш', 'етмиш', 'саксон', 'тўқсон'];
// Katta birliklar: 1000 ** i.
const KATTA = ['', 'минг', 'миллион', 'миллиард'];

/** 1..999 → so'z. Yuzlik oldidan son har doim aytiladi («бир юз»), shablon uslubi. */
function uchXona(n: number): string {
  const qismlar: string[] = [];
  const yuz = Math.floor(n / 100);
  const on = Math.floor((n % 100) / 10);
  const bir = n % 10;
  if (yuz) qismlar.push(BIRLIK[yuz] ?? '', 'юз');
  if (on) qismlar.push(ONLIK[on] ?? '');
  if (bir) qismlar.push(BIRLIK[bir] ?? '');
  return qismlar.join(' ');
}

/** Butun so'm → kichik harfli so'z. 1000 → «бир минг» (shablondagi uslub). */
export function sonSozBilan(n: number): string {
  let qolgan = Math.floor(Math.abs(n));
  if (qolgan === 0) return 'нол';
  const qismlar: string[] = [];
  for (let i = 0; qolgan > 0; i += 1) {
    const guruh = qolgan % 1000;
    qolgan = Math.floor(qolgan / 1000);
    if (guruh) qismlar.unshift([uchXona(guruh), KATTA[i] ?? ''].filter(Boolean).join(' '));
  }
  return qismlar.join(' ');
}

/** Tiyin so'mdan alohida butun songa aylanadi (suzuvchi nuqta xatosiz). */
function bolish(summa: number): { som: number; tiyin: number } {
  const jami = Math.round(summa * 100);
  return { som: Math.floor(jami / 100), tiyin: jami % 100 };
}

/** `(… сўм NN тийин)` */
export function summaSozBilan(summa: number): string {
  const { som, tiyin } = bolish(summa);
  return `(${sonSozBilan(som)} сўм ${String(tiyin).padStart(2, '0')} тийин)`;
}

/** `18 900 000,00` — minglik ajratgich oddiy bo'shliq (U+0020). */
export function summaRaqamda(summa: number): string {
  const { som, tiyin } = bolish(summa);
  const guruh = String(som).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${guruh},${String(tiyin).padStart(2, '0')}`;
}

/** `ET-01`; raqam hali yo'q (ko'rinish) bo'lsa `ET-__`. */
export function talabnomaRaqami(n: number | null): string {
  return n == null ? 'ET-__' : `ET-${String(n).padStart(2, '0')}`;
}

/** ISO `YYYY-MM-DD` → `16.10.2026 й` (satrdan, vaqt mintaqasiga bog'lanmasdan). */
export function sanaQisqa(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y} й`;
}

const OYLAR = [
  'январ', 'феврал', 'март', 'апрел', 'май', 'июн',
  'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр',
];

/** `"12" март 2025 йил`; `contract_date` DATE → UTC yarim tun, shuning uchun UTC kun/oy. */
export function shartnomaSanasi(d: Date | null): string {
  if (!d) return '';
  const kun = String(d.getUTCDate()).padStart(2, '0');
  return `"${kun}" ${OYLAR[d.getUTCMonth()] ?? ""} ${d.getUTCFullYear()} йил`;
}
