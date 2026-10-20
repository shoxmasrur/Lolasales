import { computeDebt, type DebtBreakdown, type ScheduleRow } from '@/domain/services/contractDebt';

/**
 * Qo'lda ishga tushiriladi: npm run test:contract-debt --workspace=server
 *
 * Bu funksiya butun integratsiyaning yuragi: mijozga aytiladigan summa
 * shu yerdan chiqadi. Shartnomalar bazasidagi `total_debt` maydoni
 * ishlatilmaydi — u umumiy qoldiq (transaction_price - total_paid),
 * kechikkan to'lov emas.
 */
const TODAY = '2026-08-06';

const row = (p: Partial<ScheduleRow> & { datePayment: string }): ScheduleRow => ({
  type: 'monthly',
  amount: 8_339_000,
  amountPaid: 0,
  status: 'waiting',
  ...p,
});

const CASES: Array<{ name: string; schedule: ScheduleRow[]; expect: Partial<DebtBreakdown> }> = [
  {
    name: 'bo\'sh grafik — hammasi nol',
    schedule: [],
    expect: {
      overdueTotal: 0, overdueMonthly: 0, overdueFirst: 0, overdueMeter: 0,
      daysOverdue: 0, missedMonths: 0, nextPaymentDate: null, nextPaymentAmount: null,
    },
  },
  {
    name: 'hammasi to\'langan — kechikkan to\'lov yo\'q',
    schedule: [
      row({ datePayment: '2026-06-25', amountPaid: 8_339_000, status: 'paid' }),
      row({ datePayment: '2026-07-25', amountPaid: 8_339_000, status: 'paid' }),
      row({ datePayment: '2026-09-25' }),
    ],
    expect: {
      overdueTotal: 0, daysOverdue: 0, missedMonths: 0,
      nextPaymentDate: '2026-09-25', nextPaymentAmount: 8_339_000,
    },
  },
  {
    name: 'ikki oy to\'lanmagan',
    schedule: [
      row({ datePayment: '2026-06-25' }),
      row({ datePayment: '2026-07-25' }),
      row({ datePayment: '2026-09-25' }),
    ],
    // 2026-06-25 dan 2026-08-06 gacha 42 kun
    expect: {
      overdueTotal: 16_678_000, overdueMonthly: 16_678_000, overdueFirst: 0,
      daysOverdue: 42, missedMonths: 2,
    },
  },
  {
    name: 'qisman to\'langan — faqat farqi hisoblanadi',
    schedule: [row({ datePayment: '2026-07-25', amountPaid: 3_000_000, status: 'partially' })],
    expect: { overdueTotal: 5_339_000, overdueMonthly: 5_339_000, missedMonths: 1 },
  },
  {
    name: 'bugungi to\'lov kuni — hali kechikkan emas',
    schedule: [row({ datePayment: TODAY })],
    expect: {
      overdueTotal: 0, daysOverdue: 0, missedMonths: 0,
      nextPaymentDate: TODAY, nextPaymentAmount: 8_339_000,
    },
  },
  {
    name: 'boshlang\'ich to\'lov kechikishi alohida qismda',
    schedule: [
      row({
        datePayment: '2026-07-17', type: 'initial_payment',
        amount: 100_000_000, amountPaid: 88_000_000, status: 'partially',
      }),
    ],
    expect: {
      overdueTotal: 12_000_000, overdueFirst: 12_000_000,
      overdueMonthly: 0, missedMonths: 0,
    },
  },
  {
    name: 'aralash: boshlang\'ich + ikki oy',
    schedule: [
      row({
        datePayment: '2026-05-17', type: 'initial_payment',
        amount: 100_000_000, amountPaid: 88_000_000, status: 'partially',
      }),
      row({ datePayment: '2026-06-25' }),
      row({ datePayment: '2026-07-25' }),
      row({ datePayment: '2026-09-25' }),
    ],
    expect: {
      overdueTotal: 28_678_000, overdueFirst: 12_000_000, overdueMonthly: 16_678_000,
      missedMonths: 2, daysOverdue: 81, nextPaymentDate: '2026-09-25',
    },
  },
  {
    // 2370ORZ26KE: grafikda oylikdan tashqari hisoblagichlar uchun to'lov
    // (`for_electrocity`) bor. U oylikka QO'SHILMAYDI va jamiga kirmaydi.
    name: 'hisoblagich to\'lovi kechikkan — alohida, oylikka qo\'shilmaydi',
    schedule: [
      row({ type: 'meter', datePayment: '2026-06-01', amount: 3_870_000 }),
      row({ datePayment: '2026-07-25' }),
      row({ datePayment: '2026-09-25' }),
    ],
    // Kechikish kuni oylik qatordan (2026-07-25): 12 kun.
    expect: {
      overdueMeter: 3_870_000, overdueMonthly: 8_339_000, overdueFirst: 0,
      overdueTotal: 8_339_000, missedMonths: 1, daysOverdue: 12,
    },
  },
  {
    name: 'faqat hisoblagich kechikkan — jami va kechikish kuni nol',
    schedule: [
      row({ type: 'meter', datePayment: '2026-06-01', amount: 3_870_000, amountPaid: 870_000, status: 'partially' }),
      row({ datePayment: '2026-09-25' }),
    ],
    expect: {
      overdueMeter: 3_000_000, overdueTotal: 0, overdueMonthly: 0,
      daysOverdue: 0, missedMonths: 0, nextPaymentDate: '2026-09-25',
    },
  },
  {
    name: 'kelajakdagi hisoblagich to\'lovi "navbatdagi to\'lov" bo\'lmaydi',
    schedule: [
      row({ type: 'meter', datePayment: '2026-08-20', amount: 3_870_000 }),
      row({ datePayment: '2026-09-25' }),
    ],
    expect: { overdueMeter: 0, nextPaymentDate: '2026-09-25', nextPaymentAmount: 8_339_000 },
  },
  {
    name: 'status paid, lekin summa kam — paid ustun, kechikkan deb sanalmaydi',
    schedule: [row({ datePayment: '2026-06-25', amountPaid: 8_000_000, status: 'paid' })],
    expect: { overdueTotal: 0, missedMonths: 0 },
  },
];

let failed = 0;
for (const c of CASES) {
  const actual = computeDebt(c.schedule, TODAY);
  const bad = Object.entries(c.expect).filter(
    ([k, v]) => actual[k as keyof DebtBreakdown] !== v,
  );
  if (bad.length) {
    failed += 1;
    console.log(`✗ ${c.name}`);
    for (const [k, v] of bad) {
      console.log(`    ${k}: ${String(actual[k as keyof DebtBreakdown])} (kutilgan: ${String(v)})`);
    }
  } else {
    console.log(`✓ ${c.name}`);
  }
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
