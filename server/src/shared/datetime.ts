import { config } from '@/shared/config';

/** Berilgan vaqtning loyihaviy vaqt mintaqasidagi HH:mm va sanasi. */
export function zonedParts(date: Date, timeZone = config.TIMEZONE): {
  hour: number;
  minute: number;
  weekday: number; // 1 = Dushanba ... 7 = Yakshanba
  isoDate: string; // YYYY-MM-DD
} {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  });
  const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    hour: Number(parts.hour),
    minute: Number(parts.minute === '24' ? '0' : parts.minute),
    weekday: weekdayMap[parts.weekday ?? 'Mon'] ?? 1,
    isoDate: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

export function parseHHmm(value: string): { hour: number; minute: number } {
  const [h, m] = value.split(':');
  return { hour: Number(h ?? 0), minute: Number(m ?? 0) };
}

export function minutesOfDay(hour: number, minute: number): number {
  return hour * 60 + minute;
}

export function parseExcelDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  if (typeof value === 'number') {
    // Excel serial (1900 tizimi)
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const s = String(value).trim();
  // "2026-07-25 00:00:00"
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
  // "25.07.2026"
  const dotted = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(s);
  if (dotted) return new Date(`${dotted[3]}-${dotted[2]}-${dotted[1]}T00:00:00Z`);

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toIsoDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

/** "15-avgust, juma" ko'rinishida — agent matnlari uchun. */
const UZ_MONTHS = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
];
const UZ_WEEKDAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];

export function formatUzDate(d: Date | string | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getUTCDate()}-${UZ_MONTHS[date.getUTCMonth()]} (${UZ_WEEKDAYS[date.getUTCDay()]})`;
}

/**
 * Kutish — xohlasa BEKOR QILINADIGAN.
 *
 * NEGA SIGNAL KERAK: ommaviy ishlarda ikki mijoz orasidagi pauza o'nlab
 * daqiqa bo'lishi mumkin (kunlik sig'imga taqsimlanadi). Oddiy
 * `setTimeout` bilan operator "To'xtatish"ni bosgach ish shu pauza
 * tugagunicha "ketyapti" bo'lib turardi — to'xtash faqat KEYINGI mijozga
 * o'tishda ko'rinardi. Signal berilsa kutish darhol uziladi va ish shu
 * zahoti "to'xtatildi" holatiga o'tadi.
 *
 * Bekor qilinganda ham `resolve` qiladi (`reject` emas): chaqiruvchi
 * tsikl boshida bayroqni o'zi tekshiradi, xato tashlash esa har bir
 * chaqiruvni `try/catch` ga o'rashni talab qilardi.
 *
 * Taymer ham, hodisa tinglovchisi ham har ikki yo'lda tozalanadi —
 * uzoq ro'yxatlarda ular to'planib qolmasligi kerak.
 */
export const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => finish(), ms);
    function finish(): void {
      clearTimeout(timer);
      signal?.removeEventListener('abort', finish);
      resolve();
    }
    signal?.addEventListener('abort', finish, { once: true });
  });

export function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
