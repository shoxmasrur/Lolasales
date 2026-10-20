import { bucketFor, sumByBucket, type AttributedPayment } from '@/domain/services/attributionBuckets';

/**
 * Qo'lda ishga tushiriladi: npm run test:attribution --workspace=server
 *
 * Guruhlar hisobotning halolligi uchun kerak: umumiy raqam "gaplashgandan
 * keyingi HAR QANDAY to'lov" bo'lgani uchun katta chiqadi, shuning uchun
 * qanchasi yaqin kunlarda kelgani yonida turishi shart.
 */
let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed += 1;
  console.log(
    `${ok ? '✓' : '✗'} ${name}` +
      (ok ? '' : ` → ${JSON.stringify(actual)} (kutilgan: ${JSON.stringify(expected)})`),
  );
};

// ─── Chegaralar ──────────────────────────────────────────────────────────
check('xabar bilan bir kunda', bucketFor(0), 'd0_7');
check('7-kun — hali birinchi guruh', bucketFor(7), 'd0_7');
check('8-kun — ikkinchi guruh', bucketFor(8), 'd8_30');
check('30-kun — hali ikkinchi guruh', bucketFor(30), 'd8_30');
check('31-kun — uchinchi guruh', bucketFor(31), 'd31plus');
check('bir yildan keyin', bucketFor(400), 'd31plus');
// Anchor'dan OLDINGI to'lov hisobotga umuman tushmasligi kerak (so'rovda
// `date_paid >= anchor` sharti bor). Agar shu shart buzilsa manfiy son
// keladi — u holda ham funksiya yiqilmasin.
check('manfiy kun ham birinchi guruhda', bucketFor(-3), 'd0_7');

// ─── Yig'indi ────────────────────────────────────────────────────────────
const PAYMENTS: AttributedPayment[] = [
  { amount: 5_000_000, daysAfter: 2 },
  { amount: 3_000_000, daysAfter: 7 },
  { amount: 8_000_000, daysAfter: 15 },
  { amount: 1_000_000, daysAfter: 90 },
];

check("guruhlar bo'yicha yig'indi", sumByBucket(PAYMENTS), {
  d0_7: 8_000_000,
  d8_30: 8_000_000,
  d31plus: 1_000_000,
});

check("bo'sh ro'yxat", sumByBucket([]), { d0_7: 0, d8_30: 0, d31plus: 0 });

const total = Object.values(sumByBucket(PAYMENTS)).reduce((a, b) => a + b, 0);
check("guruhlar yig'indisi umumiy summaga teng", total, 17_000_000);

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
