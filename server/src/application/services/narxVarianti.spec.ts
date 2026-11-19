import { XaridXizmati } from '@/application/services/XaridXizmati';
import type { Purchase, XaridBosqichi } from '@/domain/entities/Purchase';
import type { Course } from '@/domain/entities/Course';

/**
 * Qo'lda ishga tushiriladi: npm run test:narx-varianti --workspace=server (bazasiz).
 *
 * Mijoz tanlagan narx varianti (qator) xaridning jami summasi bo'ladi; faqat kursning
 * o'z variantlaridan biri; karta yuborilgach o'zgarmaydi; agent kursni qayta aytganda
 * tanlangan narx 300 000 ga qaytib ketmaydi.
 */
let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

const KURS = {
  id: 'k1',
  price: 300_000,
  priceOptions: [
    { label: '1-qator', price: 1_200_000 },
    { label: '2–3-qator', price: 1_000_000 },
    { label: '8-qator', price: 300_000 },
  ],
} as unknown as Course;

function qur(stage: XaridBosqichi = 'qiziqdi', total: number | null = 300_000) {
  const xarid: Purchase = {
    id: 'p1', clientId: 'c1', courseId: 'k1', stage, stageChangedAt: new Date(), totalAmount: total,
    paidAmount: 0, installment: false, linkSentAt: null, remindedStages: [], createdAt: new Date(),
  } as Purchase;
  const purchases = {
    findActiveByClient: async () => xarid,
    setCourse: async (_id: string, courseId: string, t: number) => {
      xarid.courseId = courseId;
      xarid.totalAmount = t;
      return xarid;
    },
  };
  const xizmat = new XaridXizmati(
    purchases as never,
    { findById: async (id: string) => (id === 'k1' ? KURS : null) } as never,
    { publish: () => undefined } as never,
    { record: async () => undefined } as never,
    { now: () => new Date('2026-11-19T00:00:00Z') } as never,
  );
  return { xizmat, xarid };
}

(async () => {
  {
    const { xizmat, xarid } = qur();
    const r = await xizmat.narxBelgila('c1', 1_000_000);
    check('2-qator tanlandi → jami 1 000 000', [r?.totalAmount, xarid.totalAmount], [1_000_000, 1_000_000]);
  }
  {
    const { xizmat, xarid } = qur();
    const r = await xizmat.narxBelgila('c1', 700_000);
    check("ro'yxatda yo'q narx (o'ylab topilgan) e'tiborsiz", [r, xarid.totalAmount], [null, 300_000]);
  }
  {
    const { xizmat, xarid } = qur('karta_yuborildi');
    const r = await xizmat.narxBelgila('c1', 1_000_000);
    check("karta yuborilgach narx o'zgarmaydi", [r, xarid.totalAmount], [null, 300_000]);
  }
  {
    const { xizmat } = qur('qiziqdi', 1_000_000);
    const r = await xizmat.kursBelgila('c1', 'k1');
    check('agent kursni qayta aytganda tanlangan narx saqlanadi', r.totalAmount, 1_000_000);
  }
  {
    const { xizmat } = qur('qiziqdi', 123_456);
    const r = await xizmat.kursBelgila('c1', 'k1');
    check('variant ham, kurs narxi ham emas — kurs narxiga qaytadi', r.totalAmount, 300_000);
  }

  if (failed) {
    console.error(`\n${failed} ta tekshiruv muvaffaqiyatsiz`);
    process.exit(1);
  }
  console.log("\nHammasi o'tdi");
})();
