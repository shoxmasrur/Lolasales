import { qongiroqMumkinmi } from '@/domain/services/qongiroqMumkinmi';
import { QongiroqBrifi, ShartnomaTopilmadi, type QongiroqBrifiDeps } from '@/application/services/QongiroqBrifi';

/**
 * Qo'lda ishga tushiriladi: npm run test:qongiroq-brifi --workspace=server
 * Bazaga, CRM'ga va Telegramga chiqmaydi — hamma bog'liqlik soxta.
 */
let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

// ─── qongiroqMumkinmi ─────────────────────────────────────────────────────
const asos = {
  boglanmaslik: false, killSwitch: false, yoziladiganShartnomaBor: true,
  kechikkanJami: 17_356_000, minDebt: 0, eskirganMalumot: false, ochiqVadaKuni: null, telegramToxtatgan: false, bugun: '2026-10-14',
};
check('hammasi joyida — mumkin', qongiroqMumkinmi(asos), { mumkin: true, sabablar: [] });
check('bog\'lanmaslik', qongiroqMumkinmi({ ...asos, boglanmaslik: true }).sabablar,
  ['Mijozda "bog\'lanmaslik" belgisi bor']);
check('yoziladigan shartnoma yo\'q', qongiroqMumkinmi({ ...asos, yoziladiganShartnomaBor: false }).sabablar,
  ['Yoziladigan holatdagi (Сотилди, К оплате, Проц. отказ) shartnomasi yo\'q']);
check('kechikish yo\'q', qongiroqMumkinmi({ ...asos, kechikkanJami: 0 }).sabablar, ['Kechikkan to\'lov yo\'q']);
check('minimal chegaradan kichik', qongiroqMumkinmi({ ...asos, kechikkanJami: 900, minDebt: 1000 }).sabablar,
  ['Kechikkan to\'lov minimal chegaradan kichik']);
check('chegaraga teng — ham kichik hisoblanadi', qongiroqMumkinmi({ ...asos, kechikkanJami: 1000, minDebt: 1000 }).mumkin, false);
check('ochiq va\'da kelajakda', qongiroqMumkinmi({ ...asos, ochiqVadaKuni: '2026-10-17' }).sabablar,
  ['Ochiq va\'da bor: 17.10.2026 gacha kutiladi']);
check('va\'da kuni bugun — kutiladi', qongiroqMumkinmi({ ...asos, ochiqVadaKuni: '2026-10-14' }).mumkin, false);
check('va\'da kuni o\'tgan — to\'smaydi', qongiroqMumkinmi({ ...asos, ochiqVadaKuni: '2026-10-10' }).mumkin, true);
check('telegram to\'xtatgan', qongiroqMumkinmi({ ...asos, telegramToxtatgan: true }),
  { mumkin: false, sabablar: ['Suhbat operator qo\'lida yoki to\'xtatilgan — avtomatik aloqa qilinmaydi'] });
check('KILL_SWITCH', qongiroqMumkinmi({ ...asos, killSwitch: true }).sabablar,
  ['KILL_SWITCH yoqilgan — avtomatik aloqa to\'xtatilgan']);
check('eskirgan ma\'lumot', qongiroqMumkinmi({ ...asos, eskirganMalumot: true }),
  { mumkin: false, sabablar: ['To\'lov ma\'lumotini CRM\'dan yangilab bo\'lmadi va mavjudi eskirgan'] });
check('bir nechta sabab birga', qongiroqMumkinmi({ ...asos, boglanmaslik: true, killSwitch: true }).sabablar.length, 2);

