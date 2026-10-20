import { Api } from 'teleproto';
import { normalizePhone } from '@/shared/phone';

/**
 * `auth.ExportLoginToken` / `auth.ImportLoginToken` javobining tasnifi.
 * MTProto turlari shu fayl va gateway'dan tashqariga chiqmaydi.
 */
export type QrTokenResult =
  | { readonly kind: 'token'; readonly url: string; readonly expiresAt: Date }
  | { readonly kind: 'success'; readonly authorization: Api.auth.Authorization }
  | { readonly kind: 'migrate'; readonly dcId: number; readonly token: Buffer }
  | { readonly kind: 'unknown'; readonly className: string };

/** Telegram ilovasi skanerlaydigan havola. base64url — padding'siz. */
export function qrLoginUrl(token: Buffer): string {
  return `tg://login?token=${token.toString('base64url')}`;
}

export function classifyLoginToken(result: unknown): QrTokenResult {
  if (result instanceof Api.auth.LoginToken) {
    return {
      kind: 'token',
      url: qrLoginUrl(Buffer.from(result.token)),
      expiresAt: new Date(result.expires * 1000),
    };
  }
  if (result instanceof Api.auth.LoginTokenMigrateTo) {
    return { kind: 'migrate', dcId: result.dcId, token: Buffer.from(result.token) };
  }
  // `AuthorizationSignUpRequired` — raqam Telegramda ro'yxatdan o'tmagan.
  // QR'da amalda bo'lmaydi, bo'lsa ham bizda ro'yxatdan o'tkazish yo'q.
  if (result instanceof Api.auth.LoginTokenSuccess && result.authorization instanceof Api.auth.Authorization) {
    return { kind: 'success', authorization: result.authorization };
  }
  const className = (result as { className?: unknown } | null)?.className;
  return { kind: 'unknown', className: typeof className === 'string' ? className : String(result) };
}

/**
 * QR'ni yozuvdagi raqam egasi skanerlaganmi.
 *
 * Telegram `user.phone` ni "+" siz beradi, yozuvda esa E.164. Raqam
 * noma'lum bo'lsa — mos EMAS: noto'g'ri akkaunt sessiyasini saqlab
 * qo'yishdan ko'ra operatorga qayta skanerlatish arzon.
 */
export function isSamePhone(scanned: string | null | undefined, expected: string): boolean {
  const a = normalizePhone(scanned);
  const b = normalizePhone(expected);
  return a !== null && a === b;
}

/**
 * Keyingi `ExportLoginToken` qachon so'raladi.
 *
 * Yangi token: muddatdan `marginMs` oldin — ko'rsatilgan QR eskirib
 * qolmasin (gate navbati kechiksa ham).
 * Telegram o'sha hali amaldagi tokenni qaytargan bo'lsa: haqiqiy muddat
 * tugagandan keyin (+1s) — aks holda margin ichida qolib, har ~1s da
 * so'rov ketardi (FLOOD_WAIT xavfi), yangi token esa baribir berilmaydi.
 */
export function qrRefreshDelayMs(
  expiresAt: Date,
  now: number,
  sameAsPrevious: boolean,
  marginMs: number,
): number {
  const until = sameAsPrevious ? expiresAt.getTime() - now + 1_000 : expiresAt.getTime() - marginMs - now;
  return Math.max(1_000, until);
}
