/**
 * Mijozning ismidan jinsini aniqlash — "aka" yoki "opa" deb murojaat qilish uchun.
 *
 * NEGA TASHQI BAZA KERAK EMAS: bizning importimizda F.I.O. to'liq keladi
 * ("Mirzayeva Nargiza Nasirdjanovna"), otasining ismi esa jinsni deyarli
 * 100% aniqlik bilan ko'rsatadi (-ovich / -ovna). Ism ro'yxati faqat
 * otasining ismi ham, familiya qo'shimchasi ham bo'lmagan holatlar uchun
 * zaxira bo'lib xizmat qiladi.
 *
 * Ishonch tartibi (yuqoridan pastga):
 *   1. Otasining ismi   — Maxmutovich / Nasirdjanovna, "o'g'li" / "qizi"
 *   2. Familiya         — Mirzayeva / Mirzayev
 *   3. Ism ro'yxati     — Nargiza / Zokirjon
 *   4. Aniqlanmadi      — null (agent umuman "aka/opa" ishlatmaydi)
 *
 * Aniqlanmagan holatda TAXMIN QILINMAYDI: mijozga noto'g'ri jinsda murojaat
 * qilish — ochiq hurmatsizlik va uni darhol suhbatdan uzoqlashtiradi.
 */

export type Gender = 'male' | 'female';

/**
 * Lotin va kirill yozuvini bir ko'rinishga keltiradi.
 * "Ulug'bek" / "Ulugbek" / "Улугбек" — hammasi "ulugbek" bo'ladi.
 */