// ─── QongiroqBrifi ────────────────────────────────────────────────────────
const SHARTNOMA = {
  id: 'ct1', clientId: 'cl1', contractNo: '5582MSO25F3', objectName: 'MUHABBAT SHAHRI',
  virtualStatus: 'sold', monthlyPayment: 8_339_000, debtFirst: 0, debtMonthly: 17_356_000, debtMeter: 0,
  debtTotal: 17_356_000, daysOverdue: 81, missedMonthsExact: 3, nextPaymentDate: new Date('2026-10-25T00:00:00Z'),
};
const QAYTARILGAN = { ...SHARTNOMA, id: 'ct2', contractNo: '1111AAA26X1', virtualStatus: 'for_return', debtMonthly: 5_000_000, debtTotal: 5_000_000 };

function muhit(o: {
  suhbat?: boolean; suhbatHolati?: Record<string, unknown>; interlocutor?: unknown; syncXato?: boolean; syncVaqt?: string; oxirgiVada?: unknown; yuborilmagan?: boolean; telefonTakror?: boolean; vadalar?: unknown[]; qongiroqlar?: unknown[]; qongiroqXato?: boolean; topilmasin?: boolean; shartnomalar?: unknown[];
} = {}) {
  const sinxlar: string[] = [];
  const deps = {
    contracts: {
      findByContractNo: async (no: string) => (o.topilmasin || no !== '5582MSO25F3' ? null : SHARTNOMA),
      findByClientId: async () => o.shartnomalar ?? [SHARTNOMA, QAYTARILGAN],
    },
    clients: {
      findById: async () => ({
        id: 'cl1', fullName: 'Testov Testoy Test o\'g\'li', firstName: 'Testoy',
        phone: '+998901112233', extraPhones: o.telefonTakror ? ['+998901112233', '+998934445566'] : ['+998934445566'], doNotContact: false, notes: 'ichki izoh',
        telegramAccountId: 'acc1',
      }),
    },
    conversations: {
      findByClientId: async () => (o.suhbat === false ? null : {
        id: 'cv1', clientId: 'cl1', telegramAccountId: 'acc1', state: 'negotiating',
        needsHuman: false, humanKind: null, humanReason: null, agentEnabled: true, lastMessageAt: new Date('2026-10-13T08:00:00Z'),
        ...o.suhbatHolati,
      }),
    },
    messages: {
      recentByConversation: async () => [
        { direction: 'out', author: 'agent', body: 'Assalomu alaykum', transcript: null, createdAt: new Date('2026-10-12T05:00:00Z') },
        { direction: 'in', author: 'client', body: '', transcript: 'Juma kuni to\'layman', createdAt: new Date('2026-10-12T06:00:00Z') },
        { direction: 'note', author: 'system', body: 'ichki qayd', transcript: null, createdAt: new Date('2026-10-12T06:01:00Z') },
        ...(o.yuborilmagan ? [
          { direction: 'out', author: 'agent', status: 'failed', body: 'Yuborilmadi', transcript: null, createdAt: new Date('2026-10-12T07:00:00Z') },
          { direction: 'out', author: 'agent', status: 'queued', body: 'Navbatda', transcript: null, createdAt: new Date('2026-10-12T07:01:00Z') },
        ] : []),
      ],
    },
    promises: {
      listOpenByConversation: async () => o.vadalar ?? [],
      findLatestByConversation: async () => o.oxirgiVada ?? null,
    },
    payments: { listRecentPayments: async () => [{ dateIso: '2026-07-20', amount: 7_661_000 }] },
    profiles: { find: async () => ({ summary: 'Juma kunlari to\'laydi', whatWorks: null, bestContactTime: 'kechqurun', interlocutor: o.interlocutor ?? null }) },
    accounts: { findById: async () => ({ id: 'acc1', label: 'Dildora', personaName: 'Madina' }) },
    contractSync: {
      syncOne: async (id: string) => {
        sinxlar.push(id);
        return { outcome: o.syncXato ? 'error' : 'ok' };
      },
      lastSyncedAt: async () => new Date(o.syncVaqt ?? '2026-10-13T22:00:00Z'),
    },
    phoneCalls: {
      listRecentForClient: async () => {
        if (o.qongiroqXato) throw new Error('baza yiqildi');
        return o.qongiroqlar ?? [
        { startedAt: new Date('2026-10-13T06:00:00Z'), agentName: 'Madina', outcome: 'gaplashildi',
          summary: 'Juma to\'laydi', transcript: 'TRANSKRIPT MATNI', promiseDate: '2026-10-17', promiseAmount: 8_339_000 },
        { startedAt: new Date('2026-10-10T06:00:00Z'), agentName: 'Madina', outcome: 'kotarmadi',
          summary: null, transcript: null, promiseDate: null, promiseAmount: null },
        ];
      },
    },
    settings: { get: async () => ({ killSwitch: false, minDebt: 0, personaName: 'Sevara' }) },
    clock: { todayIso: () => '2026-10-14', now: () => new Date('2026-10-14T06:00:00Z') },
  } as unknown as QongiroqBrifiDeps;
  return { brif: new QongiroqBrifi(deps), sinxlar };
}

