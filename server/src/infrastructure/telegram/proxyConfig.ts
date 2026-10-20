import type { TelegramProxy } from '@/domain/entities/telegramProxy';

/** `teleproto` kutadigan SOCKS5 sozlamasi. */
export interface SocksProxyConfig {
  socksType: 5;
  ip: string;
  port: number;
  username?: string;
  password?: string;
  timeout: number;
}

/** Proksiga ulanishni kutish vaqti (soniya). */
const PROXY_TIMEOUT_SECONDS = 10;

/**
 * Akkaunt proksisini `TelegramClient` sozlamasiga aylantiradi.
 *
 * Proksisiz akkaunt uchun `undefined` qaytadi, `null` emas: konstruktor
 * `proxy` kalitini umuman ko'rmasligi kerak.
 */
export function toSocksProxy(proxy: TelegramProxy | null): SocksProxyConfig | undefined {
  if (!proxy) return undefined;
  return {
    socksType: 5,
    ip: proxy.host,
    port: proxy.port,
    ...(proxy.username ? { username: proxy.username } : {}),
    ...(proxy.password ? { password: proxy.password } : {}),
    timeout: PROXY_TIMEOUT_SECONDS,
  };
}

/**
 * Xato proksi nosozligimi — shunday bo'lsa operator uchun matn qaytaradi.
 *
 * NEGA KERAK: `socks` kutubxonasining xabari ("Socket closed") operatorga
 * hech narsa aytmaydi va akkaunt kartasida shu matn qolib ketardi.
 * Proksi manzili matnda turishi shart — bir nechta akkauntdan qaysi
 * biri qaysi proksida yiqilganini panelning o'zidan ko'rish kerak.
 */
export function proxyErrorMessage(err: unknown, proxy: TelegramProxy): string | null {
  const raw = err instanceof Error ? err.message : String(err);
  const text = raw.toLowerCase();
  const manzil = `${proxy.host}:${proxy.port}`;

  const proksigaTegishli =
    text.includes('socks') ||
    text.includes('proxy') ||
    text.includes('socket closed') ||
    text.includes('econnrefused') ||
    text.includes('econnreset') ||
    text.includes('etimedout') ||
    text.includes('enotfound') ||
    text.includes('ehostunreach');

  if (!proksigaTegishli) return null;

  if (text.includes('auth')) return `Proksi logini yoki paroli noto'g'ri (${manzil})`;
  if (text.includes('enotfound')) return `Proksi manzili topilmadi (${manzil})`;
  if (text.includes('etimedout') || text.includes('timed out')) {
    return `Proksi javob bermadi (${manzil})`;
  }
  return `Proksiga ulanib bo'lmadi (${manzil})`;
}
