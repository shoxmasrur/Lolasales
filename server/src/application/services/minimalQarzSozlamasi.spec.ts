import { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { ISettingsRepository } from '@/domain/repositories/ISupportRepositories';

/**
 * Qo'lda ishga tushiriladi: npm run test:minimal-qarz-sozlamasi --workspace=server
 *
 * Bazaga chiqmaydi — sozlamalar ombori soxta.
 *
 * NEGA STANDART QIYMAT TEKSHIRILADI: `minDebt` uchun migratsiya yo'q,
 * ya'ni prodda saqlangan `outreach` yozuvida bu maydon UMUMAN yo'q.
 * Standart qiymat ishlamasa, chegara jimgina `undefined` bo'lib qolardi
 * va `debt <= undefined` har doim `false` bergani uchun funksiya
 * mavjud emasdek tuyulardi.
 */
function sozlamalar(stored: Record<string, unknown> | null): {
  runtime: RuntimeSettings;
  yozilgan: () => Record<string, unknown> | null;
} {
  let saqlangan = stored;
  const repo = {
    get: async () => saqlangan,
    set: async (_key: string, value: unknown) => {
      saqlangan = value as Record<string, unknown>;
    },
    all: async () => ({}),
  } as unknown as ISettingsRepository;
  return { runtime: new RuntimeSettings(repo), yozilgan: () => saqlangan };
}

let failed = 0;
const check = (nom: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${nom}${ok || !izoh ? '' : `  ${izoh}`}`);
};

const bosh = await sozlamalar(null).runtime.get();
check(
  'saqlangan yozuv yo\'q — standart 100 000 so\'m',
  bosh.minDebt === 100_000,
  `olingan: ${bosh.minDebt}`,
);

const eski = await sozlamalar({ personaName: 'Madina' }).runtime.get();
check(
  'eski yozuvda maydon yo\'q — standart qo\'llanadi',
  eski.minDebt === 100_000,
  `olingan: ${eski.minDebt}`,
);

const saqlangan = await sozlamalar({ minDebt: 250_000 }).runtime.get();
check(
  'saqlangan qiymat standartdan ustun',
  saqlangan.minDebt === 250_000,
  `olingan: ${saqlangan.minDebt}`,
);

const nol = await sozlamalar({ minDebt: 0 }).runtime.get();
check(
  'nol — chegara o\'chirilgan, standart TIKLANMAYDI',
  nol.minDebt === 0,
  `olingan: ${nol.minDebt}`,
);

const s = sozlamalar({ minDebt: 100_000, personaName: 'Madina' });
const yangilangan = await s.runtime.update({ minDebt: 500_000 }, 'admin@x.uz');
check('update qaytargan qiymat yangi', yangilangan.minDebt === 500_000);
check(
  'update boshqa maydonlarni yo\'qotmaydi',
  s.yozilgan()?.personaName === 'Madina',
);

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
