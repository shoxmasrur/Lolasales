import type { IAppLogRepository } from '@/domain/repositories/IAppLogRepository';
import { AppLogCleaner, RETENTION_DAYS, TELEGRAM_RETENTION_DAYS, TRANSCRIPT_RETENTION_DAYS } from '@/application/services/AppLogCleaner';
import { logEntryToRow } from '@/shared/logEntry';

/**
 * Qo'lda ishga tushiriladi: npm run test:app-log-cleaner
 *
 * NEGA TEKSHIRILADI: Telegram audit izi odatdagi jurnaldan o'nlab
 * barobar tez o'sadi. Ikki muddatdan biri tushib qolsa, buni hech kim
 * sezmaydi — jadval jimgina o'sib boradi va bir kuni so'rovlar
 * sekinlashadi.
 */

let failed = 0;

function eq(nom: string, actual: unknown, kutilgan: unknown): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(kutilgan);
  if (a === b) {
    console.log(`✓ ${nom}`);
  } else {
    failed += 1;
    console.log(`✗ ${nom}: ${a}  (kutilgan: ${b})`);
  }
}

interface Chaqiruv {
  days: number;
  flag: string | null;
}

function soxtaRepo(chaqiruvlar: Chaqiruv[], yiqilsin?: string | null): IAppLogRepository {
  return {
    deleteOlderThan: async (days: number, flag: string | null) => {
      chaqiruvlar.push({ days, flag });
      if (yiqilsin !== undefined && yiqilsin === flag) throw new Error('baza yiqildi');
      return 1;
    },
  } as unknown as IAppLogRepository;
}

// ── 1. Ikki oqim ikki muddat bilan tozalanadi ──────────────────────────
{
  const chaqiruvlar: Chaqiruv[] = [];
  const cleaner = new AppLogCleaner(soxtaRepo(chaqiruvlar));
  cleaner.start();
  cleaner.stop();
  // `start` ichidagi birinchi yurish kutilmaydi — navbatni bo'shatamiz.
  await new Promise((r) => setTimeout(r, 10));

  eq('ikki marta chaqirildi', chaqiruvlar.length, 2);
  eq('bayroqsiz 14 kun', chaqiruvlar[0], { days: RETENTION_DAYS, flag: null });
  eq('telegram 3 kun', chaqiruvlar[1], { days: TELEGRAM_RETENTION_DAYS, flag: 'telegram' });
  eq('muddatlar teng emas', (RETENTION_DAYS as unknown) === TELEGRAM_RETENTION_DAYS, false);
}

// ── 2. Bittasi yiqilsa ikkinchisi baribir bajariladi ───────────────────
// Aks holda baza bir marta xato bergani uchun Telegram izi ABADIY
// tozalanmay qolardi.
{
  const chaqiruvlar: Chaqiruv[] = [];
  const cleaner = new AppLogCleaner(soxtaRepo(chaqiruvlar, null));
  cleaner.start();
  cleaner.stop();
  await new Promise((r) => setTimeout(r, 10));

  eq('birinchisi yiqilsa ham ikkinchisi ketdi', chaqiruvlar.length, 2);
  eq('ikkinchisi telegram', chaqiruvlar[1]?.flag, 'telegram');
}

// ── 3. `tozala()` jurnalga `flag` kaliti bilan yozmaydi ────────────────
// REGRESSIYA: `flag` — `logEntryToRow` uchun band kalit (bu qatOR qaysi
// oqimga tegishli). Tozalovchi o'zining "qaysi oqim tozalandi" degan
// ma'nosini shu nom bilan yozsa, oddiy `info` yozuvi soxta Telegram
// qatoriday jadvalga tushib qolardi. Pino'ni ushlamasdan, natijani
// strukturaviy tekshiramiz: cleaner-shaklidagi `info` qator `oqim` bilan
// kelsa (`flag` bilan EMAS), `logEntryToRow` uni jurnalga QABUL
// QILMASLIGI kerak.
{
  const row = logEntryToRow({
    level: 30,
    time: 1,
    msg: 'x',
    scope: 'app-log-cleaner',
    oqim: 'telegram',
  });
  eq('oqim bilan kelgan cleaner info jurnalga tushmaydi', row, null);
}

// ── 4. Qo'ng'iroq transkripti 180 kundan keyin tozalanadi ──────────────
// NEGA: transkript mijozning so'zlari — saqlash muddati cheklangan bo'lishi
// kerak; xulosa va boshqa maydonlar qoladi.
{
  const kunlar: number[] = [];
  const cleaner = new AppLogCleaner(soxtaRepo([]), {
    clearTranscriptsOlderThan: async (d: number) => {
      kunlar.push(d);
      return 2;
    },
  });
  cleaner.start();
  cleaner.stop();
  await new Promise((r) => setTimeout(r, 10));
  eq('transkript 180 kun bilan tozalandi', kunlar, [180]);
  eq('doimiy 180', TRANSCRIPT_RETENTION_DAYS, 180);
}

// Transkript tozalash yiqilsa ham xato tashqariga chiqmaydi, jurnal tozalash esa ketgan.
{
  const chaqiruvlar: Chaqiruv[] = [];
  const cleaner = new AppLogCleaner(soxtaRepo(chaqiruvlar), {
    clearTranscriptsOlderThan: async () => {
      throw new Error('baza yiqildi');
    },
  });
  cleaner.start();
  cleaner.stop();
  await new Promise((r) => setTimeout(r, 10));
  eq('transkript yiqilsa ham jurnal tozalandi', chaqiruvlar.length, 2);
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
