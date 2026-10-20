import { zonedParts } from '@/shared/datetime';

/** Yakshanba — `zonedParts` da 7. */
const YAKSHANBA = 7;

/**
 * Xavfsizlik cheklovi: tsikl hech qachon cheksiz aylanmasin. Ikki oydan
 * uzoq sukut bizni qiziqtirmaydi — chegara baribir 2 ta murojaat.
 */
const MAX_KUN = 70;

/**
 * Oxirgi chiquvchi xabardan beri necha ISH KUNI sukut davom etgani.
 *
 * Sanoq KUN ALMASHUVI bo'yicha: chiquvchi xabar kunidan KEYINGI kundan
 * boshlab bugungacha bo'lgan kunlar sanaladi. Soat hisobga olinmaydi —
 * xabar ish oynasida (09:00–19:00) ketadi, ya'ni eng qisqa oraliq ham
 * bir tunni qamrab oladi.
 *
 * YAKSHANBA SANALMAYDI. Sabab moliyaviy, kalendar emas: yakshanba
 * banklar ishlamaydi va to'lov o'tmagan bo'lishi mumkin. O'sha kunni
 * "javob bermadi" deb hisoblash mijozni nohaq bezovta qilish bo'lardi.
 */
export function sukutKunlari(oxirgiChiquvchi: Date, hozir: Date, timeZone?: string): number {
  const boshlanish = zonedParts(oxirgiChiquvchi, timeZone).isoDate;
  const tugash = zonedParts(hozir, timeZone).isoDate;
  if (tugash <= boshlanish) return 0;

  let kunlar = 0;
  // Sanani UTC yarim tunida yuritamiz: mintaqa siljishi bu yerda
  // ahamiyatsiz, chunki solishtiruv ISO sana satrlari bilan boradi.
  const kursor = new Date(`${boshlanish}T00:00:00Z`);

  for (let i = 0; i < MAX_KUN; i += 1) {
    kursor.setUTCDate(kursor.getUTCDate() + 1);
    const kun = kursor.toISOString().slice(0, 10);
    if (kun > tugash) break;
    // `zonedParts` ni UTC bilan chaqiramiz — bizga faqat hafta kuni kerak.
    if (zonedParts(kursor, 'UTC').weekday !== YAKSHANBA) kunlar += 1;
  }

  return kunlar;
}

/** Qaror uchun kerak bo'lgan yagona ma'lumot — bazadan mustaqil. */
export interface NudgeSnapshot {
  readonly lastOutboundAt: Date;
  readonly nudgeCount: number;
  /** Suhbatda hali yopilmagan va'da bormi (`pending` yoki `partial`). */
  readonly ochiqVadaBor: boolean;
  /** Mijozning BARCHA shartnomasi bo'yicha kechikish yopilganmi. */
  readonly kechikishYopilgan: boolean;
}

export interface NudgeQoidalari {
  readonly kunlar: number;
  readonly maxUrinish: number;
  readonly timeZone?: string;
}

/**
 * Shu suhbatga hozir qayta yozish kerakmi.
 *
 * Sof funksiya: kuzatuvchining barcha "yo'q" sabablari shu yerda
 * to'plangan, chunki ularning har biri ALOHIDA testlanishi kerak —
 * noto'g'ri "ha" mijozni bezovta qiladi.
 */
export function nudgeKerakmi(
  snapshot: NudgeSnapshot,
  hozir: Date,
  qoidalar: NudgeQoidalari,
): boolean {
  if (snapshot.nudgeCount >= qoidalar.maxUrinish) return false;
  // Mijoz allaqachon aniq kun aytgan — o'sha kun uchun `PromiseWatcher`
  // javobgar. Ikkalasi yozsa mijoz bir kunda ikki xabar oladi.
  if (snapshot.ochiqVadaBor) return false;
  // Kechikish yopilgan bo'lsa yozadigan gap qolmagan.
  if (snapshot.kechikishYopilgan) return false;
  return sukutKunlari(snapshot.lastOutboundAt, hozir, qoidalar.timeZone) >= qoidalar.kunlar;
}