{
  const { brif, sinxlar } = muhit();
  const j = await brif.tuz(' 5582mso25f3 ');
  check('raqam qirqilib katta harfga keltirildi', j.shartnoma_raqami, '5582MSO25F3');
  check('mijozning hamma shartnomasi CRM\'dan yangilandi', sinxlar, ['ct1', 'ct2']);
  check('eskirgan emas', j.malumot_eskirgan, false);
  check('mijoz ismi', [j.mijoz.ism, j.mijoz.toliq_ism], ['Testoy', 'Testov Testoy Test o\'g\'li']);
  check('telefonlar', j.mijoz.telefonlar, ['+998901112233', '+998934445566']);
  check('shartnomalar soni', j.shartnomalar.length, 2);
  check('shartnoma holati nomi', j.shartnomalar[1]?.holat, 'К возврату');
  check('yozilmaydigan holat belgilandi', [j.shartnomalar[0]?.yoziladi, j.shartnomalar[1]?.yoziladi], [true, false]);
  check('kechikkan summa', j.shartnomalar[0]?.kechikkan, { boshlangich: 0, oylik: 17_356_000, hisoblagich: 0, jami: 17_356_000 });
  check('navbatdagi to\'lov sanasi', j.shartnomalar[0]?.navbatdagi_tolov_sanasi, '2026-10-25');
  check('oxirgi to\'lovlar', j.shartnomalar[0]?.oxirgi_tolovlar, [{ sana: '2026-07-20', summa: 7_661_000 }]);
  check('telegram: agent ismi persona\'dan', j.telegram?.agent_ismi, 'Madina');
  check('telegram: akkaunt', j.telegram?.akkaunt, 'Dildora');
  // Ichki qaydlar (note) ovozli agentga berilmaydi; ovozli xabar matni transkriptdan.
  check('telegram: faqat yozishma, ichki qaydsiz', j.telegram?.xabarlar.map((x) => [x.kim, x.matn]),
    [['agent', 'Assalomu alaykum'], ['mijoz', 'Juma kuni to\'layman']]);
  check('xotira', j.xotira, 'Juma kunlari to\'laydi. Qulay vaqt: kechqurun');
  check('ichki izoh chiqmaydi', JSON.stringify(j).includes('ichki izoh'), false);
  check('qo\'ng\'iroq mumkin', [j.qongiroq_mumkin, j.sabablar], [true, []]);
  check('suhbatdosh yo\'q — null', j.telegram?.suhbatdosh, null);
  check('qo\'ng\'iroqlar', j.qongiroqlar, [
    { sana: '2026-10-13T06:00:00.000Z', agent_ismi: 'Madina', natija: 'gaplashildi', xulosa: 'Juma to\'laydi', vada: { kun: '2026-10-17', summa: 8_339_000 } },
    { sana: '2026-10-10T06:00:00.000Z', agent_ismi: 'Madina', natija: 'kotarmadi', xulosa: null, vada: null },
  ]);
  check('transkript tashqariga chiqmaydi', JSON.stringify(j).includes('TRANSKRIPT'), false);
}

