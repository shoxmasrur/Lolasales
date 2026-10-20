import { PromiseWatcher } from '@/application/services/PromiseWatcher';
import { evaluatePromise, type PromiseSnapshot } from '@/domain/services/promiseOutcome';

/**
 * Qo'lda ishga tushiriladi: npm run test:promise-watcher --workspace=server
 *
 * `verify()` ning qaror qismi `evaluatePromise` da (u alohida testlangan).
 * Bu yerda kuzatuvchining O'ZI qaysi holatda qanday yon ta'sir
 * chiqarishini qo'riqlaymiz: qachon xabar ketadi, qachon holat
 * o'zgaradi, qachon tizim JIM turadi.
 *
 * Eng muhim invariant — kuzatuv davrida va va'da buzilganda mijozga
 * hech qanday xabar ketmasligi.
 */
const TODAY = '2026-08-15';

interface Expected {
  thanks: boolean;
  reminder: boolean;
  statusAfter: string | null;
  /** Mijozga xabar ketadimi. */
  writes: boolean;
}

const base = (over: Partial<PromiseSnapshot> = {}): PromiseSnapshot => ({
  amount: 5_000_000,
  promisedDateIso: '2026-08-15',
  watchUntilIso: '2026-08-22',
  paidAmount: 0,
  thankedAmount: 0,
  reminded: false,
  ...over,
});

/** Kuzatuvchi `evaluatePromise` natijasidan qanday yon ta'sir chiqaradi. */
function describe(snapshot: PromiseSnapshot, today: string): Expected {
  const action = evaluatePromise(snapshot, today);
  switch (action.kind) {
    case 'thank':
      return { thanks: true, reminder: false, statusAfter: action.newStatus, writes: true };
    case 'remind':
      return { thanks: false, reminder: true, statusAfter: null, writes: true };
    case 'break':
      return { thanks: false, reminder: false, statusAfter: 'broken', writes: false };
    case 'wait':
      return { thanks: false, reminder: false, statusAfter: null, writes: false };
  }
}

const SCENARIOS: Array<{ name: string; snapshot: PromiseSnapshot; today?: string; expect: Expected }> = [
  {
    name: 'to\'liq to\'lov keldi — rahmat, kept, kuzatuv tugadi',
    snapshot: base({ paidAmount: 5_000_000 }),
    expect: { thanks: true, reminder: false, statusAfter: 'kept', writes: true },
  },
  {
    name: 'qisman to\'lov — rahmat, partial, kuzatuv davom',
    snapshot: base({ paidAmount: 3_000_000 }),
    expect: { thanks: true, reminder: false, statusAfter: 'partial', writes: true },
  },
  {
    name: 'va\'da kuni, pul yo\'q — eslatma',
    snapshot: base(),
    expect: { thanks: false, reminder: true, statusAfter: null, writes: true },
  },
  {
    name: 'sana o\'tdi, pul yo\'q, kuzatuv ichida — JIM, xabar yo\'q',
    snapshot: base({ reminded: true }),
    today: '2026-08-18',
    expect: { thanks: false, reminder: false, statusAfter: null, writes: false },
  },
  {
    name: 'kuzatuv tugadi — broken, xabar yo\'q',
    snapshot: base({ reminded: true }),
    today: '2026-08-23',
    expect: { thanks: false, reminder: false, statusAfter: 'broken', writes: false },
  },
  {
    name: 'ikkinchi qisman to\'lov — yana rahmat, faqat yangi summa uchun',
    snapshot: base({ paidAmount: 4_500_000, thankedAmount: 3_000_000, reminded: true }),
    today: '2026-08-18',
    expect: { thanks: true, reminder: false, statusAfter: 'partial', writes: true },
  },
  {
    name: 'kuzatuv tugagan kuni pul keldi — rahmat, buzilgan emas',
    snapshot: base({ paidAmount: 5_000_000, reminded: true }),
    today: '2026-08-25',
    expect: { thanks: true, reminder: false, statusAfter: 'kept', writes: true },
  },
];

let failed = 0;
for (const s of SCENARIOS) {
  const actual = describe(s.snapshot, s.today ?? TODAY);
  const ok = JSON.stringify(actual) === JSON.stringify(s.expect);
  if (!ok) failed += 1;
  console.log(
    `${ok ? '✓' : '✗'} ${s.name}` +
      (ok ? '' : `\n    natija:   ${JSON.stringify(actual)}\n    kutilgan: ${JSON.stringify(s.expect)}`),
  );
}

// Invariant: kuzatuv davrida va buzilganda mijozga xabar KETMAYDI.
const silent = [
  evaluatePromise(base({ reminded: true }), '2026-08-16'),
  evaluatePromise(base({ reminded: true }), '2026-08-18'),
  evaluatePromise(base({ reminded: true }), '2026-08-22'),
  evaluatePromise(base({ reminded: true }), '2026-08-23'),
];
const allSilent = silent.every((a) => a.kind === 'wait' || a.kind === 'break');
if (!allSilent) failed += 1;
console.log(`${allSilent ? '✓' : '✗'} kuzatuv davrida va buzilganda mijozga xabar ketmaydi`);

// Invariant: qisman to'lovda "kept" YO'Q — aks holda "hammasi yopildi"
// degan xabar ketardi.
const partial = evaluatePromise(base({ paidAmount: 4_999_999 }), TODAY);
const partialOk = partial.kind === 'thank' && !partial.full && partial.newStatus === 'partial';
if (!partialOk) failed += 1;
console.log(`${partialOk ? '✓' : '✗'} 1 so'm kam to'lansa ham "to'liq" deb hisoblanmaydi`);

