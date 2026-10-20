/**
 * Telegramda topilgan odam haqiqatan bizning mijozimizmi — ismini solishtirish.
 *
 * NEGA KERAK: telefon raqamlari qo'ldan qo'lga o'tadi. Mijoz raqamini
 * o'zgartirgan bo'lsa, o'sha raqam boshqa odamga berilgan bo'ladi va biz
 * begona odamga to'lov haqida yozib yuboramiz — bu shaxsiy ma'lumotni oshkor
 * qilish va jiddiy shikoyat sababi.
 *
 * Taqqoslash QAT'IY EMAS: o'zbek ismlari turlicha yoziladi
 * (Djurayeva / Jurayeva / Жураева), Telegramda odam faqat ismini yoki
 * taxallusini yozib qo'yishi mumkin. Shuning uchun bitta jiddiy bo'lakning
 * mos kelishi yetarli deb hisoblanadi.
 *
 * Uch xil natija bo'ladi va ular boshqacha ishlov talab qiladi:
 *   match    — ishonch bor, davom etamiz
 *   mismatch — ism umuman boshqa, ODAM tekshirishi kerak
 *   unknown  — Telegramda ism yo'q yoki mazmunsiz ("user123", "🔥"),
 *              taqqoslab bo'lmaydi
 */

export type NameMatch = 'match' | 'mismatch' | 'unknown';

/** Kirilldan lotinga + transliteratsiya variantlarini bir ko'rinishga keltirish. */
function normalize(value: string): string {
  const cyrillic: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'j', з: 'z',
    и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 's', ч: 'c', ш: 's', щ: 's',
    ъ: '', ы: 'i', ь: '', э: 'e', ю: 'u', я: 'a', ў: 'o', қ: 'k', ғ: 'g', ҳ: 'h',
  };

  let text = value
    .toLowerCase()
    .split('')
    .map((ch) => cyrillic[ch] ?? ch)
    .join('');

  // Bir tovushning turli yozilishi — hammasini bitta ko'rinishga keltiramiz.
  text = text
    .replace(/dj/g, 'j')
    .replace(/kh/g, 'h')
    .replace(/ch/g, 'c')
    .replace(/sh/g, 's')
    .replace(/ts/g, 's')
    .replace(/x/g, 'h')
    .replace(/q/g, 'k')
    .replace(/w/g, 'v')
    .replace(/yo/g, 'o')
    .replace(/yu/g, 'u')
    .replace(/ya/g, 'a');

  return text.replace(/[^a-z]/g, '');
}

/** Ma'noli bo'laklar: qisqa va xizmatchi so'zlar tashlab yuboriladi. */
function tokens(value: string): string[] {
  const skip = new Set(['ogli', 'ugli', 'qizi', 'kizi', 'aka', 'opa', 'jon']);

  return value
    .split(/[\s.,_/\\|-]+/)
    .map(normalize)
    .filter((t) => t.length >= 4 && !skip.has(t));
}

/**
 * Ikki bo'lak bir xil ismning varianti bo'lishi mumkinmi.
 *
 * To'liq tenglik shart emas: "jurayeva" va "jurayev" (jins qo'shimchasi),
 * "aytulpa" va "aytulpaxon" (hurmat qo'shimchasi) — bir xil hisoblanadi.
 */
function similar(a: string, b: string): boolean {
  if (a === b) return true;

  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;

  // Uzunroq bo'lak qisqasidan boshlansa va farq katta bo'lmasa — bir xil ism.
  return longer.startsWith(shorter) && longer.length - shorter.length <= 3;
}

/**
 * Telegramdagi ism mijozning ismiga mos keladimi.
 *
 * @param clientName  bazadagi to'liq F.I.O.
 * @param telegramName Telegramdagi ism (first + last) yoki username
 */
export function matchesClientName(
  clientName: string | null | undefined,
  telegramName: string | null | undefined,
): NameMatch {
  const clientTokens = tokens(clientName ?? '');
  const tgTokens = tokens(telegramName ?? '');

  // Telegramda ism yo'q yoki mazmunsiz ("user123", raqam, emoji) —
  // taqqoslashga asos yo'q, "mos emas" deb ayblab bo'lmaydi.
  if (!clientTokens.length || !tgTokens.length) return 'unknown';

  for (const t of tgTokens) {
    for (const c of clientTokens) {
      if (similar(t, c)) return 'match';
    }
  }

  return 'mismatch';
}
