/**
 * Bir suhbatdagi ochiq va'dalardan qaysi biri HAQIQIY kelishuv ekanini
 * ajratadi.
 *
 * Kelishuv o'zgarganda eskisi bekor qilinadi (`AgentRunner.recordPromise`),
 * lekin bu qoida joriy qilingunga qadar ochilgan juftliklar bazada qolgan.
 * Ular xavfsiz emas: har bir va'da o'sha to'lovni o'zinikiga qo'shib
 * sanaydi va mijoz bitta pul uchun ikkita rahmat xabari oladi.
 *
 * Qoida: bir shartnoma bo'yicha eng OXIRGI kelishuv yashaydi. Turli
 * shartnomalar bir-biriga tegmaydi — ularning hisobi ham alohida.
 *
 * Shartnomasi ko'rsatilmagan va'da esa mijozning BARCHA to'lovlarini
 * sanaydi, ya'ni boshqa har qanday va'da bilan bir xil pulni ikkilantiradi.
 * Shuning uchun u suhbatdagi hamma va'dani bitta guruhga qo'shib yuboradi.
 */

export interface VadaQatori {
  readonly id: string;
  readonly contractId: string | null;
  readonly createdAt: Date;
}

export interface VadaGuruhi<T> {
  /** Kuzatiladigan, mijozga xabar yozishga haqli kelishuv. */
  readonly faol: T;
  /** Ustidan yangi kelishuv yozilgan — yopilishi kerak. */
  readonly eskirgan: T[];
}

/** Eng yangisi birinchi; bir xil vaqtda yozilganda tanlov barqaror bo'lsin. */
function yangilikBoyicha<T extends VadaQatori>(a: T, b: T): number {
  const farq = b.createdAt.getTime() - a.createdAt.getTime();
  return farq !== 0 ? farq : (a.id < b.id ? 1 : -1);
}

/**
 * Ochiq va'dalarni hisob guruhlariga bo'ladi: har guruhda bitta yashaydigan
 * kelishuv va uning ustidan yozilgan eskirganlari.
 */
export function bittaOchiqVada<T extends VadaQatori>(vadalar: readonly T[]): VadaGuruhi<T>[] {
  // Shartnomasiz va'da bor ekan — hammasi bitta hisob.
  const aralash = vadalar.some((v) => v.contractId === null);

  const guruhlar = new Map<string, T[]>();
  for (const vada of vadalar) {
    const kalit = aralash ? '*' : (vada.contractId ?? '*');
    const guruh = guruhlar.get(kalit);
    if (guruh) guruh.push(vada);
    else guruhlar.set(kalit, [vada]);
  }

  const natija: VadaGuruhi<T>[] = [];
  for (const guruh of guruhlar.values()) {
    const [oxirgi, ...qolgani] = [...guruh].sort(yangilikBoyicha);
    if (oxirgi) natija.push({ faol: oxirgi, eskirgan: qolgani });
  }

  return natija;
}
