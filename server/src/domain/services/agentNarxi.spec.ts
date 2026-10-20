import { davrKunlari, narxPrognozi } from '@/domain/services/agentNarxi';

/**
 * Qo'lda ishga tushiriladi: npm run test:agent-narxi --workspace=server
 *
 * Bu hisob asosida "boshqa provayderga o'tamizmi" degan qaror qabul
 * qilinadi, shuning uchun eng xavfli xato — xarajatni past ko'rsatish.
 * Aynan shu ikki holat tekshiriladi: nol bo'luvchi va o'lchov davrning
 * o'rtasida boshlangani.
 */
const CASES: Array<{ name: string; actual: unknown; expect: unknown }> = [
  {
    name: '10 chaqiruv, $1, 2 kun — javobi 10 sent, oyiga $15',
    actual: narxPrognozi(1, 10, 2),
    expect: { perCall: 0.1, perDay: 0.5, perMonth: 15 },
  },
  {
    name: 'chaqiruv yo\'q — nolga bo\'linmaydi',
    actual: narxPrognozi(0, 0, 0),
    expect: { perCall: 0, perDay: 0, perMonth: 0 },
  },
  {
    name: 'o\'lchov bugun boshlandi — kunlik o\'rtacha bugungiga teng',
    actual: narxPrognozi(2, 4, 0),
    expect: { perCall: 0.5, perDay: 2, perMonth: 60 },
  },
  {
    name: 'bir kunlik davr — 1 kun',
    actual: davrKunlari('2026-08-13', '2026-08-13', null),
    expect: 1,
  },
  {
    name: 'ikkala chekka ham kiradi',
    actual: davrKunlari('2026-08-01', '2026-08-13', null),
    expect: 13,
  },
  {
    name: 'o\'lchov davr o\'rtasida boshlangan — faqat shundan keyingi kunlar',
    actual: davrKunlari('2026-08-01', '2026-08-13', '2026-08-10'),
    expect: 4,
  },
  {
    name: 'o\'lchov davrdan oldin boshlangan — davr o\'zgarmaydi',
    actual: davrKunlari('2026-08-01', '2026-08-13', '2026-07-20'),
    expect: 13,
  },
];

let failed = 0;
for (const c of CASES) {
  const ok = JSON.stringify(c.actual) === JSON.stringify(c.expect);
  if (!ok) failed += 1;
  console.log(
    `${ok ? '✓' : '✗'} ${c.name}` +
      (ok ? '' : `\n    natija:   ${JSON.stringify(c.actual)}\n    kutilgan: ${JSON.stringify(c.expect)}`),
  );
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
