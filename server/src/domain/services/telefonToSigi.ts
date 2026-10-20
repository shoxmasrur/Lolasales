/**
 * Begona raqamni mijozdan uzish mantig'i.
 *
 * NEGA ALOHIDA MODUL: bu qoidalar ikki joyda kerak — operator tugmasi
 * (`BlockClientPhone`) va mijozlar importi.
 * Har birida qaytadan yozilsa, ular vaqt o'tib bir-biridan ajralib
 * ketardi va raqam bittasidan sizib o'tib qaytib kelardi.
 *
 * Funksiyalar SOF: bazani ham, vaqtni ham bilmaydi. Shuning uchun ular
 * bo'yicha test yozish uchun hech qanday soxta port kerak emas.
 */

/** Mijozning raqamlari — `clients.phone` va `clients.extra_phones`. */
export interface RaqamlarHolati {
  readonly phone: string | null;
  readonly extraPhones: readonly string[];
}

/**
 * Raqamni mijozdan uzadi.
 *
 * Asosiy raqam uzilsa, qolganlardan birinchisi asosiy bo'ladi: Telegram
 * qidiruvi aynan asosiy raqam orqali ketadi, shuning uchun mijozda boshqa raqam
 * tursa-yu asosiy bo'sh qolsa, u sababsiz "raqamsiz" ko'rinardi.
 *
 * Raqam ro'yxatda umuman bo'lmasligi ham normal holat: operator tugmani
 * ikki marta bosishi mumkin, yoki raqam allaqachon boshqa yo'l bilan
 * o'chirilgan bo'lishi mumkin. Bunday chaqiruv xato emas — hech nima
 * o'zgarmaydi.
 */
export function raqamniUz(current: RaqamlarHolati, phone: string): RaqamlarHolati {
  // Import xatolari tufayli bitta raqam ham asosiy, ham qo'shimcha bo'lib
  // yozilib qolgan holatlar bazada uchraydi — shuning uchun filtr ikkala
  // ro'yxatga ham qo'llanadi, "asosiymi yoki qo'shimchami" deb ajratilmaydi.
  const qolgan = [current.phone, ...current.extraPhones]
    .filter((p): p is string => Boolean(p))
    .filter((p) => p !== phone);

  return { phone: qolgan[0] ?? null, extraPhones: qolgan.slice(1) };
}

/**
 * Kiruvchi raqamlardan to'silganlarini tashlaydi.
 *
 * Import shu filtrdan o'tkaziladi. Usiz qayta yuklangan fayl uzilgan
 * raqamni qaytarib qo'yardi va begona odamga bergan "boshqa yozilmaydi"
 * degan so'zimiz buzilardi.
 */
export function tosilganlarniTashla(
  incoming: readonly string[],
  blocked: ReadonlySet<string>,
): string[] {
  return incoming.filter((p) => !blocked.has(p));
}