// Review Focus 2: Telegram suhbati yo'q.
{
  const { brif } = muhit({ suhbat: false });
  const j = await brif.tuz('5582MSO25F3');
  check('suhbatsiz — telegram null', j.telegram, null);
  check('suhbatsiz — qolgani to\'liq', j.shartnomalar.length, 2);
}

// Review Focus 3: CRM javob bermadi.
{
  const { brif } = muhit({ syncXato: true });
  const j = await brif.tuz('5582MSO25F3');
  check('CRM yiqildi — eskirgan belgisi', j.malumot_eskirgan, true);
  check('CRM yiqildi — oxirgi yangilanish vaqti', j.yangilangan, '2026-10-13T22:00:00.000Z');
  check('CRM yiqildi, ~8 soatlik — qo\'ng\'iroq mumkin', j.qongiroq_mumkin, true);
}

// Eskirgan ma'lumot (30 soat) qo'ng'iroqni to'xtatadi.
{
  const { brif } = muhit({ syncXato: true, syncVaqt: '2026-10-13T00:00:00Z' });
  const j = await brif.tuz('5582MSO25F3');
  check('30 soatlik eskirgan — mumkin emas', [j.qongiroq_mumkin, j.sabablar],
    [false, ['To\'lov ma\'lumotini CRM\'dan yangilab bo\'lmadi va mavjudi eskirgan']]);
}

// Buzilgan va'da ko'rsatiladi, lekin qo'ng'iroqni to'smaydi.
{
  const { brif } = muhit({
    oxirgiVada: { id: 'p9', promisedDate: new Date('2026-10-20T00:00:00Z'), amount: 5_000_000, status: 'broken', quote: 'Kelasi hafta' },
  });
  const j = await brif.tuz('5582MSO25F3');
  check('buzilgan va\'da ko\'rsatildi', j.telegram?.vadalar, [{ kun: '2026-10-20', summa: 5_000_000, holat: 'broken', mijoz_sozi: 'Kelasi hafta' }]);
  check('buzilgan va\'da qo\'ng\'iroqni to\'smaydi', j.qongiroq_mumkin, true);
}

// Yuborilmagan xabarlar va takroriy telefon.
{
  const { brif } = muhit({ yuborilmagan: true, telefonTakror: true });
  const j = await brif.tuz('5582MSO25F3');
  check('failed/queued xabar chiqmaydi', j.telegram?.xabarlar.map((x) => x.matn), ['Assalomu alaykum', 'Juma kuni to\'layman']);
  check('telefonlar takrorsiz', j.mijoz.telefonlar, ['+998901112233', '+998934445566']);
}

// Review Focus 1: topilmadi.
{
  const { brif } = muhit({ topilmasin: true });
  let xato = '';
  try {
    await brif.tuz('0000XXX00X0');
  } catch (err) {
    xato = err instanceof ShartnomaTopilmadi ? 'ShartnomaTopilmadi' : String(err);
  }
  check('topilmasa — ShartnomaTopilmadi', xato, 'ShartnomaTopilmadi');
}

// Ochiq va'da qo'ng'iroqni kutishga qo'yadi.
{
  const { brif } = muhit({
    vadalar: [{ promisedDate: new Date('2026-10-17T00:00:00Z'), amount: 8_339_000, status: 'pending', quote: 'Juma to\'layman' }],
  });
  const j = await brif.tuz('5582MSO25F3');
  check('ochiq va\'da ko\'rsatildi', j.telegram?.vadalar, [{ kun: '2026-10-17', summa: 8_339_000, holat: 'pending', mijoz_sozi: 'Juma to\'layman' }]);
  check('ochiq va\'da — qo\'ng\'iroq kutadi', j.qongiroq_mumkin, false);
}

// Proxy suhbatdosh (qarindosh yozadi).
{
  const { brif } = muhit({ interlocutor: { name: 'Akmal', gender: 'male', relation: "o'g'li" } });
  const j = await brif.tuz('5582MSO25F3');
  check('suhbatdosh', j.telegram?.suhbatdosh, { qarindoshligi: "o'g'li", ismi: 'Akmal' });
}

