import {
  belgila,
  eksportDavriXatosi,
  jamiYigindi,
  kechikishHolati,
  qamrovgaMos,
  shartnomalarKesimi,
  type GrafikQatori,
  type XomTolov,
} from '@/domain/services/tushumBelgilari';

/** Qo'lda ishga tushiriladi: npm run test:tushum-belgilari --workspace=server */

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

const g = (datePayment: string, datePaid: string | null, status: string): GrafikQatori => ({
  datePayment,
  datePaid,
  status,
});

const tolov = (o: Partial<XomTolov> = {}): XomTolov => ({
  eventId: 'e1',
  contractNo: 'A-1',
  clientName: 'Aliyev Vali',
  objectName: 'Blok 3',
  amount: 1_000_000,
  datePaid: '2026-08-20',
  paymentType: 'monthly',
  purpose: null,
  isProblematic: false,
  anchorDate: null,
  grafik: [],
  ...o,
});

// ─── kechikishHolati ──────────────────────────────────────────────────────
check('grafik yo\'q — noma\'lum', kechikishHolati('2026-08-20', []), {
  kechikkan: 'nomalum',
  kechikishKuni: null,
});
check(
  'muddati kelmagan qator — kechikmagan',
  kechikishHolati('2026-08-20', [g('2026-08-25', null, 'waiting')]),
  { kechikkan: 'yoq', kechikishKuni: null },
);
check(
  'muddat aynan to\'lov kuni — kechikmagan',
  kechikishHolati('2026-08-20', [g('2026-08-20', '2026-08-20', 'paid')]),
  { kechikkan: 'yoq', kechikishKuni: null },
);
check(
  'oldin yopilgan qator — kechikmagan',
  kechikishHolati('2026-08-20', [g('2026-07-15', '2026-07-14', 'paid')]),
  { kechikkan: 'yoq', kechikishKuni: null },
);
check(
  'shu to\'lov yopgan qator — kechikkan',
  kechikishHolati('2026-08-20', [g('2026-08-15', '2026-08-20', 'paid')]),
  { kechikkan: 'ha', kechikishKuni: 5 },
);
check(
  'ochiq qator — kechikkan',
  kechikishHolati('2026-08-20', [g('2026-08-10', null, 'waiting')]),
  { kechikkan: 'ha', kechikishKuni: 10 },
);
check(
  'qisman, oldingi sana bilan — hali ochiq',
  kechikishHolati('2026-08-20', [g('2026-08-10', '2026-08-12', 'partially')]),
  { kechikkan: 'ha', kechikishKuni: 10 },
);
check(
  'bir nechta ochiq — eng eskisidan sanaladi',
  kechikishHolati('2026-08-20', [
    g('2026-07-10', null, 'waiting'),
    g('2026-06-10', '2026-08-25', 'paid'),
    g('2026-05-10', '2026-05-09', 'paid'),
  ]),
  { kechikkan: 'ha', kechikishKuni: 71 },
);

// ─── belgila ──────────────────────────────────────────────────────────────
const b1 = belgila(tolov());
check('anchor yo\'q — gaplashilmagan', [b1.gaplashilgan, b1.xabardanKeyinKun], [false, null]);
const b2 = belgila(tolov({ anchorDate: '2026-08-20' }));
check('anchor to\'lov kuni — gaplashilgan, 0 kun', [b2.gaplashilgan, b2.xabardanKeyinKun], [true, 0]);
const b3 = belgila(tolov({ anchorDate: '2026-07-01' }));
check('iyulda gaplashilgan — 50 kun', [b3.gaplashilgan, b3.xabardanKeyinKun], [true, 50]);
const b4 = belgila(tolov({ anchorDate: '2026-08-21' }));
check('xabar to\'lovdan keyin — gaplashilmagan', [b4.gaplashilgan, b4.xabardanKeyinKun], [false, null]);

// ─── qamrovgaMos ──────────────────────────────────────────────────────────
const kechikkan = belgila(tolov({ grafik: [g('2026-08-01', null, 'waiting')] }));
check('all — hammasi', [qamrovgaMos(b1, 'all'), qamrovgaMos(kechikkan, 'all')], [true, true]);
check('contacted', [qamrovgaMos(b1, 'contacted'), qamrovgaMos(b3, 'contacted')], [false, true]);
check('overdue — noma\'lum kirmaydi', [qamrovgaMos(b1, 'overdue'), qamrovgaMos(kechikkan, 'overdue')], [false, true]);

// ─── shartnomalarKesimi va jamiYigindi ────────────────────────────────────
const qatorlar = [
  belgila(tolov({ eventId: '1', contractNo: 'A-1', amount: 100, anchorDate: '2026-08-01' })),
  belgila(tolov({ eventId: '2', contractNo: 'A-1', amount: 50, grafik: [g('2026-08-01', null, 'waiting')] })),
  belgila(tolov({ eventId: '3', contractNo: 'B-2', amount: 500, isProblematic: true })),
];
check('shartnomalar summa bo\'yicha kamayadi', shartnomalarKesimi(qatorlar), [
  {
    contractNo: 'B-2', clientName: 'Aliyev Vali', objectName: 'Blok 3',
    soni: 1, jami: 500, gaplashilgandanKeyin: 0, kechikkan: 0, anchorDate: null,
  },
  {
    contractNo: 'A-1', clientName: 'Aliyev Vali', objectName: 'Blok 3',
    soni: 2, jami: 150, gaplashilgandanKeyin: 100, kechikkan: 50, anchorDate: '2026-08-01',
  },
]);
check('jami', jamiYigindi(qatorlar), {
  hammasi: { soni: 3, summa: 650 },
  gaplashilgan: { soni: 1, summa: 100 },
  kechikkan: { soni: 1, summa: 50 },
  nomalum: { soni: 2, summa: 600 },
  bahsli: { soni: 1, summa: 500 },
});

// ─── eksportDavriXatosi ───────────────────────────────────────────────────
check('to\'g\'ri oy', eksportDavriXatosi('2026-08-01', '2026-08-31'), null);
check('bir kun', eksportDavriXatosi('2026-08-01', '2026-08-01'), null);
check('teskari', eksportDavriXatosi('2026-09-01', '2026-08-01'), 'Boshlanish sanasi tugash sanasidan keyin');
check('366 kun — ruxsat', eksportDavriXatosi('2025-01-01', '2026-01-01'), null);
check('367 kun — oshib ketdi', eksportDavriXatosi('2025-01-01', '2026-01-02'), 'Davr 366 kundan oshmasin');
check('mavjud bo\'lmagan sana (fevral 31)', eksportDavriXatosi('2026-02-31', '2026-03-05'), 'Sana noto\'g\'ri');
check('mavjud bo\'lmagan oy (13-oy)', eksportDavriXatosi('2026-08-01', '2026-13-01'), 'Sana noto\'g\'ri');

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
