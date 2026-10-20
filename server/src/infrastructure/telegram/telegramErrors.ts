import { errors } from 'teleproto';

/**
 * Telegram xatolarini tanish.
 *
 * TUZOQ: kutubxona xato KODINI (`PEER_FLOOD`, `SESSION_PASSWORD_NEEDED`…)
 * `errorMessage` maydonida beradi, `message` da esa odam o'qiydigan inglizcha
 * matn turadi:
 *
 *   err.message      = "2FA is enabled, use a password to login. (caused by auth.SignIn)"
 *   err.errorMessage = "SESSION_PASSWORD_NEEDED"
 *
 * Shuning uchun `err.message.includes('SESSION_PASSWORD_NEEDED')` HECH QACHON
 * rost bo'lmaydi. Shu sabab 2FA yoqilgan akkauntlar parol bosqichiga o'tmay,
 * xato ekranga chiqib qolardi. Bu modul kodni to'g'ri joydan oladi.
 */

/** Xato kodi (`errorMessage`), bo'lmasa bo'sh satr. */
export function errorCode(err: unknown): string {
  const value = (err as { errorMessage?: unknown } | null)?.errorMessage;
  return typeof value === 'string' ? value : '';
}

/** Kod ham, matn ham — qidirish uchun bitta satr. */
export function errorHaystack(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return `${errorCode(err)}\n${message}`;
}

/** Xatoda shu kod bormi. */
export function hasCode(err: unknown, code: string): boolean {
  return errorHaystack(err).includes(code);
}

/**
 * Yozilayotgan odamning (mijozning) Telegram akkaunti o'chirilganmi.
 *
 * TUZOQ — PRODUKSIYADA BIR MARTA KUYDIRGAN: Telegram bu holatda
 * `INPUT_USER_DEACTIVATED` qaytaradi, va uning ICHIDA `USER_DEACTIVATED`
 * satri turadi. Shuning uchun oddiy `includes('USER_DEACTIVATED')` ikkalasini
 * ham ushlaydi va MIJOZNING o'chirilgan akkaunti BIZNING akkauntimizga
 * yozilib qoladi: akkaunt `banned` holatiga o'tadi va undan umuman xabar
 * ketmay qoladi, garchi Telegramda u sog'lom bo'lsa ham.
 */
export function isTargetDeactivated(err: unknown): boolean {
  return errorHaystack(err).includes('INPUT_USER_DEACTIVATED');
}

/**
 * BIZNING akkauntimiz o'chirilgan yoki bloklanganmi.
 *
 * `INPUT_` prefiksi bo'lsa — bu mijozniki, biznikimas. Shuning uchun avval
 * o'sha chiqarib tashlanadi ([[isTargetDeactivated]] izohiga qarang).
 */
export function isOwnAccountDeactivated(err: unknown): boolean {
  const haystack = errorHaystack(err);
  if (haystack.includes('INPUT_USER_DEACTIVATED')) return false;
  return haystack.includes('USER_DEACTIVATED') || haystack.includes('USER_BANNED');
}

/** Akkauntda ikki bosqichli tasdiqlash (2FA) yoqilganmi. */
export function isPasswordNeeded(err: unknown): boolean {
  if (err instanceof errors.SessionPasswordNeededError) return true;
  if (errorCode(err) === 'SESSION_PASSWORD_NEEDED') return true;

  const message = err instanceof Error ? err.message : String(err ?? '');
  return message.includes('SESSION_PASSWORD_NEEDED') || message.includes('2FA is enabled');
}

/**
 * Matn o'zgarmagan — Telegram tahrirni rad etadi.
 *
 * Bu XATO EMAS: operator matnni ochib, hech narsa o'zgartirmay saqlagan.
 * Chaqiruvchi buni muvaffaqiyat deb qabul qiladi va bazaga tegmaydi.
 */
export function isMessageNotModified(err: unknown): boolean {
  return hasCode(err, 'MESSAGE_NOT_MODIFIED');
}

/** Tahrirlash oynasi (48 soat) yopilgan. */
export function isEditTimeExpired(err: unknown): boolean {
  return hasCode(err, 'MESSAGE_EDIT_TIME_EXPIRED');
}

/**
 * Xabar Telegramda umuman yo'q — allaqachon o'chirilgan.
 *
 * `MESSAGE_EDIT_TIME_EXPIRED` bu holatga KIRMAYDI: u yerda xabar joyida
 * turibdi, faqat tahrirlash muddati o'tgan.
 *
 * `MESSAGE_DELETE_FORBIDDEN` ham bu holatga KIRMAYDI — xuddi shu sabab
 * bilan: bu kod o'chirish RAD ETILGANINI bildiradi (masalan, xabar juda
 * eski yoki ruxsat yo'q), "xabar allaqachon yo'q" degani emas. Xabar
 * mijozning Telegramida hali ham turibdi. Buni "yo'q" deb qabul qilsak,
 * `deleteMessage()` xatoni yutib yuborib bazani "o'chirildi" deb
 * belgilaydi — mijoz esa xabarni ko'rishda davom etadi.
 */
export function isMessageGone(err: unknown): boolean {
  return hasCode(err, 'MESSAGE_ID_INVALID');
}
