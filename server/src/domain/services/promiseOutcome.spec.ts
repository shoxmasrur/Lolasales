import {
  eslatmaKerakmi,
  evaluatePromise,
  type PromiseAction,
  type PromiseSnapshot,
} from '@/domain/services/promiseOutcome';

/**
 * Qo'lda ishga tushiriladi: npm run test:promise-outcome --workspace=server
 *
 * Va'da tsiklining butun mantig'i shu funksiyada. Eng xavfli xato —
 * qisman to'laganga "kechikkan to'lovingiz yo'q" deb rahmat aytish,
 * shuning uchun `full` bayrog'i va `remaining` alohida tekshiriladi.
 */
const TODAY = '2026-08-15';

const promise = (over: Partial<PromiseSnapshot> = {}): PromiseSnapshot => ({
  amount: 5_000_000,
  promisedDateIso: '2026-08-15',
  watchUntilIso: '2026-08-22',
  paidAmount: 0,
  thankedAmount: 0,
  reminded: false,
  ...over,
});

const CASES: Array<{ name: string; input: PromiseSnapshot; today?: string; expect: PromiseAction }> = [
  {
    name: 'sana kelmagan, pul yo\'q — kutamiz',
    input: promise({ promisedDateIso: '2026-08-20' }),
    expect: { kind: 'wait' },
  },
  {
    name: 'sana kelmagan, lekin to\'liq to\'lagan — erta rahmat',
    input: promise({ promisedDateIso: '2026-08-20', paidAmount: 5_000_000 }),
    expect: { kind: 'thank', full: true, newMoney: 5_000_000, totalPaid: 5_000_000, remaining: 0, newStatus: 'kept' },
  },
  {
    name: 'va\'da kuni, pul yo\'q, hali eslatilmagan — eslatma',
    input: promise(),
    expect: { kind: 'remind' },
  },
  {
    name: 'va\'da kuni, pul yo\'q, allaqachon eslatilgan — kutamiz',
    input: promise({ reminded: true }),
    expect: { kind: 'wait' },
  },
  {
    name: 'va\'da kuni, to\'liq to\'lagan — to\'liq rahmat, eslatma YO\'Q',
    input: promise({ paidAmount: 5_000_000 }),
    expect: { kind: 'thank', full: true, newMoney: 5_000_000, totalPaid: 5_000_000, remaining: 0, newStatus: 'kept' },
  },
  {
    name: 'va\'da kuni, qisman to\'lagan — qisman rahmat, qoldiq ko\'rsatiladi',
    input: promise({ paidAmount: 3_000_000 }),
    expect: { kind: 'thank', full: false, newMoney: 3_000_000, totalPaid: 3_000_000, remaining: 2_000_000, newStatus: 'partial' },
  },
  {
    name: 'ortiqcha to\'lagan — to\'liq, qoldiq nol',
    input: promise({ paidAmount: 7_000_000 }),
    expect: { kind: 'thank', full: true, newMoney: 7_000_000, totalPaid: 7_000_000, remaining: 0, newStatus: 'kept' },
  },
  {
    name: 'ikkinchi qisman to\'lov — faqat YANGI summa uchun rahmat',
    input: promise({ paidAmount: 4_500_000, thankedAmount: 3_000_000, reminded: true }),
    today: '2026-08-18',
    expect: { kind: 'thank', full: false, newMoney: 1_500_000, totalPaid: 4_500_000, remaining: 500_000, newStatus: 'partial' },
  },
  {
    name: 'qisman to\'lov qolganini yopdi — endi to\'liq',
    input: promise({ paidAmount: 5_000_000, thankedAmount: 3_000_000, reminded: true }),
    today: '2026-08-18',
    expect: { kind: 'thank', full: true, newMoney: 2_000_000, totalPaid: 5_000_000, remaining: 0, newStatus: 'kept' },
  },
  {
    name: 'sana o\'tdi, kuzatuv ichida, yangi pul yo\'q — JIM kutamiz',
    input: promise({ reminded: true }),
    today: '2026-08-18',
    expect: { kind: 'wait' },
  },
  {
    name: 'kuzatuv muddati tugadi, to\'lanmadi — buzilgan',
    input: promise({ reminded: true }),
    today: '2026-08-23',
    expect: { kind: 'break' },
  },
  {
    name: 'kuzatuv tugadi, qisman to\'langan va rahmat aytilgan — baribir buzilgan',
    input: promise({ paidAmount: 3_000_000, thankedAmount: 3_000_000, reminded: true }),
    today: '2026-08-23',
    expect: { kind: 'break' },
  },
  {
    name: 'kuzatuvning oxirgi kuni — hali buzilgan emas',
    input: promise({ reminded: true }),
    today: '2026-08-22',
    expect: { kind: 'wait' },
  },
  {
    name: 'kuzatuv tugagan kuni pul keldi — rahmat buzilishdan ustun',
    input: promise({ paidAmount: 5_000_000, reminded: true }),
    today: '2026-08-25',
    expect: { kind: 'thank', full: true, newMoney: 5_000_000, totalPaid: 5_000_000, remaining: 0, newStatus: 'kept' },
  },
];

let failed = 0;

