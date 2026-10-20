import type { Contract } from '@/domain/entities/Contract';
import { kechikishYopildi } from '@/domain/entities/Contract';

/**
 * Qo'lda ishga tushiriladi: npm run test:kechikish-yopildi --workspace=server
 *
 * "Kechikkan to'lovingiz yo'q" — agent aytadigan eng xavfli jumla:
 * noto'g'ri aytilsa mijoz uni darhol rad etadi va butun hisob-kitobga
 * ishonchi qoladi. Shuning uchun qaror modelga emas, shu funksiyaga
 * qoldirilgan.
 *
 * Produksiyada chiqqan tirqish: qaror va'daning FAQAT o'z shartnomasi
 * bo'yicha qabul qilinardi. Ikki shartnomali mijoz birinchisini yopsa,
 * ikkinchisi 12 mln kechikkan turganda ham "kechikkan to'lovingiz yo'q"
 * degan xabar ketardi.
 */
const shartnoma = (over: Partial<Contract> = {}): Contract =>
  ({
    id: 's1',
    debtFirst: 0,
    debtMonthly: 0,
    daysOverdue: 0,
    ...over,
  }) as Contract;

let failed = 0;
const check = (name: string, ok: boolean): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}`);
};

check(
  'hamma shartnoma toza — yopilgan',
  kechikishYopildi([shartnoma(), shartnoma({ id: 's2' })], 0),
);
check(
  'IKKINCHI shartnomada kechikish bor — yopilgan EMAS',
  !kechikishYopildi(
    [shartnoma(), shartnoma({ id: 's2', debtMonthly: 12_000_000, daysOverdue: 40 })],
    0,
  ),
);
check(
  'bitta shartnomada kechikish bor — yopilgan emas',
  !kechikishYopildi([shartnoma({ debtMonthly: 1 })], 0),
);
// "summa nol, lekin kechikish kuni bor" holati bu yerdan OLIB TASHLANDI:
// javob o'zgardi (endi yopilgan) va yangi xatti-harakat sababi bilan
// birga `minimalQarz.spec.ts` da tekshiriladi.
check(
  'shartnoma ro\'yxati bo\'sh — "yo\'q" deb AYTILMAYDI',
  !kechikishYopildi([], 0),
);

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
