export interface BayramKiritish {
  readonly name: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly yillik: boolean;
}

/** `2026-02-30` kabi mavjud bo'lmagan sanani ham rad etadi. */
function sanaTogrimi(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/**
 * Kiritilgan bayramni tekshiradi. Xato bo'lsa — o'zbekcha sabab,
 * hammasi joyida bo'lsa — `null`.
 *
 * Sof funksiya: marshrut uni chaqiradi va matnni `ValidationError` ga
 * o'raydi. Shu sababli qoidalarni bazasiz test qilib bo'ladi.
 */
export function bayramTekshiruvi(input: BayramKiritish): string | null {
  const nom = input.name.trim();
  if (!nom) return 'Bayram nomi bo\'sh bo\'lmasin';
  if (nom.length > 80) return 'Bayram nomi 80 belgidan oshmasin';

  if (!sanaTogrimi(input.startsOn)) return 'Boshlanish sanasi noto\'g\'ri (YYYY-MM-DD)';
  if (!sanaTogrimi(input.endsOn)) return 'Tugash sanasi noto\'g\'ri (YYYY-MM-DD)';
  if (input.endsOn < input.startsOn) return 'Tugash sanasi boshlanishdan oldin bo\'lmasin';

  // NEGA FAQAT YILLIK UCHUN: yillik yozuv oy-kun bo'yicha ikki
  // tomonlama solishtiriladi (`bayramKuni`), va "12-30 <= md <= 01-02"
  // hech qachon bajarilmaydi — bayram jimgina ishlamay qolardi. Bir
  // martalik yozuvda to'liq sana solishtiriladi, u yerda muammo yo'q.
  if (input.yillik && input.endsOn.slice(5) < input.startsOn.slice(5)) {
    return 'Har yili qaytadigan bayram yil chegarasidan o\'ta olmaydi — ikkita alohida yozuv qiling';
  }

  return null;
}
