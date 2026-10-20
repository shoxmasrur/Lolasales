import { Buffer } from 'node:buffer';

/**
 * TL obyektlarni jurnalga yozish uchun xavfsiz JSON'ga aylantiradi.
 *
 * NEGA ALOHIDA MODUL: TL obyektni to'g'ridan-to'g'ri `JSON.stringify`
 * qilib bo'lmaydi. Ichida `big-integer` obyektlari (JSON'da `{}` bo'lib
 * qoladi), `Buffer` lar (baytma-bayt raqamlar massiviga yoyiladi) va
 * kutubxonaning o'ziga qaytadigan havolalar (`_client`) bor — oxirgisi
 * halqa yasab, sessiyani ham jurnalga sudrab kelardi.
 *
 * UCHTA CHEGARA — UCHALASI HAM MAJBURIY:
 *  1. Yashirish — parol va SMS kodi hech qachon jadvalga tushmasin.
 *  2. Kesish — bitta chaqiruv jurnalga yuzlab kilobayt tiqmasin.
 *  3. Chuqurlik va halqa — cheksiz rekursiyaga tushib qolmasin.
 */

/** Bitta satr shuncha belgidan uzun bo'lsa kesiladi. */
const MAX_SATR = 500;
/** Massivdan shuncha element olinadi, qolgani sanab o'tiladi. */
const MAX_MASSIV = 20;
/** Shu chuqurlikdan nariga o'tilmaydi. */
const MAX_CHUQURLIK = 6;
/** Bitta payload shuncha baytdan oshsa, butunlay qisqartiriladi. */
export const MAX_PAYLOAD_BAYT = 8 * 1024;

/**
 * Hech qachon jurnalga tushmaydigan kalitlar.
 *
 * `srpId`, `A`, `M1` — 2FA hisob-kitobining oraliq qiymatlari (SRP).
 * Bularning barchasi `bytes` turida, ya'ni allaqachon yuqoridagi
 * `Uint8Array` qoidasi bilan `<N bayt>` ga almashtiriladi — bu yozuv
 * shunchaki ikkinchi himoya qatlami (belt-and-braces), qoidaning o'zi
 * emas.
 *
 * `hint`, `emailUnconfirmedPattern`, `loginEmailPattern` —
 * `account.Password` javobidagi oddiy matn maydonlari (2FA login
 * paytida `account.GetPassword()` javobi jurnalga yoziladi). `hint`
 * parolni sezilarli darajada toraytiradi, ikkalasi esa tiklash
 * emailining bir qismini fosh qiladi — modul hech qachon kredensial
 * chiqmasligini va'da qilgani uchun bular ham yashiriladi.
 */
const MAXFIY = new Set([
  'password',
  'newPasswordHash',
  'srpId',
  'A',
  'M1',
  'phoneCode',
  'phoneCodeHash',
  'apiHash',
  'session',
  'authKey',
  'hint',
  'emailUnconfirmedPattern',
  'loginEmailPattern',
]);

/** Kutubxonaning texnik maydonlari — ma'no bermaydi, joyni yeydi. */
const TEXNIK = new Set(['CONSTRUCTOR_ID', 'SUBCLASS_OF_ID', 'classType', 'className', 'originalArgs']);

/** `big-integer` obyektimi. Paket instansiyalarida shu metod bor. */
function bigIntMi(v: object): boolean {
  return typeof (v as { toJSNumber?: unknown }).toJSNumber === 'function';
}

/** TL obyektning nomi (`messages.SendMessage`), bo'lmasa `null`. */
function klassNomi(v: unknown): string | null {
  const nom = (v as { className?: unknown } | null)?.className;
  return typeof nom === 'string' && nom !== '' ? nom : null;
}

function satrniKes(s: string): string {
  return s.length <= MAX_SATR ? s : `${s.slice(0, MAX_SATR)}…(${s.length} belgi)`;
}

function qiymat(v: unknown, chuqurlik: number, yolda: Set<object>): unknown {
  if (v === null || v === undefined) return null;

  const t = typeof v;
  if (t === 'boolean' || t === 'number') return v;
  if (t === 'bigint') return String(v);
  if (t === 'string') return satrniKes(v as string);
  // Funksiya va simvol jurnalda hech narsa anglatmaydi.
  if (t === 'function' || t === 'symbol') return undefined;
  if (t !== 'object') return String(v);

  const o = v as object;
  if (o instanceof Date) return o.toISOString();
  // `Buffer` ham `Uint8Array` — ikkalasi shu shart bilan qamraladi.
  if (o instanceof Uint8Array) return `<${o.length} bayt>`;
  if (bigIntMi(o)) return String(o);

  // Halqa tekshiruvi chuqurlik tekshiruvidan OLDIN: aks holda halqa
  // "…" bo'lib ko'rinib, sababi noma'lum qolardi.
  if (yolda.has(o)) return '…halqa';
  if (chuqurlik >= MAX_CHUQURLIK) return '…';

  yolda.add(o);
  try {
    if (Array.isArray(o)) {
      const bosh: unknown[] = o.slice(0, MAX_MASSIV).map((x) => qiymat(x, chuqurlik + 1, yolda));
      if (o.length > MAX_MASSIV) bosh.push(`…yana ${o.length - MAX_MASSIV} ta`);
      return bosh;
    }

    const out: Record<string, unknown> = {};
    const nom = klassNomi(o);
    if (nom) out._ = nom;

    for (const [k, val] of Object.entries(o)) {
      // Pastki chiziq bilan boshlangan kalitlar — kutubxonaning ichki
      // havolalari (`_client`, `_chat`, `_sender`). Ular orqali butun
      // klient, u bilan birga sessiya ham jurnalga tushib ketardi.
      if (k.startsWith('_')) continue;
      if (TEXNIK.has(k)) continue;
      if (MAXFIY.has(k)) {
        out[k] = '[maxfiy]';
        continue;
      }
      const s = qiymat(val, chuqurlik + 1, yolda);
      if (s !== undefined) out[k] = s;
    }
    return out;
  } finally {
    // Yo'ldan chiqamiz: bir xil obyekt ikki JOYDA uchrasa bu halqa emas,
    // uni "…halqa" deb belgilash noto'g'ri bo'lardi.
    yolda.delete(o);
  }
}

/** TL obyektning metod nomi. */
export function tgMetod(v: unknown): string {
  return klassNomi(v) ?? "noma'lum";
}

/**
 * Jurnalga yozish uchun tayyor qiymat. HECH QACHON xato otmaydi —
 * jurnal yozuvi Telegram chaqiruvini yiqitmasligi kerak.
 */
export function tgTana(v: unknown): unknown {
  try {
    const natija = qiymat(v, 0, new Set<object>());
    const json = JSON.stringify(natija);
    // `Buffer.byteLength`, `json.length` EMAS: chegara BAYTDA o'lchanadi,
    // `length` esa UTF-16 birliklarini sanaydi. Kirill matn yoki o'zbekcha
    // apostrof (`ʻ`) ikki barobar joy egallaydi — `length` bilan tekshirsak,
    // 8 KB chegarasi amalda 16 KB bo'lib ketardi.
    const bayt = json === undefined ? 0 : Buffer.byteLength(json, 'utf8');
    if (bayt > MAX_PAYLOAD_BAYT) {
      const nom = klassNomi(v);
      const qisqa: Record<string, unknown> = { qisqartirildi: true, hajm: bayt };
      if (nom) qisqa._ = nom;
      return qisqa;
    }
    return natija;
  } catch {
    return { xato: 'tahlil qilinmadi' };
  }
}