// Jim qilingan Telegram suhbati qo'ng'iroqni to'xtatadi.
{
  const SABAB = "Suhbat operator qo'lida yoki to'xtatilgan — avtomatik aloqa qilinmaydi";
  const run = async (suhbatHolati: Record<string, unknown>) => (await muhit({ suhbatHolati }).brif.tuz('5582MSO25F3'));
  const chek = await run({ needsHuman: true, humanKind: 'chek_tekshiruvi' });
  check('chek tekshiruvi — mumkin emas', [chek.qongiroq_mumkin, chek.sabablar], [false, [SABAB]]);
  const vada = await run({ needsHuman: true, humanKind: 'broken_promise' });
  check('buzilgan va\'da needsHuman — hali mumkin', [vada.qongiroq_mumkin, vada.sabablar], [true, []]);
  const yopiq = await run({ state: 'escalated' });
  check('escalated — mumkin emas', [yopiq.qongiroq_mumkin, yopiq.sabablar], [false, [SABAB]]);
  const ochiq = await run({ agentEnabled: false });
  check('agent o\'chirilgan — mumkin emas', [ochiq.qongiroq_mumkin, ochiq.sabablar], [false, [SABAB]]);
}

// Faqat yozilmaydigan shartnomalar.
{
  const { brif } = muhit({ shartnomalar: [QAYTARILGAN] });
  const j = await brif.tuz('5582MSO25F3');
  check('yoziladigan shartnoma yo\'q — mumkin emas', j.sabablar,
    ['Yoziladigan holatdagi (Сотилди, К оплате, Проц. отказ) shartnomasi yo\'q', 'Kechikkan to\'lov yo\'q']);
}

// Faqat qo'ng'iroq qatorida turgan (Telegram'siz) telefon va'dasi ham keyingi qo'ng'iroqni to'xtatadi.
{
  const q = (promiseDate: string | null, promiseId: string | null) => ({
    startedAt: new Date('2026-10-13T06:00:00Z'), agentName: 'Madina', outcome: 'gaplashildi',
    summary: 'x', transcript: null, promiseDate, promiseAmount: null, promiseId,
  });
  const kelajak = await muhit({ suhbat: false, qongiroqlar: [q('2026-10-17', null)] }).brif.tuz('5582MSO25F3');
  check('telefon va\'dasi (suhbatsiz) — mumkin emas', [kelajak.qongiroq_mumkin, kelajak.sabablar],
    [false, ['Ochiq va\'da bor: 17.10.2026 gacha kutiladi']]);
  const otgan = await muhit({ suhbat: false, qongiroqlar: [q('2026-10-10', null)] }).brif.tuz('5582MSO25F3');
  check('o\'tgan telefon va\'dasi — to\'smaydi', otgan.qongiroq_mumkin, true);
  const bogliq = await muhit({ suhbat: false, qongiroqlar: [q('2026-10-17', 'p1')] }).brif.tuz('5582MSO25F3');
  check('promiseId bor — qo\'ng\'iroq qatori o\'zi to\'smaydi', bogliq.qongiroq_mumkin, true);
  const eng = await muhit({
    qongiroqlar: [q('2026-10-20', null)],
    vadalar: [{ promisedDate: new Date('2026-10-16T00:00:00Z'), amount: 1, status: 'pending', quote: null }],
  }).brif.tuz('5582MSO25F3');
  check('eng yaqin kun olinadi', eng.sabablar, ['Ochiq va\'da bor: 16.10.2026 gacha kutiladi']);
  const xato = await muhit({ qongiroqXato: true }).brif.tuz('5582MSO25F3');
  check('qo\'ng\'iroqlar o\'qilmasa brif yiqilmaydi', [xato.qongiroqlar, xato.qongiroq_mumkin], [[], true]);
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
