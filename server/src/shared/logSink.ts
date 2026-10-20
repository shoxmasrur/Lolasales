import type { LogEntry } from '@/shared/logEntry';

/**
 * Jurnal qatorlarini qabul qiluvchi rozetka.
 *
 * NEGA SHU YERDA VA BO'SH: `shared/logger.ts` bazani import qila
 * olmaydi — `infrastructure/db/pool.ts` ning o'zi logger'ni ishlatadi
 * va to'g'ridan-to'g'ri import aylana hosil qilardi. Shuning uchun
 * logger faqat rozetkani biladi, uni kim to'ldirishini emas.
 *
 * `main.ts` ilova ko'tarilgach `setLogSink(...)` chaqiradi. Shu
 * paytgacha `warn`/`error` qatorlari faqat `stdout` ga ketadi — ilova
 * ko'tarilishidagi eng erta xatolar bazaga tushmaydi va journald'da
 * qoladi. Bu ongli kelishuv.
 */
let sink: ((entry: LogEntry) => void) | null = null;

export function setLogSink(fn: ((entry: LogEntry) => void) | null): void {
  sink = fn;
}

/** Pino oqimi shu funksiyani chaqiradi. */
export function emitToSink(entry: LogEntry): void {
  sink?.(entry);
}
