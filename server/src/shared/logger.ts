import pino from 'pino';
import pretty from 'pino-pretty';
import { config, isProd } from '@/shared/config';
import { emitToSink } from '@/shared/logSink';
import type { LogEntry } from '@/shared/logEntry';

export type Logger = pino.Logger;

/**
 * Rozetkaga yo'naltiruvchi oqim.
 *
 * Pino unga JSON qator beradi. Tahlil yiqilsa jimgina o'tkazib
 * yuboramiz — jurnal yozish hech qachon ilovani to'xtatmasligi kerak.
 */
const sinkStream = {
  write(line: string): void {
    try {
      emitToSink(JSON.parse(line) as LogEntry);
    } catch {
      // Buzilgan qator — tashlab ketamiz.
    }
  },
  // `pino/lib/multistream.js` chiqishda `stream.end()`ni tekshirmasdan
  // chaqiradi (`flushSync`/`emit`dan farqli). Hozircha hech kim
  // chaqirmaydi, lekin bo'lmasa jarayon tugashida yiqilishi mumkin.
  end(): void {},
};

/**
 * NEGA `transport` EMAS, `multistream`: `transport` alohida ishchi
 * oqimda ishlaydi va u bilan bir vaqtda ikkinchi oqim qo'shib
 * bo'lmaydi. `pino-pretty` esa oddiy oqim sifatida ham ishlaydi,
 * shuning uchun ikkalasi bitta `multistream` da birlashtiriladi.
 *
 * NEGA `process.stdout` EMAS, `pino.destination(1)`: `main.ts`
 * `logger.fatal(...)`dan keyin darhol `process.exit(1)` chaqiradi.
 * `process.stdout` konveyer (systemd/journald) bo'lganda yozuv
 * asinxron va oxirgi qator chiqishdan oldin yo'qolishi mumkin.
 * `pino.destination` esa jarayon tugashida `flushSync` bilan
 * ro'yxatdan o'tadi — eng muhim qator, "nega yiqildik" degani,
 * hech qachon yutilmaydi.
 */
const streams: pino.StreamEntry[] = [
  { level: config.LOG_LEVEL as pino.Level, stream: isProd ? pino.destination(1) : pretty({
    colorize: true,
    translateTime: 'HH:MM:ss',
    ignore: 'pid,hostname',
  }) },
  // Bazaga `warn` va `error`, ustiga Telegram audit izi (`info`).
  // Saralashning O'ZI bu yerda emas, `logEntryToRow` da — faqat o'sha
  // yerda bayroq ko'rinadi. Bu oqim shunchaki `info` gacha ochib beradi.
  { level: 'info', stream: sinkStream },
];

/**
 * Pino avval o'zining umumiy `level`i bo'yicha filtrlaydi, keyin har
 * oqim o'z darajasi bo'yicha. Shuning uchun umumiy daraja oqimlar
 * darajalarining ENG KICHIGI bo'lishi shart. Rozetka endi `info` ni
 * ham ko'radi (Telegram audit izi), demak eng kichigi — `info`.
 *
 * Konsol oqimining darajasi `config.LOG_LEVEL` bo'lib qoladi, ya'ni
 * `stdout`/journald chiqishi bu o'zgarishdan keyin ham o'zgarmaydi.
 */
const INFO_LEVEL_VALUE = 30;
const configLevelValue = pino.levels.values[config.LOG_LEVEL] ?? Number.POSITIVE_INFINITY;
const rootLevel: pino.Level =
  configLevelValue <= INFO_LEVEL_VALUE ? (config.LOG_LEVEL as pino.Level) : 'info';

export const logger: Logger = pino(
  {
    level: rootLevel,
    redact: {
      paths: [
        'api_hash',
        'apiHash',
        'session',
        'password',
        'password_hash',
        'token',
        '*.api_hash',
        '*.session',
        // `socks` paketining SocksClientError'i xatoni `err.options.proxy.password`
        // yo'lida ochiq matnda saqlaydi (enumerable xususiyat). `*.password` bu yerga
        // yetmaydi — pinoning `*` joker belgisi FAQAT bitta pog'onani qamrab oladi,
        // bu esa 4 pog'onali yo'l. Shuning uchun aniq chuqurlik ko'rsatiladi;
        // `*` birinchi o'rinda — xato har doim ham `err` kaliti bilan
        // jurnallanmasligi mumkin (masalan, kelajakda `error` nomi ishlatilsa ham
        // ishlashda davom etadi). Login xuddi shu yo'lda `userId` deb ataladi —
        // `socks` paketi proksi loginini shu nom bilan saqlaydi.
        '*.options.proxy.password',
        '*.options.proxy.userId',
      ],
      censor: '[maxfiy]',
    },
  },
  pino.multistream(streams, { dedupe: false }),
);

export const childLogger = (scope: string): Logger => logger.child({ scope });