function normalize(value: string): string {
  const cyrillic: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z',
    и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh',
    щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q',
    ғ: 'g', ҳ: 'h',
  };

  return value
    .toLowerCase()
    .split('')
    .map((ch) => cyrillic[ch] ?? ch)
    .join('')
    // Apostrof va tutuq belgilari: o' → o, g' → g
    .replace(/['''`ʻʼ]/g, '')
    .replace(/[^a-z]/g, '');
}

/** 1-bosqich: otasining ismi. Eng ishonchli belgi. */
function fromPatronymic(parts: string[]): Gender | null {
  for (const part of parts) {
    const p = normalize(part);
    if (!p) continue;

    // Ruscha uslub: Maxmutovich / Nasirdjanovna
    if (/(ovich|evich|yevich|ich)$/.test(p) && p.length > 5) return 'male';
    if (/(ovna|evna|yevna)$/.test(p)) return 'female';

    // O'zbekcha uslub: "Karim o'g'li" / "Karim qizi"
    if (p === 'ogli' || p === 'ugli' || p === 'oglu') return 'male';
    if (p === 'qizi' || p === 'kizi') return 'female';
  }
  return null;
}

/** 2-bosqich: familiya qo'shimchasi. */
function fromSurname(parts: string[]): Gender | null {
  for (const part of parts) {
    const p = normalize(part);
    if (p.length < 5) continue;

    // Ayol: Mirzayeva, Karimova, Yusupova
    if (/(ova|eva|yeva|ina|skaya)$/.test(p)) return 'female';
    // Erkak: Mirzayev, Karimov, Yusupov
    if (/(ov|ev|yev|in|skiy|skij)$/.test(p)) return 'male';
  }
  return null;
}

/**
 * 3-bosqich: eng ko'p uchraydigan ismlar.
 *
 * Bu ro'yxat to'liq bo'lishi shart emas — u faqat otasining ismi va familiya
 * qo'shimchasi bo'lmagan kamdan-kam holat uchun. Yangi ism qo'shish xavfsiz.
 */
const MALE_NAMES = new Set([
  'abdulla', 'abror', 'adham', 'akbar', 'akmal', 'alisher', 'anvar', 'asror',
  'aziz', 'azamat', 'bahodir', 'bahrom', 'baxtiyor', 'behruz', 'bekzod', 'botir',
  'davron', 'dilshod', 'diyor', 'doston', 'eldor', 'elyor', 'farrux', 'farhod',
  'firdavs', 'gayrat', 'hasan', 'husan', 'ibrohim', 'ilhom', 'islom', 'islombek',
  'jahongir', 'jasur', 'javohir', 'kamol', 'karim', 'komil', 'laziz', 'mansur',
  'muhammad', 'murod', 'nizomiddin', 'nodir', 'nurbek', 'odil', 'otabek',
  'ravshan', 'rustam', 'salohiddin', 'sanjar', 'sardor', 'shavkat', 'sherzod',
  'shohruh', 'sirojiddin', 'temur', 'ulugbek', 'umid', 'xurshid', 'yusuf',
  'zafar', 'zokir', 'zokirjon',
]);

const FEMALE_NAMES = new Set([
  'aziza', 'barno', 'charos', 'dilbar', 'dildora', 'dilnoza', 'dinara',
  'durdona', 'feruza', 'gavhar', 'gulnora', 'gulnoza', 'guzal', 'hilola',
  'iroda', 'kamila', 'kamola', 'lola', 'madina', 'maftuna', 'malika',
  'mavjuda', 'mavluda', 'mohira', 'muattar', 'munisa', 'muxlisa', 'nafisa',
  'nargiza', 'nasiba', 'nilufar', 'nodira', 'ozoda', 'rano', 'rayhona',
  'ruxshona', 'sabina', 'saida', 'sevara', 'shahnoza', 'shahzoda', 'sitora',
  'surayyo', 'umida', 'zebo', 'zilola', 'zuhra', 'zulfiya',
]);

function fromNameList(parts: string[]): Gender | null {
  for (const part of parts) {
    const p = normalize(part);
    if (MALE_NAMES.has(p)) return 'male';
    if (FEMALE_NAMES.has(p)) return 'female';
  }
  return null;
}

/** To'liq ismdan jinsni aniqlaydi. Aniqlanmasa — null (taxmin qilinmaydi). */
export function detectGender(fullName: string | null | undefined): Gender | null {
  if (!fullName?.trim()) return null;
  const parts = fullName.trim().split(/\s+/);

  return fromPatronymic(parts) ?? fromSurname(parts) ?? fromNameList(parts);
}

const UZBEK_PATRONYMIC = new Set(['ogli', 'ugli', 'oglu', 'qizi', 'kizi']);

/** Familiyaga o'xshaydimi — "Raximbayev", "Mirzayeva", "Nikitin". */
function looksLikeSurname(part: string): boolean {
  const p = normalize(part);
  return p.length >= 5 && /(ov|ev|yev|ova|eva|yeva|in|ina|skiy|skaya)$/.test(p);
}

/** Ro'yxatdan familiyaga o'xshamaganini tanlaydi, topilmasa — oxirgisini. */
function pickGiven(candidates: string[]): string | null {
  return candidates.find((c) => !looksLikeSurname(c)) ?? candidates.at(-1) ?? null;
}

/**
 * Ismning "berilgan ism" qismini topadi.
 *
 * Uch xil tartib uchraydi:
 *   • Ruscha uslub    — "Familiya Ism Otasining-ismi"   → ism O'RTADA
 *     ("Mirzayeva Nargiza Nasirdjanovna")
 *   • O'zbekcha uslub — "Ism Otasining-ismi o'g'li"     → ism BIRINCHI
 *     ("Aziz Karim o'g'li")
 *   • Aralash uslub   — "Familiya Ism Ota o'g'li"       → ism IKKINCHI
 *     ("Raximbayev Aziz Karim o'g'li")
 *
 * Uchinchisi eng ko'p uchraydigani va aynan u ilgari xato ishlagan: kod
 * "o'g'li" so'zini ko'rib o'zbekcha uslub deb hisoblardi va BIRINCHI so'zni —
 * ya'ni FAMILIYANI — ism deb olardi ("Raximbayev aka").
 *
 * To'g'ri belgi so'z soni emas, "o'g'li" so'zining O'RNI: undan oldingi so'z
 * — otasining ismi, undan oldingilari esa [familiya] + ism.
 */
function firstName(parts: string[]): string | null {
  const marker = parts.findIndex((p) => UZBEK_PATRONYMIC.has(normalize(p)));
  if (marker >= 0) return pickGiven(parts.slice(0, Math.max(marker - 1, 1)));

  if (parts.length >= 3) return parts[1] ?? null;

  for (const part of parts) {
    const p = normalize(part);
    if (!/(ov|ev|yev|ova|eva|yeva|ovich|ovna|evich|evna)$/.test(p)) return part;
  }
  return parts[0] ?? null;
}

/**
 * Agent ishlatadigan iliq murojaat shakli: "Zokirjon aka", "Nargiza opa".
 * Jins aniqlanmasa null — bunda agent ismni umuman ishlatmaydi.
 *
 * `knownFirstName` — ANIQ ism (`first_name`, masalan Telegram profilidan). Berilgan bo'lsa
 * taxminiy ajratish umuman ishlatilmaydi. Jins esa baribir TO'LIQ ismdan
 * aniqlanadi: otasining ismi (-ovich / -ovna) eng ishonchli belgi va u
 * `first_name` da yo'q.
 */
export function addressForm(
  fullName: string | null | undefined,
  knownFirstName?: string | null,
): string | null {
  const gender = detectGender(fullName);
  if (!gender) return null;

  const name = givenName(fullName, knownFirstName);
  if (!name) return null;

  return `${name} ${gender === 'male' ? 'aka' : 'opa'}`;
}

/**
 * Ism-sharifdan berilgan ismni ajratadi: "Aliyev Aziz Rustamovich" → "Aziz".
 *
 * `addressForm` bilan bir xil mantiq, lekin jinsdan mustaqil: jins
 * aniqlanmagan mijoz uchun ham ism kerak bo'ladi (kontakt nomi).
 */
export function givenName(
  fullName: string | null | undefined,
  knownFirstName?: string | null,
): string | null {
  const known = knownFirstName?.trim();
  if (known) return known;

  if (!fullName) return null;
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  return firstName(parts);
}
