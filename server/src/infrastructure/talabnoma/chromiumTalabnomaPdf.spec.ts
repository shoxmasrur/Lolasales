import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ChromiumTalabnomaPdf } from '@/infrastructure/talabnoma/ChromiumTalabnomaPdf';

/**
 * Qo'lda: npm run test:talabnoma-chromium --workspace=server
 *
 * Sof («Birlik»): haqiqiy Chrome kerak emas — o'rniga shell skript.
 * NEGA: Chrome deploydan KEYIN o'rnatilsa, birinchi "yo'q" javobi
 * keshlanib qolib, funksiya server qayta ishga tushguncha o'chiq turardi.
 */
let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};

async function main(): Promise<void> {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'talabnoma-chrome-spec-'));
  try {
    for (const f of ['fon.png', 'muhr.png', 'imzo.png']) await writeFile(path.join(tmp, f), 'x');
    const chrome = path.join(tmp, 'soxta-chrome');
    const pdf = new ChromiumTalabnomaPdf(tmp, chrome);

    check('brauzer yo\'q → tayyor emas', await pdf.tayyormi(), false);
    await writeFile(chrome, '#!/bin/sh\necho "Google Chrome 130"\n');
    await chmod(chrome, 0o755);
    check('brauzer keyin o\'rnatildi → tayyor (yo\'q javobi keshlanmagan)', await pdf.tayyormi(), true);
    await rm(chrome);
    check('tayyor javobi keshlanadi (--version qayta chaqirilmaydi)', await pdf.tayyormi(), true);
    await rm(path.join(tmp, 'muhr.png'));
    check('rasm olib tashlandi → tayyor emas', await pdf.tayyormi(), false);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }

  if (failed > 0) {
    console.error(`\n${failed} ta tekshiruv yiqildi`);
    process.exit(1);
  }
  console.log('\nHammasi o\'tdi');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