// Bitta shartnomaga bog'lanmagan (ko'p shartnomali, telefon) va'da: yoziladigan
// shartnomalarning HAMMASI CRM'dan yangilanadi, aks holda to'lov ko'rinmay qoladi.
{
  const yangilangan: string[] = [];
  const shartnomalar = [
    { id: 'ct1', virtualStatus: 'sold' },
    { id: 'ct2', virtualStatus: 'sold' },
    { id: 'ct3', virtualStatus: 'for_return' }, // yozilmaydigan holat — tegilmaydi
  ];
  const watcher = new PromiseWatcher(
    {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    { findByClientId: async () => shartnomalar } as never,
    { listPaidSince: async () => [] } as never,
    {
      syncIfStale: async (id: string) => {
        yangilangan.push(id);
        if (id === 'ct1') throw new Error('CRM yiqildi'); // biri yiqilsa ikkinchisi yangilanaveradi
      },
    } as never,
    {} as never, {} as never, {} as never,
    { sukutdami: async () => false },
  );
  const promise = { id: 'p1', clientId: 'cl1', contractId: null, createdAt: new Date('2026-10-14T05:00:00Z'), promisedDate: new Date('2026-10-17T00:00:00Z') };
  await (watcher as unknown as { refreshAndSum(p: unknown): Promise<number> }).refreshAndSum(promise);
  const ok = JSON.stringify(yangilangan) === JSON.stringify(['ct1', 'ct2']);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} contractId null — yoziladigan har ikki shartnoma yangilanadi (${yangilangan.join(',')})`);
}

// Talabnoma muddati ichida va'da kuni eslatmasi ham agentning O'Z
// tashabbusi — yozilmaydi. Bu KEYINGA SURISH EMAS, O'TKAZIB YUBORISH:
// eslatma faqat va'da kuni ketadi, muddat tugaganda esa o'sha kun o'tib
// bo'lgan. Tekshiruv pauzadan OLDIN: sukutdagi va'da 1-3 daqiqalik
// kutishni yemasin (pauza 2 soniyaga qo'yilgan — u ishlasa vaqt sezildi).
{
  const chaqiruvlar: string[] = [];
  const belgilar: string[] = [];
  const sorovlar: Array<[string, string]> = [];
  const vada = (id: string, clientId: string, conversationId: string) => ({
    id, clientId, conversationId, contractId: null, amount: 1_000_000, paidAmount: 0, thankedAmount: 0,
    status: 'pending', promisedDate: new Date('2026-08-15T00:00:00Z'),
  });
  // p1 — oddiy (nazorat), p2 — talabnoma muddatidagi mijoz.
  const vadalar = [vada('p1', 'cl1', 'cv1'), vada('p2', 'cl2', 'cv2')];
  const watcher = new PromiseWatcher(
    {
      findDueToday: async () => vadalar,
      findById: async (id: string) => vadalar.find((v) => v.id === id) ?? null,
      markReminded: async (id: string) => { belgilar.push(id); },
    } as never,
    {
      findById: async (id: string) => ({
        id, clientId: id === 'cv1' ? 'cl1' : 'cl2', agentEnabled: true, needsHuman: false, state: 'negotiating', telegramAccountId: null,
      }),
    } as never,
    {
      promiseReminder: async (conversationId: string) => {
        chaqiruvlar.push(conversationId);
        return { sent: true, reply: 'eslatma', escalated: false, promiseRecorded: false };
      },
    } as never,
    {
      get: async () => ({
        promiseReminder: true, killSwitch: false, windowStart: '00:00', promiseReminderUntil: '23:59',
        weekdays: [1, 2, 3, 4, 5, 6, 7], minDelaySec: 2, maxDelaySec: 2,
      }),
    } as never,
    { record: async () => undefined } as never,
    { publish: () => undefined } as never,
    { now: () => new Date('2026-08-15T04:00:00Z'), todayIso: () => TODAY } as never,
    { findById: async () => null } as never,
    {} as never, {} as never,
    { labelOf: () => null } as never,
    { list: async () => [] } as never,
    {} as never,
    {
      sukutdami: async (clientId: string, today: string) => {
        sorovlar.push([clientId, today]);
        return clientId === 'cl2';
      },
    },
  );
  const boshi = Date.now();
  const sent = await watcher.remind();
  const ms = Date.now() - boshi;
  const tekshir = (nom: string, ok: boolean): void => {
    if (!ok) failed += 1;
    console.log(`${ok ? '✓' : '✗'} ${nom} (${JSON.stringify({ sent, chaqiruvlar, belgilar, sorovlar, ms })})`);
  };
  tekshir('talabnoma sukuti yo\'q — eslatma avvalgidek ketdi', chaqiruvlar.includes('cv1') && belgilar.includes('p1'));
  tekshir('talabnoma muddati — eslatma agentga BORMADI, reminded_at qo\'yilmadi', !chaqiruvlar.includes('cv2') && !belgilar.includes('p2'));
  tekshir('talabnoma muddati — mijoz va bugungi sana bilan so\'raldi', sorovlar.some(([c, d]) => c === 'cl2' && d === TODAY));
  tekshir('talabnoma muddati — pauza sarflanmadi (tekshiruv pauzadan oldin)', ms < 1500);
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
