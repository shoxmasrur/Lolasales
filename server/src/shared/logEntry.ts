import type { AppLogFlag, AppLogLevel, AppLogRow } from '@/domain/repositories/IAppLogRepository';

/** Pino yozuvi — JSON qator sifatida keladi. */
export interface LogEntry {
  level: number;
  time: number;
  msg: string;
  scope?: string;
  [key: string]: unknown;
}

/**
 * Juda uzun xabar jadvalni behuda o'stiradi (model javobi yoki stack
 * qatorga tushib qolishi mumkin). 2000 belgi har qanday haqiqiy xabar
 * uchun yetarli.
 */
export const MSG_MAX_LENGTH = 2000;

/** Pino darajalari. */
const WARN = 40;
const ERROR = 50;
const INFO = 30;

/**
 * Telegram audit izining bayrog'i.
 *
 * NEGA SATR KONSTANTA: bayroq ikki joyda yoziladi (audit o'rami) va uch
 * joyda o'qiladi (bu funksiya, SQL filtri, interfeys). Bitta manba
 * bo'lmasa, birida `telegram`, boshqasida `tg` yozilib, qatorlar filtrga
 * tushmay qolardi.
 *
 * OGOHLANTIRISH — `flag` KALITI BAND: `logEntryToRow` pastda `entry.flag`
 * ni "bu QATOR qaysi oqimga tegishli" deb o'qiydi. Kodning boshqa
 * hech qanday joyida `log.*` chaqiruviga `flag` kaliti berilmasin —
 * aks holda: (1) oddiy `info` yozuv Telegram qatoriday jadvalga tushib
 * qoladi (soxta TG belgisi), (2) yoki teskarisi — haqiqiy Telegram
 * qatori noto'g'ri saqlanish muddatini oladi. Boshqa maqsad uchun shu
 * ma'noda maydon kerak bo'lsa, boshqa nom tanlansin (masalan `oqim`).
 */
export const TELEGRAM_FLAG = 'telegram';

/**
 * Ustunga chiqqan va texnik maydonlar — bular `payload` ga TUSHMAYDI,
 * aks holda har qator ikki marta saqlanardi.
 */
const USTUNLAR = new Set([
  'level', 'time', 'msg', 'scope', 'flag', 'akkaunt', 'mijoz', 'pid', 'hostname',
]);

function satr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

/**
 * Pino yozuvini jadval qatoriga aylantiradi.
 *
 * `null` — qator jadvalga tushmaydi. Qoida: `warn` va undan yuqorisi
 * doim tushadi; `info` esa FAQAT Telegram bayrog'i bilan. Oqim
 * allaqachon filtrlaydi, lekin qoida shu yerda ham turadi — rozetkani
 * boshqa joydan chaqirish mumkin.
 */
export function logEntryToRow(entry: LogEntry): AppLogRow | null {
  if (typeof entry.level !== 'number') return null;

  const flag: AppLogFlag | null = entry.flag === TELEGRAM_FLAG ? TELEGRAM_FLAG : null;
  if (entry.level < WARN && !(flag && entry.level >= INFO)) return null;

  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entry)) {
    if (!USTUNLAR.has(k)) payload[k] = v;
  }

  const msg = String(entry.msg ?? '');

  const level: AppLogLevel =
    entry.level >= ERROR ? 'error' : entry.level >= WARN ? 'warn' : 'info';

  return {
    level,
    flag,
    scope: satr(entry.scope),
    msg: msg.length > MSG_MAX_LENGTH ? msg.slice(0, MSG_MAX_LENGTH) : msg,
    akkaunt: satr(entry.akkaunt),
    mijoz: satr(entry.mijoz),
    payload,
  };
}
