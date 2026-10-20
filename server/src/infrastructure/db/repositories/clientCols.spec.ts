import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Qo'lda ishga tushiriladi: npm run test:client-cols --workspace=server
 *
 * NEGA KERAK: `mapClient` o'qiydigan ustun `PgClientRepository` dagi `COLS`
 * ro'yxatida bo'lmasa, u jimgina `undefined` bo'lib qoladi va soxta
 * repozitoriyli testlar buni ko'rmaydi.
 *
 * Statik tekshiruv — fayllar matn sifatida o'qiladi, modul import QILINMAYDI
 * (`mappers.ts` → `shared/crypto` → `shared/config` `.env` talab qiladi).
 * Shu sabab CI «Birlik testlari» qadamida ishlaydi.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

const here = dirname(fileURLToPath(import.meta.url));
const mappers = readFileSync(join(here, '..', 'mappers.ts'), 'utf8');
const repo = readFileSync(join(here, 'PgClientRepository.ts'), 'utf8');

const mapBody = /export function mapClient\(r: Row\): Client \{([\s\S]*?)\n\}/.exec(mappers)?.[1] ?? '';
const oqiladi = new Set([...mapBody.matchAll(/\br\.(\w+)/g)].map((m) => m[1]!));

const colsMatn = /const COLS = `([^`]*)`/.exec(repo)?.[1] ?? '';
const tanlanadi = new Set([...colsMatn.matchAll(/\bc\.(\w+)/g)].map((m) => m[1]!));

check('mapClient topildi va ustun o\'qiydi', oqiladi.size > 10, `${oqiladi.size} ta`);
check('COLS topildi', tanlanadi.size > 10, `${tanlanadi.size} ta`);

const yoq = [...oqiladi].filter((c) => !tanlanadi.has(c));
check('mapClient o\'qiydigan har bir ustun COLS da bor', yoq.length === 0, `yo'q: ${yoq.join(', ')}`);
check('COLS: source tanlanadi', tanlanadi.has('source'));
check('COLS: telegram_hash_account_id tanlanadi', tanlanadi.has('telegram_hash_account_id'));

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
