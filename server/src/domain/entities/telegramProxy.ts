import { ValidationError } from '@/shared/errors';

/**
 * Akkauntga biriktirilgan SOCKS5 proksi.
 *
 * NEGA to'rt alohida maydon emas, obyekt: "proksi bor/yo'q" bitta
 * tekshiruvga aylanadi va yarim to'ldirilgan holat — host bor-u port
 * yo'q — tip darajasida imkonsiz bo'ladi.
 */
export interface TelegramProxy {
  readonly host: string;
  readonly port: number;
  readonly username: string | null;
  readonly password: string | null;
}

/**
 * Yozishga mo'ljallangan proksi. `TelegramProxy` dan farqi — `password`
 * ixtiyoriy.
 *
 * NEGA: panel parolni operatorga qaytarib ko'rsatmaydi, shuning uchun
 * tahrirlash maydoni har ochilganda bo'sh bo'ladi. Bo'sh maydon
 * "parolni o'chir" degani emas — `undefined` bazadagi parolga
 * tegmaydi, `null` esa uni o'chiradi.
 */
export interface TelegramProxyPatch {
  readonly host: string;
  readonly port: number;
  readonly username: string | null;
  readonly password?: string | null;
}

export interface ProxyInput {
  host: string;
  port: number;
  username?: string | null;
  password?: string | null;
}

/**
 * Kiritilgan proksini tekshirib, normallashtirilgan holda qaytaradi.
 *
 * `password` kirishda YO'Q bo'lsa chiqishda ham yo'q — bu "bazadagi
 * parolga tegma" degani. Bo'sh satr esa `null` ga aylanadi, ya'ni
 * parolni o'chirish.
 */
export function validateProxy(input: ProxyInput): TelegramProxyPatch {
  const host = String(input.host ?? '').trim();
  if (!host) throw new ValidationError('Proksi manzili bo\'sh');

  const port = Number(input.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ValidationError('Proksi porti 1 dan 65535 gacha bo\'lishi kerak');
  }

  const username = String(input.username ?? '').trim() || null;

  // Login yo'q bo'lsa saqlangan parol ma'nosiz: SOCKS5 autentifikatsiyasi
  // login+parol juftligi sifatida ishlaydi, yolg'iz parol hech narsani
  // isbotlamaydi. Shuning uchun login `null` ga aylanganda parol HAR DOIM
  // `null` qilib qaytariladi — hatto so'rovda `password` maydoni umuman
  // bo'lmasa ham (operator faqat loginni tozalagan holat). Aks holda "keep"
  // uchligining uchinchi tomoni (`password: null`) operator uchun hech qachon
  // ishlab chiqarilmaydi: login o'chirilganda parol bazada qolib ketadi,
  // `toSocksProxy` loginsiz parol yuboradi, SOCKS rad etadi va akkaunt
  // `error` holatiga tushadi — buni tuzatishning yagona yo'li butun
  // proksini o'chirish bo'lib qolardi, bu esa akkauntni server IP'siga
  // qaytarib, aynan shu funksiya oldini olmoqchi bo'lgan holatni yaratardi.
  if (username === null) {
    const password = input.password === undefined ? null : String(input.password ?? '').trim() || null;
    if (password) {
      throw new ValidationError('Parol berilgan, lekin login yo\'q');
    }
    return { host, port, username, password: null };
  }

  // Parol berilmagani va bo'sh parol — turli holatlar, aralashtirilmaydi:
  // birinchisi "bazadagi parolga tegma", ikkinchisi "parolni o'chir".
  if (input.password === undefined) return { host, port, username };

  const password = String(input.password ?? '').trim() || null;
  return { host, port, username, password };
}
