import {
  akkauntQatoriniYangila,
  boshIsh,
  bumpJob,
  jamiSurat,
  SKIP_DETAILS_LIMIT,
} from '@/application/services/bulkJobProgress';

/**
 * Qo'lda ishga tushiriladi: npm run test:bulk-progress --workspace=server
 *
 * NEGA KERAK: parallel oqimlarda hisoblagichni `job.done + 1` deb
 * o'qib-yozish jimgina buziladi — ikki oqim bir xil qiymatni o'qisa bitta
 * oshirish yo'qoladi va progress hech qachon oxiriga yetmaydi. Bu yerdagi
 * qoidalar sof, shuning uchun ularni to'g'ridan-to'g'ri tekshirib bo'ladi.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

const ish = boshIsh('j1', 6, false, [
  { accountId: 'a1', label: 'Madina', personaName: 'Madina', total: 3 },
  { accountId: 'a2', label: 'Nafosat', personaName: 'Nafosat', total: 3 },
]);

// ─── 1. Boshlang'ich yozuv ───────────────────────────────────────────────
{
  check('jami 6', ish.total === 6, String(ish.total));
  check('holat running', ish.status === 'running', ish.status);
  check('ikkita akkaunt qatori', ish.accounts.length === 2, String(ish.accounts.length));
  check('a1 kutmoqda', ish.accounts[0]?.status === 'waiting', String(ish.accounts[0]?.status));
  check('a1 jami 3', ish.accounts[0]?.total === 3, String(ish.accounts[0]?.total));
}

// ─── 2. Hisoblagich global VA akkaunt qatorida oshadi ────────────────────
{
  const keyin = bumpJob(ish, 'a1', { done: 1, started: 1 });
  check('global started 1', keyin.started === 1, String(keyin.started));
  check('a1 started 1', keyin.accounts[0]?.started === 1, String(keyin.accounts[0]?.started));
  check('a2 tegilmadi', keyin.accounts[1]?.started === 0, String(keyin.accounts[1]?.started));
  check('boshlang\'ich yozuv o\'zgarmadi', ish.started === 0, String(ish.started));
}

// ─── 3. Ikki oqimning ketma-ket oshirishi yo'qolmaydi ────────────────────
// Aynan poyga stsenariysi: ikkalasi ham BIR XIL boshlang'ich yozuvdan
// emas, oldingi natijadan davom etadi.
{
  let joriy = ish;
  joriy = bumpJob(joriy, 'a1', { done: 1, skipped: 1 });
  joriy = bumpJob(joriy, 'a2', { done: 1, skipped: 1 });

  check('done 2', joriy.done === 2, String(joriy.done));
  check('skipped 2', joriy.skipped === 2, String(joriy.skipped));
  check('a1 skipped 1', joriy.accounts[0]?.skipped === 1, String(joriy.accounts[0]?.skipped));
  check('a2 skipped 1', joriy.accounts[1]?.skipped === 1, String(joriy.accounts[1]?.skipped));
}

// ─── 4. O'tkazib yuborish sababi va tafsiloti ────────────────────────────
{
  const keyin = bumpJob(ish, 'a1', {
    done: 1,
    skipped: 1,
    skipReason: 'Telegramda topilmadi',
    skippedItem: { clientId: 'c1', fullName: 'Ali', reason: 'Telegramda topilmadi' },
  });

  check('sabab sanaldi', keyin.skipReasons['Telegramda topilmadi'] === 1,
    JSON.stringify(keyin.skipReasons));
  check('tafsilot qo\'shildi', keyin.skippedItems.length === 1, String(keyin.skippedItems.length));
}

// ─── 5. Tafsilot ro'yxati chegaradan oshmaydi ────────────────────────────
// Ro'yxat har progress yangilanishida veb-soket orqali TO'LIQ uzatiladi.
{
  let joriy = ish;
  for (let i = 0; i < SKIP_DETAILS_LIMIT + 5; i += 1) {
    joriy = bumpJob(joriy, 'a1', {
      done: 1,
      skipped: 1,
      skipReason: 'sabab',
      skippedItem: { clientId: `c${i}`, fullName: 'X', reason: 'sabab' },
    });
  }

  check('ro\'yxat chegarada', joriy.skippedItems.length === SKIP_DETAILS_LIMIT,
    String(joriy.skippedItems.length));
  check('oshgani sanaldi', joriy.skippedItemsTruncated === 5, String(joriy.skippedItemsTruncated));
}

// ─── 6. Akkaunt qatorini yangilash ───────────────────────────────────────
{
  const keyin = akkauntQatoriniYangila(ish, 'a1', {
    status: 'flood',
    error: 'Akkaunt cheklovga tushdi',
    nextAt: null,
  });

  check('a1 flood', keyin.accounts[0]?.status === 'flood', String(keyin.accounts[0]?.status));
  check('a1 sabab yozildi', keyin.accounts[0]?.error === 'Akkaunt cheklovga tushdi',
    String(keyin.accounts[0]?.error));
  check('a2 tegilmadi', keyin.accounts[1]?.status === 'waiting', String(keyin.accounts[1]?.status));
}

// ─── 7. Noma'lum akkaunt qatorni yaratmaydi va yiqilmaydi ────────────────
// Qoldiq oqimi `accountId: null` bilan keladi — u qator yaratmasligi kerak.
{
  const keyin = bumpJob(ish, null, { done: 1, skipped: 1 });
  check('global oshdi', keyin.done === 1, String(keyin.done));
  check('yangi qator yaratilmadi', keyin.accounts.length === 2, String(keyin.accounts.length));
}

// ─── 8. 'truncated' — chaqiruvchi tafsilot so'ramagan ────────────────────
// Ro'yxat allaqachon to'lgan bo'lsa chaqiruvchi ikkita baza so'rovini
// umuman qilmaydi va shu o'rniga 'truncated' yuboradi — faqat sanoq oshadi,
// ro'yxatga hech narsa qo'shilmaydi.
{
  const keyin = bumpJob(ish, 'a1', { done: 1, skipped: 1, skippedItem: 'truncated' });
  check('sanoq oshdi', keyin.skippedItemsTruncated === 1, String(keyin.skippedItemsTruncated));
  check('ro\'yxatga qo\'shilmadi', keyin.skippedItems.length === 0, String(keyin.skippedItems.length));
}

// ─── 9. Jami sur'at — oqimlar ustma-ust tushadi ──────────────────────────
// Uchta oqim, har biri 27 daqiqada bitta → jami 9 daqiqada bitta.
// Bu Puasson oqimlarining qo'shilishi: 1 / Σ(1/mean).
{
  check('uch oqim 27 daq → 9 daq', jamiSurat([27, 27, 27]) === 9, String(jamiSurat([27, 27, 27])));
  check('bitta oqim o\'zgarmaydi', jamiSurat([20]) === 20, String(jamiSurat([20])));
  check('null lar chiqarib tashlanadi', jamiSurat([27, null, 27]) === 13.5, String(jamiSurat([27, null, 27])));
  check('hammasi null → null', jamiSurat([null, null]) === null, String(jamiSurat([null, null])));
  check('bo\'sh → null', jamiSurat([]) === null, String(jamiSurat([])));
}

console.log(failed ? `\n${failed} ta sinov yiqildi` : '\nHammasi o\'tdi');
process.exit(failed ? 1 : 0);
