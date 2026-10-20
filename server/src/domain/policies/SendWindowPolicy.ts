import { minutesOfDay, parseHHmm, zonedParts } from '@/shared/datetime';

export interface SendWindow {
  readonly start: string; // HH:mm
  readonly end: string; // HH:mm
  /** 1 = Dushanba ... 7 = Yakshanba. Bo'sh bo'lsa — dushanbadan shanbagacha (1-6), yakshanba KIRMAYDI. */
  readonly weekdays?: number[];
  readonly timeZone?: string;
}

export interface WindowDecision {
  readonly allowed: boolean;
  readonly reason?: string;
  /** Ruxsat etilmagan bo'lsa — keyingi urinishgacha necha ms kutish. */
  readonly retryAfterMs?: number;
}

/**
 * Yangi mijozga faqat ish vaqtida yoziladi.
 * Kechqurun/tunda yozish — ham ban riski, ham obro'ga zarar.
 */
export function evaluateWindow(now: Date, window: SendWindow): WindowDecision {
  const { hour, minute, weekday } = zonedParts(now, window.timeZone);
  const start = parseHHmm(window.start);
  const end = parseHHmm(window.end);
  const nowMin = minutesOfDay(hour, minute);
  const startMin = minutesOfDay(start.hour, start.minute);
  const endMin = minutesOfDay(end.hour, end.minute);

  const weekdays = window.weekdays?.length ? window.weekdays : [1, 2, 3, 4, 5, 6];
  if (!weekdays.includes(weekday)) {
    return { allowed: false, reason: 'Dam olish kuni', retryAfterMs: 60 * 60 * 1000 };
  }

  if (nowMin < startMin) {
    return {
      allowed: false,
      reason: `Ish vaqti ${window.start} da boshlanadi`,
      retryAfterMs: (startMin - nowMin) * 60 * 1000,
    };
  }

  if (nowMin >= endMin) {
    return {
      allowed: false,
      reason: `Ish vaqti ${window.end} da tugagan`,
      retryAfterMs: (24 * 60 - nowMin + startMin) * 60 * 1000,
    };
  }

  return { allowed: true };
}
