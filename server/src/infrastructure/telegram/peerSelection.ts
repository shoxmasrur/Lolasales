/**
 * Telegram javobidan KERAKLI foydalanuvchini tanlash.
 *
 * NEGA ALOHIDA MODUL: bu yerda bir marta og'ir xato bo'lgan. `contacts.
 * ImportContacts` va `contacts.ResolvePhone` javoblarida `users` maydoni bor,
 * lekin u — javobga ALOQADOR foydalanuvchilar ro'yxati, so'ralgan raqamning
 * javobi emas. Raqam Telegramda umuman ro'yxatdan o'tmagan bo'lsa ham bu
 * ro'yxat bo'sh bo'lmasligi mumkin.
 *
 * Eski kod `users[0]` ni olardi va natijada BEGONA odam "topildi" deb
 * qaytardi — mijozning raqami Telegramda yo'q bo'lsa ham, tizim uni boshqa
 * odam bilan bog'lab, o'sha odamga xabar yuborishi mumkin edi.
 *
 * To'g'ri yo'l: haqiqiy natija `imported[].userId` (yoki `peer.userId`) da,
 * va aynan o'sha id bo'yicha qidirish kerak.
 */

/** Tanlash uchun yetarli minimal ko'rinish — Api sinflaridan mustaqil. */
export interface UserLike {
  readonly id: unknown;
  /** Akkauntning o'zi — hech qachon mijoz sifatida qaytarilmaydi. */
  readonly self?: boolean;
}

/**
 * `users` ro'yxatidan aynan `targetId` ga teng foydalanuvchini qaytaradi.
 *
 * `targetId` bo'sh bo'lsa (ya'ni Telegram hech kimni topmagan) — null.
 * Topilgan foydalanuvchi akkauntning o'zi bo'lsa ham — null.
 */
export function pickUserById<T extends UserLike>(
  users: readonly T[] | undefined,
  targetId: unknown,
): T | null {
  if (targetId === null || targetId === undefined || targetId === '') return null;

  const target = String(targetId);
  const found = users?.find((u) => String(u.id) === target);

  if (!found || found.self) return null;
  return found;
}