function eq(nom: string, actual: unknown, kutilgan: unknown): void {
  const a = JSON.stringify(actual);
  const k = JSON.stringify(kutilgan);
  if (a === k) {
    console.log(`✓ ${nom}`);
  } else {
    failed += 1;
    console.log(`✗ ${nom}: ${a}  (kutilgan: ${k})`);
  }
}

for (const c of CASES) {
  const actual = evaluatePromise(c.input, c.today ?? TODAY);
  const ok = JSON.stringify(actual) === JSON.stringify(c.expect);
  if (!ok) failed += 1;
  console.log(
    `${ok ? '✓' : '✗'} ${c.name}` +
      (ok ? '' : `\n    natija:   ${JSON.stringify(actual)}\n    kutilgan: ${JSON.stringify(c.expect)}`),
  );
}

// ─── Va'da kunida eslatma yuboriladimi ───────────────────────────────────
//
// Qisman to'lagan mijoz kelishilgan kunda eslatmasiz qolardi: eslatma
// ro'yxati faqat `pending` va'dalarni olardi, qisman to'lov esa va'dani
// `partial` ga o'tkazadi. Natijada agent "qolganini o'sha kuni yopasizmi?"
// deb kelishib olardi-yu, o'sha kuni jim turardi.
const ESLATMA: Array<{ name: string; input: Parameters<typeof eslatmaKerakmi>[0]; expect: boolean }> = [
  {
    name: 'pending, pul yo\'q — eslatma kerak',
    input: { status: 'pending', amount: 5_000_000, paidAmount: 0, thankedAmount: 0 },
    expect: true,
  },
  {
    name: 'partial, rahmat aytilgan, qoldiq bor — eslatma KERAK',
    input: { status: 'partial', amount: 5_000_000, paidAmount: 678_000, thankedAmount: 678_000 },
    expect: true,
  },
  {
    name: 'pul kelgan, rahmat hali aytilmagan — eslatma YO\'Q (avval rahmat)',
    input: { status: 'pending', amount: 5_000_000, paidAmount: 678_000, thankedAmount: 0 },
    expect: false,
  },
  {
    name: 'hammasi to\'langan — eslatma yo\'q',
    input: { status: 'partial', amount: 5_000_000, paidAmount: 5_000_000, thankedAmount: 5_000_000 },
    expect: false,
  },
  {
    name: 'ortiqcha to\'langan — eslatma yo\'q',
    input: { status: 'partial', amount: 5_000_000, paidAmount: 6_000_000, thankedAmount: 6_000_000 },
    expect: false,
  },
  {
    name: 'va\'da yopilgan (kept) — eslatma yo\'q',
    input: { status: 'kept', amount: 5_000_000, paidAmount: 5_000_000, thankedAmount: 5_000_000 },
    expect: false,
  },
  {
    name: 'va\'da bekor qilingan — eslatma yo\'q',
    input: { status: 'cancelled', amount: 5_000_000, paidAmount: 0, thankedAmount: 0 },
    expect: false,
  },
];

for (const c of ESLATMA) {
  const actual = eslatmaKerakmi(c.input);
  const ok = actual === c.expect;
  if (!ok) failed += 1;
  console.log(`${ok ? '\u2713' : '\u2717'} eslatma: ${c.name}${ok ? '' : `  (natija: ${actual})`}`);
}

// ── Bayram: muddat keyingi ish kuniga suriladi ────────────────────────
//
// NEGA BU TEST KERAK: bayramda bank ishlamaydi, ya'ni mijoz to'lay
// olmaydi. Muddat surilmasa, u "va'dasini buzdi" bo'lib belgilanadi,
// suhbat `needs_human` ga tushadi va agent bosimni kuchaytirishga ruxsat
// oladi — mijoz esa haqli ravishda "bank yopiq edi" deydi.
{
  const BAYRAM = [{
    id: 'h1', name: 'Mustaqillik bayrami',
    startsOn: '2026-08-28', endsOn: '2026-09-02', yillik: false,
  }];
  const kalendar = { bayramlar: BAYRAM, weekdays: [1, 2, 3, 4, 5, 6] };

  const vada = {
    amount: 5_000_000,
    promisedDateIso: '2026-08-30',
    watchUntilIso: '2026-08-31',
    paidAmount: 0,
    thankedAmount: 0,
    reminded: true,
  };

  // Kalendarsiz — eski xatti-harakat saqlanadi.
  eq('kalendarsiz muddat o\'tgan', evaluatePromise(vada, '2026-09-01').kind, 'break');

  // Kalendar bilan: muddat 31-avgust bayramga tushadi → 3-sentabrga suriladi.
  eq('bayram ichida kutiladi', evaluatePromise(vada, '2026-09-01', kalendar).kind, 'wait');
  eq('bayramning oxirgi kuni ham', evaluatePromise(vada, '2026-09-02', kalendar).kind, 'wait');
  eq('surilgan muddat kunida ham', evaluatePromise(vada, '2026-09-03', kalendar).kind, 'wait');
  eq('surilgan muddatdan keyin buziladi', evaluatePromise(vada, '2026-09-04', kalendar).kind, 'break');
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
