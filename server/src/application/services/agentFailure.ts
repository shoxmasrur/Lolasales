import { config } from '@/shared/config';
import { zonedParts } from '@/shared/datetime';

/** Xom xato matni bannerni bosib ketmasin. */
const MAX_RAW = 200;

/** Tarmoq uzilishining odatdagi belgilari — hammasi vaqtinchalik. */
const NETWORK_MARKERS = [
  'econnreset', 'etimedout', 'econnrefused', 'enotfound',
  'fetch failed', 'socket hang up', 'network error', 'timeout',
];

/** "resets 2pm (UTC)", "resets 14:00 (UTC)" — SDK limit xabaridagi vaqt. */
const RESET_RE = /resets\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*\(?\s*utc\s*\)?/i;

/**
 * Agent chaqiruvining xom xatosini operator o'qiydigan sababga aylantiradi.
 *
 * Bu matn `conversations.human_reason` ga yoziladi va chatdagi bannerda
 * ko'rinadi. Xom matn yo'qolmaydi — u `ReplyDebouncer` ichida jurnalga
 * tushadi va Loglar sahifasida qoladi.
 */
export function agentFailureReason(err: unknown, now: Date, timeZone = config.TIMEZONE): string {
  const raw = (err instanceof Error ? err.message : String(err ?? '')).trim();
  const low = raw.toLowerCase();

  if (low.includes('session limit') || low.includes('usage limit') || low.includes('rate limit')) {
    const at = resetLocalTime(raw, now, timeZone);
    return at
      ? `Agent vaqtincha ishlamadi: Claude limiti (${at} da tiklanadi)`
      : 'Agent vaqtincha ishlamadi: Claude limiti';
  }

  if (NETWORK_MARKERS.some((m) => low.includes(m))) {
    return 'Agent vaqtincha ishlamadi: tarmoq xatosi';
  }

  const text = raw || 'noma\'lum xato';
  return `Agent xatosi: ${text.length > MAX_RAW ? `${text.slice(0, MAX_RAW)}…` : text}`;
}

/**
 * Limit qachon tiklanishini mahalliy soatda qaytaradi ("19:00").
 *
 * Vaqtni o'qib bo'lmasa NULL — yolg'on vaqt ko'rsatishdan ko'ra hech narsa
 * ko'rsatmagan yaxshi.
 */
function resetLocalTime(raw: string, now: Date, timeZone: string): string | null {
  const m = RESET_RE.exec(raw);
  if (!m) return null;

  let hour = Number(m[1]);
  const minute = Number(m[2] ?? 0);
  const suffix = m[3]?.toLowerCase();

  if (!Number.isFinite(hour) || hour > 23 || !Number.isFinite(minute) || minute > 59) return null;
  if (suffix === 'pm' && hour < 12) hour += 12;
  if (suffix === 'am' && hour === 12) hour = 0;

  // Sana bugungi kun deb olinadi: xabarda faqat soat bor. Limit ertaga
  // tiklansa ham SOAT to'g'ri qoladi — operatorga aynan shu kerak.
  const utc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute),
  );
  const p = zonedParts(utc, timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}
