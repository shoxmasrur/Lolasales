import { kunlikXulosaMatni } from '@/application/services/XulosaBoti';

/**
 * Qo'lda ishga tushiriladi: npm run test:kunlik-xulosa --workspace=server
 *
 * Kunlik sotuv xulosasi matni: manbalar bo'yicha yangi mijozlar,
 * tasdiqlangan to'lovlar va navbatdagi cheklar. Bazaga chiqmaydi.
 */
let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

{
  const matn = kunlikXulosaMatni('2026-10-20', {
    newClientsToday: [{ source: 'reklama', count: 5 }, { source: 'guruh', count: 2 }],
    paymentsToday: { count: 3, amount: 1_500_000 },
    receiptsPending: 4,
  });
  const q = matn.split('\n');
  check('sarlavhada sana', q[0]?.includes('2026-10-20'), true);
  check('jami yangi mijozlar', q.includes('Yangi mijozlar: 7'), true);
  check('reklama', q.includes('  • Reklama: 5'), true);
  check('guruh', q.includes('  • Guruh: 2'), true);
  check('mijozsiz manba ham 0 bilan', [q.includes('  • Raqam: 0'), q.includes("  • Qo'lda: 0")], [true, true]);
  check('to\'lovlar soni va summasi', q.includes("Tasdiqlangan to'lovlar: 3 ta, 1 500 000 so'm"), true);
  check('navbatdagi cheklar', q.includes('Tekshiruvni kutayotgan cheklar: 4'), true);
  check('qarz so\'zlari yo\'q', /qarz|shartnoma|va'da|undir/i.test(matn), false);
}
{
  const matn = kunlikXulosaMatni('2026-10-21', {
    newClientsToday: [],
    paymentsToday: { count: 0, amount: 0 },
    receiptsPending: 0,
  });
  check('bo\'sh kun', matn.includes('Yangi mijozlar: 0') && matn.includes("0 ta, 0 so'm"), true);
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
