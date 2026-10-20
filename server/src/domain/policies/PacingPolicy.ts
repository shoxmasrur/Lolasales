import { minutesOfDay, parseHHmm, zonedParts } from '@/shared/datetime';

export interface PacingInput {
  /** HH:mm */
  readonly windowStart: string;
  /** HH:mm */
  readonly windowEnd: string;
  /**
   * Bugun shu oynada yuborilishi mo'ljallangan jami xabar soni.
   * Ommaviy boshlash — faol akkauntlar limitlarining yig'indisi;
   * kampaniya — `campaign.dailyLimit`.
   */
  readonly dailySends: number;
  readonly minDelaySec: number;
  readonly maxDelaySec: number;
  /**
   * Tayyor o'rtacha oraliq (ms).
   *
   * Berilsa `windowStart/windowEnd/dailySends` dan hisoblanmaydi.
   * Operator taqsimot tugash soatini o'zi belgilaganda shu yo'l ishlaydi.
   */
  readonly meanMs?: number | null;
  /** Sinov uchun almashtiriladi. Standart — `Math.random`. */
  readonly random?: () => number;
}

/**
 * Yuqori chegara: o'rtachaning shuncha barobari.
 *
 * Eksponensial taqsimotning dumi uzun — cheklamasa ba'zan 2-3 soatlik
 * bo'shliq chiqadi va kunlik reja buziladi.
 */
export const CAP_FACTOR = 3;

/**
 * Ish oynasini kunlik sig'imga bo'lgan o'rtacha oraliq (ms).
 *
 * Oyna nol yoki sig'im nol bo'lsa `null` — chaqiruvchi pastki
 * chegaraga qaytadi.
 */
export function meanDelayMs(
  windowStart: string,
  windowEnd: string,
  dailySends: number,
): number | null {
  const start = parseHHmm(windowStart);
  const end = parseHHmm(windowEnd);
  const minutes = minutesOfDay(end.hour, end.minute) - minutesOfDay(start.hour, start.minute);

  if (minutes <= 0 || dailySends <= 0) return null;
  return (minutes * 60_000) / dailySends;
}

/**
 * Hozirdan `until` (HH:mm) gacha qolgan vaqtni yuborishlar soniga bo'ladi.
 *
 * NEGA ALOHIDA: `meanDelayMs` kunlik sig'imga tayanadi va tanlangan
 * mijozlar sonidan bexabar — 6 ta mijoz ham butun kunga cho'zilardi. Bu
 * funksiya esa operator belgilagan oynadan chiqadi.
 *
 * Vaqt o'tib ketgan yoki yuborish yo'q bo'lsa `null` — chaqiruvchi
 * pastki chegaraga qaytadi.
 *
 * BIR BIRLIKKA SIYOSIY: `count` ta xabar orasida `count − 1` ta oraliq
 * bor, lekin bo'luvchi sifatida `count` ishlatiladi — shuning uchun ish
 * o'rtacha bitta oraliqcha ERTAROQ tugaydi. Bu YUMSHOQ mo'ljal uchun
 * ahamiyatsiz (natija ±bir necha daqiqa), shuning uchun ATAYLAB
 * tuzatilmagan — keyingi o'quvchi "xato" deb "tuzatib qo'ymasin".
 */
export function spreadMeanMs(now: Date, until: string, count: number): number | null {
  if (count <= 0) return null;

  const hozir = zonedParts(now);
  const oxir = parseHHmm(until);
  const minutes =
    minutesOfDay(oxir.hour, oxir.minute) - minutesOfDay(hozir.hour, hozir.minute);

  if (minutes <= 0) return null;
  return (minutes * 60_000) / count;
}

/**
 * Keyingi xabargacha kutish (ms).
 *
 * NEGA EKSPONENSIAL: doimiy oraliq — masalan har 20 daqiqada bitta —
 * o'zi naqsh bo'lib qoladi va odam yozgandek ko'rinmaydi. Eksponensial
 * taqsimot Puasson oqimining kutish vaqti: o'rtachasi o'sha, lekin
 * ba'zan ketma-ket ikkita, keyin uzoq tanaffus.
 *
 * `randomBetween` ATAYLAB ishlatilmaydi: u `Math.random()` ni o'zi
 * chaqiradi va sinovda natijani aniq tekshirib bo'lmasdi.
 */
export function nextDelayMs(input: PacingInput): number {
  const random = input.random ?? Math.random;

  const min = Math.max(0, input.minDelaySec);
  const max = Math.max(min, input.maxDelaySec);
  const floorMs = (min + random() * (max - min)) * 1000;

  const mean = input.meanMs ?? meanDelayMs(input.windowStart, input.windowEnd, input.dailySends);
  if (mean === null) return Math.round(floorMs);

  // ln(0) = −Infinity. Nolni chiqarib tashlaymiz.
  const u = Math.min(Math.max(random(), Number.EPSILON), 1);
  const sample = -mean * Math.log(u);

  return Math.round(Math.max(floorMs, Math.min(sample, CAP_FACTOR * mean)));
}
