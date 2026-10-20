import { BulkConversationStart, type BulkStartJob } from '@/application/services/BulkConversationStart';
import { BulkJobStore } from '@/application/services/BulkJobStore';
import { BulkJobResumer } from '@/application/services/BulkJobResumer';
import { XotiradagiBulkJobRepo } from '@/application/services/bulkJobFake';
import type { StartConversationUseCase } from '@/application/usecases/messaging/StartConversationUseCase';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { BulkStartPlanner } from '@/application/services/BulkStartPlanner';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { AccountLabels } from '@/application/services/AccountLabels';
import type { IHolidayRepository } from '@/domain/repositories/IHolidayRepository';
import type { IClock, IEventBus } from '@/domain/services/support';
import { AbortedError, TelegramError } from '@/shared/errors';

/**
 * Qo'lda ishga tushiriladi: npm run test:bulk-start-resume --workspace=server
 *
 * Deployni taqlid qiladi: `jarayon()` — bitta server jarayoni. Ikkita
 * jarayon faqat soxta "baza" (`XotiradagiBulkJobRepo`) orqali bog'langan.
 * Telegramga ham, bazaga ham chiqmaydi.
 */
let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

const ID = '33333333-3333-4333-8333-333333333333';
const BUGUN = '2026-10-14';
/**
 * Ish vaqti oynasi uchun QOTIRILGAN soat — BUGUN, Toshkentda 10:00.
 * Haqiqiy soat olinsa test 23:59–24:00 oralig'ida (oyna '00:00'–'23:59')
 * "ish vaqti tugadi" deb yiqilardi. Pauza va `nextAt` esa kod ichida
 * `Date.now()` dan hisoblanadi — ular haqiqiy vaqtda qoladi.
 */
const SOAT = new Date(`${BUGUN}T05:00:00.000Z`);
const BOSH_COUNTS = {
  ready: 0, needs_lookup: 0, name_mismatch: 0, already_started: 0,
  no_phone: 0, do_not_contact: 0, blocked: 0,
};

interface JarayonOpts {
  /** clientId → akkaunt (taqsimot natijasi). */
  egasi: Record<string, string>;
  /** Bog'lanish mumkin, lekin operator chegaralagani uchun taqsimotga kirmagan. */
  qoldirilgan?: string[];
  /** Shu mijozlarda `execute` darvoza ochilguncha (yoki to'xtatilguncha) osilib turadi. */
  darvoza?: { ids: string[]; promise: Promise<void> };
  /** Shu mijozlarda PEER_FLOOD. */
  flood?: string[];
  /**
   * Yetib borgan bo'lishi mumkin bo'lgan chiquvchi xabari bor mijozlar —
   * haqiqiy `StartConversationUseCase` ularni «Suhbat allaqachon boshlangan»
   * deb o'tkazib yuboradi.
   */
  yuborilgan?: Set<string>;
  minDelaySec?: number;
  killSwitch?: boolean;
}

function jarayon(repo: XotiradagiBulkJobRepo, o: JarayonOpts) {
  const chaqiruvlar: Array<{ id: string; vaqt: number; planBormi: boolean }> = [];
  const yuborilgan = o.yuborilgan ?? new Set<string>();
  let planChaqiruvi = 0;
  let biriktirish = 0;
  const darvozaIds = new Set(o.darvoza?.ids ?? []);
  const jobIdRef = { id: ID };

  const startConversation = {
    execute: async (clientId: string, opts?: { signal?: AbortSignal }) => {
      chaqiruvlar.push({ id: clientId, vaqt: Date.now(), planBormi: repo.rows.get(jobIdRef.id)?.plan != null });
      if (darvozaIds.has(clientId)) {
        await new Promise<void>((resolve, reject) => {
          if (opts?.signal?.aborted) { reject(new AbortedError()); return; }
          opts?.signal?.addEventListener('abort', () => reject(new AbortedError()), { once: true });
          void o.darvoza!.promise.then(resolve);
        });
      }
      if (o.flood?.includes(clientId)) throw new TelegramError('Spam cheklovi', 'PEER_FLOOD');
      // Haqiqiy use case kabi: suhbati `new` dan chiqqan YOKI yetib borgan
      // bo'lishi mumkin bo'lgan chiquvchi xabari (`failed`/`draft` dan
      // boshqa holat, `sending` ham) bor mijozga qayta yozmaydi —
      // `StartConversationUseCase` + `hasPossiblyDeliveredOutbound`.
      // `yuborilgan` — shunday xabari bor mijozlar.
      if (yuborilgan.has(clientId)) {
        return { status: 'skipped', reason: 'Suhbat allaqachon boshlangan', conversation: null };
      }
      yuborilgan.add(clientId);
      return { status: 'started' };
    },
  } as unknown as StartConversationUseCase;

  const settings = {
    get: async () => ({
      killSwitch: o.killSwitch ?? false,
      windowStart: '00:00', windowEnd: '23:59', weekdays: [1, 2, 3, 4, 5, 6, 7],
      minDelaySec: o.minDelaySec ?? 0, maxDelaySec: o.minDelaySec ?? 0,
      outreachDailyLimit: 1000, personaName: 'Madina', minDebt: 0,
    }),
  } as unknown as RuntimeSettings;

  const accountIds = [...new Set(Object.values(o.egasi))];
  const qoldirilgan = new Set(o.qoldirilgan ?? []);
  const clients = {
    findById: async (id: string) => ({ id, fullName: `Mijoz ${id}`, telegramAccountId: o.egasi[id] ?? null }),
    previewBulkStart: async (ids: string[]) => ({
      total: ids.length, counts: { ...BOSH_COUNTS, ready: ids.length }, mismatches: [], accountPlan: [], reassigned: 0,
    }),
    assignAccounts: async (a: unknown[]) => { biriktirish += 1; return a.length; },
  } as unknown as IClientRepository;

  const accountRows = accountIds.map((id) => ({
    id, label: `Akkaunt ${id}`, personaName: null, isEnabled: true, status: 'connected',
    floodWaitUntil: null, spamStatus: 'clean', spamUntil: null, counterDate: null,
    sentToday: 0, dailyLimit: 1_000_000, lookupsToday: 0, dailyLookupLimit: 1_000_000,
  }));
  const accounts = {
    listConnected: async () => accountRows,
    list: async () => accountRows,
  } as unknown as ITelegramAccountRepository;

  const planner = {
    plan: async (ids: string[]) => {
      planChaqiruvi += 1;
      const assignments = new Map(ids.filter((id) => o.egasi[id] && !qoldirilgan.has(id)).map((id) => [id, o.egasi[id]!]));
      return {
        assignments, accountPlan: [], reassigned: assignments.size,
        reassignable: new Set(ids.filter((id) => o.egasi[id] || qoldirilgan.has(id))),
      };
    },
  } as unknown as BulkStartPlanner;

  const store = new BulkJobStore(repo, { todayIso: () => BUGUN }, 1);
  const bulk = new BulkConversationStart(
    startConversation, settings, { publish: () => undefined } as unknown as IEventBus,
    { now: () => new Date(SOAT), todayIso: () => BUGUN } as unknown as IClock,
    planner, clients, accounts,
    { findPrimaryForClient: async (id: string) => ({ contractNo: `SH-${id}` }) } as unknown as IContractRepository,
    { labelOf: (id: string | null) => (id ? `Akkaunt ${id}` : null) } as unknown as AccountLabels,
    { list: async () => [] } as unknown as IHolidayRepository,
    store,
  );
  return {
    bulk, store, chaqiruvlar, yuborilgan, accountIds,
    planChaqiruvi: () => planChaqiruvi, biriktirish: () => biriktirish,
  };
}

async function kut(bulk: BulkConversationStart, shart: (j: BulkStartJob) => boolean, nima: string): Promise<BulkStartJob> {
  for (let i = 0; i < 1000; i += 1) {
    const job = bulk.current();
    if (job && shart(job)) return job;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`kutilgan holat kelmadi: ${nima}`);
}

/** `main.ts` dagi to'xtash tartibi. */
async function deploy(j: ReturnType<typeof jarayon>): Promise<void> {
  j.store.beginShutdown();
  j.bulk.pauseForShutdown();
  await j.bulk.idle();
  await j.store.freeze();
}

/** Yangi jarayon: Telegram ulangach tiklash (`main.ts`). */
async function yuklanish(repo: XotiradagiBulkJobRepo, j: ReturnType<typeof jarayon>): Promise<void> {
  await new BulkJobResumer(repo, { todayIso: () => BUGUN }, [j.bulk], j.store).run();
}

const darvoza = () => {
  let ochish!: () => void;
  const promise = new Promise<void>((r) => { ochish = r; });
  return { promise, ochish };
};

const EGASI = { c1: 'a1', c2: 'a1', c3: 'a1', d1: 'a2', d2: 'a2', d3: 'a2' };
const HAMMA = Object.keys(EGASI);

// ─── Taqsimot birinchi xabardan OLDIN saqlanadi ───────────────────────────
{
  const repo = new XotiradagiBulkJobRepo();
  const j = jarayon(repo, { egasi: EGASI });
  await j.bulk.start(HAMMA, ID, { accountIds: ['a1', 'a2'] });
  const job = await kut(j.bulk, (x) => x.status !== 'running', 'tugash');
  await j.bulk.idle();
  await j.store.assertFree('lookup'); // navbatdagi yozuvlar tugasin (assertFree navbatni kutadi)
  check('hammasi boshlandi', job.started, 6);
  check('birinchi xabardan oldin plan bazada', j.chaqiruvlar[0]?.planBormi, true);
  const plan = repo.rows.get(ID)?.plan as { guruhlar: Array<{ accountId: string; clientIds: string[] }> };
  check('plan oqimlari', plan.guruhlar.map((g) => `${g.accountId}:${g.clientIds.join(',')}`).sort(),
    ['a1:c1,c2,c3', 'a2:d1,d2,d3']);
  check('done bazaga yozildi', repo.rows.get(ID)?.status, 'done');
  check('hamma mijoz processed', [...(repo.rows.get(ID)?.processedIds ?? [])].sort(), [...HAMMA].sort());
}

// ─── Deploy: yarim yo'lda — running qoladi, osilgan mijoz processed emas ──
{
  const repo = new XotiradagiBulkJobRepo();
  const d = darvoza();
  const j = jarayon(repo, { egasi: EGASI, darvoza: { ids: ['c2'], promise: d.promise } });
  await j.bulk.start(HAMMA, ID, { accountIds: ['a1', 'a2'] });
  await kut(j.bulk, (x) => x.done >= 4 && j.chaqiruvlar.some((c) => c.id === 'c2'), 'a2 tugadi, c2 osilgan');
  await deploy(j);
  const qator = repo.rows.get(ID)!;
  check('deploy — running', qator.status, 'running');
  check('deploy — tartibli to\'xtash', qator.cleanStop, true);
  check('osilgan c2 processed emas', qator.processedIds.includes('c2'), false);
  check('c1 processed', qator.processedIds.includes('c1'), true);
  check('snapshot hisoblagichi', (qator.snapshot as BulkStartJob).started, qator.processedIds.length);
}

// ─── Operator to'xtatdi, shu zahoti deploy (Review Focus 2) ──────────────
{
  const repo = new XotiradagiBulkJobRepo();
  const d = darvoza();
  const j = jarayon(repo, { egasi: { c1: 'a1', c2: 'a1', c3: 'a1' }, darvoza: { ids: ['c2'], promise: d.promise } });
  await j.bulk.start(['c1', 'c2', 'c3'], ID, { accountIds: ['a1'] });
  await kut(j.bulk, () => j.chaqiruvlar.some((c) => c.id === 'c2'), 'c2 osilgan');
  j.bulk.stop();             // operator
  await deploy(j);
  check('operator to\'xtatgani bazada', repo.rows.get(ID)?.status, 'stopped');
}

// ─── Band tur: yangi vazifa rad etiladi, taqsimot qilinmaydi (Review Focus 3)
{
  const repo = new XotiradagiBulkJobRepo();
  // Oldingi jarayondan tiklanishni kutayotgan qator.
  await repo.insert({ id: 'eski', kind: 'start', input: {}, snapshot: {}, startedDay: BUGUN });
  const j = jarayon(repo, { egasi: EGASI });
  let rad = 'yo\'q';
  try { await j.bulk.start(HAMMA, ID, { accountIds: ['a1', 'a2'] }); } catch { rad = 'bor'; }
  await new Promise((r) => setTimeout(r, 30));
  check('band turda start rad etildi', rad, 'bor');
  check('xotirada vazifa yo\'q', j.bulk.current(), null);
  check('taqsimot chaqirilmadi', j.planChaqiruvi(), 0);
  check('biriktirish chaqirilmadi', j.biriktirish(), 0);
}

// ─── KILL_SWITCH — failed bazaga yoziladi ────────────────────────────────
{
  const repo = new XotiradagiBulkJobRepo();
  const j = jarayon(repo, { egasi: EGASI, killSwitch: true });
  await j.bulk.start(HAMMA, ID, { accountIds: ['a1', 'a2'] });
  await kut(j.bulk, (x) => x.status !== 'running', 'tugash');
  await j.bulk.idle();
  await j.store.assertFree('lookup'); // navbatdagi yozuvlar tugasin
  check('kill switch failed yozildi', repo.rows.get(ID)?.status, 'failed');
}

// ─── Deploy → tiklash: faqat qolganlar, taqsimot qayta qilinmaydi ─────────
// Review Focus 1: osilgan c2 ga xabar aslida ketgan bo'lsa ham qayta yozilmaydi.
{
  const repo = new XotiradagiBulkJobRepo();
  const d = darvoza();
  const yuborilgan = new Set<string>();
  const eski = jarayon(repo, { egasi: EGASI, darvoza: { ids: ['c2'], promise: d.promise }, yuborilgan });
  await eski.bulk.start(HAMMA, ID, { accountIds: ['a1', 'a2'] });
  await kut(eski.bulk, (x) => x.done >= 4 && eski.chaqiruvlar.some((c) => c.id === 'c2'), 'c2 osilgan');
  yuborilgan.add('c2'); // xabar ketdi, lekin processed ga yozilmadi
  await deploy(eski);

  const yangi = jarayon(repo, { egasi: EGASI, yuborilgan });
  await yuklanish(repo, yangi);
  const job = await kut(yangi.bulk, (x) => x.status !== 'running', 'tiklangan ish tugashi');
  check('tiklash — taqsimot chaqirilmadi', yangi.planChaqiruvi(), 0);
  check('tiklash — biriktirish chaqirilmadi', yangi.biriktirish(), 0);
  check('tiklash — faqat qolganlar', yangi.chaqiruvlar.map((c) => c.id).sort(), ['c2', 'c3']);
  check('tiklash — done', job.status, 'done');
  check('tiklash — hisoblagich to\'ldi', job.done, 6);
  check('c2 ikkinchi marta boshlanmadi', job.started, 5);
  check('tiklash — resumedCount', job.resumedCount, 1);
  await yangi.bulk.idle();
  await yangi.store.assertFree('lookup'); // navbatdagi yozuvlar tugasin
  check('bazada done', repo.rows.get(ID)?.status, 'done');
}

// ─── Cheklovga tushgan oqim qayta ochilmaydi ─────────────────────────────
{
  const repo = new XotiradagiBulkJobRepo();
  const d = darvoza();
  const eski = jarayon(repo, { egasi: EGASI, flood: ['c1'], darvoza: { ids: ['d2'], promise: d.promise } });
  await eski.bulk.start(HAMMA, ID, { accountIds: ['a1', 'a2'] });
  await kut(eski.bulk, (x) => x.accounts.some((a) => a.accountId === 'a1' && a.status === 'flood')
    && eski.chaqiruvlar.some((c) => c.id === 'd2'), 'a1 flood, d2 osilgan');
  await deploy(eski);

  const yangi = jarayon(repo, { egasi: EGASI });
  await yuklanish(repo, yangi);
  const job = await kut(yangi.bulk, (x) => x.status !== 'running', 'tugash');
  check('flood oqimiga yozilmadi', yangi.chaqiruvlar.map((c) => c.id).sort(), ['d2', 'd3']);
  check('a1 qatori flood bo\'lib qoldi', job.accounts.find((a) => a.accountId === 'a1')?.status, 'flood');
}

// ─── Saqlangan nextAt kelajakda — birinchi xabar kutadi ──────────────────
{
  const repo = new XotiradagiBulkJobRepo();
  const j0 = jarayon(repo, { egasi: { c1: 'a1', c2: 'a1' } });
  await j0.bulk.start(['c1', 'c2'], ID, { accountIds: ['a1'] });
  await kut(j0.bulk, (x) => x.status !== 'running', 'birinchi ish');
  // Qo'lda "deploy oldidan" holat: c1 tugagan, a1 ning keyingi xabari 300 ms dan keyin.
  const qator = repo.rows.get(ID)!;
  const snap = qator.snapshot as BulkStartJob;
  repo.rows.set(ID, {
    ...qator,
    status: 'running',
    processedIds: ['c1'],
    cleanStop: true,
    snapshot: {
      ...snap, status: 'running', done: 1, started: 1, finishedAt: null,
      accounts: snap.accounts.map((a) => ({ ...a, status: 'running', done: 1, started: 1,
        nextAt: new Date(Date.now() + 300).toISOString() })),
    },
  });
  const yangi = jarayon(repo, { egasi: { c1: 'a1', c2: 'a1' }, yuborilgan: new Set(['c1']) });
  const boshi = Date.now();
  await yuklanish(repo, yangi);
  await kut(yangi.bulk, (x) => x.status !== 'running', 'tugash');
  const birinchi = yangi.chaqiruvlar[0];
  check('kelajakdagi nextAt kutildi', (birinchi?.vaqt ?? 0) - boshi >= 250, true);
  check('faqat c2', yangi.chaqiruvlar.map((c) => c.id), ['c2']);
}

// ─── Pauza ichida deploy: rejadagi nextAt bazada, tiklangan oqim kutadi ───
// minDelaySec = maxDelaySec = 1 → mijozlar orasidagi pauza aniq 1000 ms.
{
  const repo = new XotiradagiBulkJobRepo();
  const egasi = { c1: 'a1', c2: 'a1' };
  const yuborilgan = new Set<string>();
  const eski = jarayon(repo, { egasi, minDelaySec: 1, yuborilgan });
  await eski.bulk.start(['c1', 'c2'], ID, { accountIds: ['a1'] });
  await kut(eski.bulk, (x) => x.accounts[0]?.nextAt != null && eski.chaqiruvlar.length === 1, 'c1 dan keyingi pauza');
  await new Promise((r) => setTimeout(r, 150)); // pauzaning ~150 ms i o'tdi
  await deploy(eski);
  const deployVaqti = Date.now();
  const snap = repo.rows.get(ID)!.snapshot as BulkStartJob;
  const saqlangan = snap.accounts[0]?.nextAt;
  check('pauza — bazadagi nextAt kelajakda',
    saqlangan != null && new Date(saqlangan).getTime() > deployVaqti, true);
  check('pauza — c2 ga yozilmadi', eski.chaqiruvlar.map((c) => c.id), ['c1']);

  const yangi = jarayon(repo, { egasi, minDelaySec: 1, yuborilgan });
  const boshi = Date.now();
  await yuklanish(repo, yangi);
  await kut(yangi.bulk, (x) => x.status !== 'running', 'tugash');
  const kutildi = (yangi.chaqiruvlar[0]?.vaqt ?? 0) - boshi;
  // Qolgan ~850 ms kutilishi kerak; tasodifiy siljish (0..1000) emas.
  check('pauza — tiklangan birinchi xabar qolgan vaqtni kutdi (≥ 600 ms)', kutildi >= 600, true);
  check('pauza — faqat c2', yangi.chaqiruvlar.map((c) => c.id), ['c2']);
}

// ─── Tiklashda eski (o'tib ketgan) nextAt panelda qolmaydi ───────────────
{
  const repo = new XotiradagiBulkJobRepo();
  const j0 = jarayon(repo, { egasi: { c1: 'a1', c2: 'a1' } });
  await j0.bulk.start(['c1', 'c2'], ID, { accountIds: ['a1'] });
  await kut(j0.bulk, (x) => x.status !== 'running', 'birinchi ish');
  const ESKI = new Date(Date.now() - 60_000).toISOString();
  const qator = repo.rows.get(ID)!;
  const snap = qator.snapshot as BulkStartJob;
  repo.rows.set(ID, {
    ...qator, status: 'running', processedIds: ['c1'], cleanStop: true,
    snapshot: {
      ...snap, status: 'running', done: 1, started: 1, finishedAt: null, nextAt: ESKI,
      accounts: snap.accounts.map((a) => ({ ...a, status: 'running', done: 1, started: 1, nextAt: ESKI })),
    },
  });
  const d = darvoza();
  const yangi = jarayon(repo, { egasi: { c1: 'a1', c2: 'a1' }, yuborilgan: new Set(['c1']), minDelaySec: 1,
    darvoza: { ids: ['c2'], promise: d.promise } });
  const boshi = Date.now();
  await yuklanish(repo, yangi);
  check('eski nextAt — tiklash zahoti ish darajasida yo\'q', yangi.bulk.current()?.nextAt !== ESKI, true);
  await kut(yangi.bulk, () => yangi.chaqiruvlar.length === 1, 'c2 osilgan');
  const job = yangi.bulk.current()!;
  const yangiMi = (v: string | null | undefined) => v != null && new Date(v).getTime() >= boshi;
  check('eski nextAt — qatorda yangi rejadagi vaqt', yangiMi(job.accounts[0]?.nextAt), true);
  check('eski nextAt — ish darajasida yangi vaqt', yangiMi(job.nextAt), true);
  await yangi.store.assertFree('lookup'); // navbatdagi yozuvlar tugasin
  const bazada = (repo.rows.get(ID)!.snapshot as BulkStartJob).accounts[0]?.nextAt;
  check('eski nextAt — bazada ham yangi vaqt', yangiMi(bazada), true);
  d.ochish();
  await kut(yangi.bulk, (x) => x.status !== 'running', 'tugash');
}

// ─── Operator chegarasi tiklashda ham ishlaydi ───────────────────────────
{
  const repo = new XotiradagiBulkJobRepo();
  const d = darvoza();
  const egasi = { c1: 'a1', c2: 'a1', c3: 'a1' };
  // x1, x2 — bog'lanish mumkin, lekin taqsimotga kirmagan; qoldiq oqimida.
  const eski = jarayon(repo, { egasi, qoldirilgan: ['x1', 'x2'], darvoza: { ids: ['c2'], promise: d.promise } });
  await eski.bulk.start(['c1', 'c2', 'c3', 'x1', 'x2'], ID, { accountIds: ['a1'] });
  await kut(eski.bulk, () => eski.chaqiruvlar.some((c) => c.id === 'c2'), 'c2 osilgan');
  await deploy(eski);

  const yangi = jarayon(repo, { egasi, qoldirilgan: ['x1', 'x2'] });
  await yuklanish(repo, yangi);
  const job = await kut(yangi.bulk, (x) => x.status !== 'running', 'tugash');
  check('chegaradan tashqaridagilarga execute yo\'q',
    yangi.chaqiruvlar.some((c) => c.id === 'x1' || c.id === 'x2'), false);
  check('hisoblagich to\'ldi', job.done, 5);
}

// ─── Deploy oxirgi mijozdan keyin, done yozilishidan oldin (Review Focus 5)
{
  const repo = new XotiradagiBulkJobRepo();
  const j0 = jarayon(repo, { egasi: { c1: 'a1' } });
  await j0.bulk.start(['c1'], ID, { accountIds: ['a1'] });
  await kut(j0.bulk, (x) => x.status !== 'running', 'tugash');
  const qator = repo.rows.get(ID)!;
  const snap = qator.snapshot as BulkStartJob;
  repo.rows.set(ID, { ...qator, status: 'running', cleanStop: true,
    snapshot: { ...snap, status: 'running', finishedAt: null,
      accounts: snap.accounts.map((a) => ({ ...a, status: 'running' })) } });
  const yangi = jarayon(repo, { egasi: { c1: 'a1' } });
  await yuklanish(repo, yangi);
  const job = await kut(yangi.bulk, (x) => x.status !== 'running', 'tugash');
  check('hech kimga yozilmadi', yangi.chaqiruvlar.length, 0);
  check('darhol done', job.status, 'done');
}

// ─── Plan saqlanmagan — odatdagi yo'l (Review Focus 6) ───────────────────
{
  const repo = new XotiradagiBulkJobRepo();
  await repo.insert({
    id: ID, kind: 'start', startedDay: BUGUN,
    input: { clientIds: ['c1', 'c2'], options: { accountIds: ['a1'] } },
    snapshot: { id: ID, total: 2, done: 0, started: 0, skipped: 0, failed: 0, status: 'running',
      accounts: [], skipReasons: {}, skippedItems: [], skippedItemsTruncated: 0,
      allowNameMismatch: false, startedAt: new Date().toISOString(), finishedAt: null,
      currentName: null, nextAt: null, paceMinutes: null, error: null },
  });
  await repo.markCleanStop();
  const yangi = jarayon(repo, { egasi: { c1: 'a1', c2: 'a1' } });
  await yuklanish(repo, yangi);
  const job = await kut(yangi.bulk, (x) => x.status !== 'running', 'tugash');
  check('plan yo\'q — taqsimot qilindi', yangi.planChaqiruvi(), 1);
  check('plan yo\'q — ikkalasi boshlandi', job.started, 2);
  check('plan yo\'q — resumedCount saqlandi', job.resumedCount, 1);
}

// ─── Plan saqlanmagan, lekin ishlangan mijoz bor (savePlan bazaga tushmagan)
{
  const repo = new XotiradagiBulkJobRepo();
  await repo.insert({
    id: ID, kind: 'start', startedDay: BUGUN,
    input: { clientIds: ['c1', 'c2', 'c3'], options: { accountIds: ['a1'] } },
    snapshot: { id: ID, total: 3, done: 1, started: 1, skipped: 0, failed: 0, status: 'running',
      accounts: [{ accountId: 'a1', label: 'Akkaunt a1', personaName: 'Madina', total: 3, done: 1, started: 1,
        skipped: 0, failed: 0, nextAt: null, paceMinutes: null, status: 'running', error: null }],
      skipReasons: {}, skippedItems: [], skippedItemsTruncated: 0,
      allowNameMismatch: false, startedAt: new Date().toISOString(), finishedAt: null,
      currentName: null, nextAt: null, paceMinutes: null, error: null },
  });
  await repo.save(ID, repo.rows.get(ID)!.snapshot, 'c1');
  await repo.markCleanStop();
  // `yuborilgan` ATAYLAB bo'sh: c1 ga qayta borilsa u "started" bo'lib qolardi.
  const yangi = jarayon(repo, { egasi: { c1: 'a1', c2: 'a1', c3: 'a1' } });
  await yuklanish(repo, yangi);
  const job = await kut(yangi.bulk, (x) => x.status !== 'running', 'tugash');
  check('plan yo\'q + ishlangan — c1 ga qayta borilmadi', yangi.chaqiruvlar.map((c) => c.id), ['c2', 'c3']);
  check('plan yo\'q + ishlangan — total asl ro\'yxat', job.total, 3);
  check('plan yo\'q + ishlangan — done orqaga ketmadi va to\'ldi', job.done, 3);
  check('plan yo\'q + ishlangan — started', job.started, 3);
  check('plan yo\'q + ishlangan — akkaunt qatori', [job.accounts[0]?.total, job.accounts[0]?.done], [3, 3]);
}
{
  const repo = new XotiradagiBulkJobRepo();
  await repo.insert({
    id: ID, kind: 'start', startedDay: BUGUN,
    input: { clientIds: ['c1'], options: { accountIds: ['a1'] } },
    snapshot: { id: ID, total: 1, done: 1, started: 1, skipped: 0, failed: 0, status: 'running',
      accounts: [{ accountId: 'a1', label: 'Akkaunt a1', personaName: 'Madina', total: 1, done: 1, started: 1,
        skipped: 0, failed: 0, nextAt: null, paceMinutes: null, status: 'running', error: null }],
      skipReasons: {}, skippedItems: [], skippedItemsTruncated: 0,
      allowNameMismatch: false, startedAt: new Date().toISOString(), finishedAt: null,
      currentName: null, nextAt: null, paceMinutes: null, error: null },
  });
  await repo.save(ID, repo.rows.get(ID)!.snapshot, 'c1');
  await repo.markCleanStop();
  const yangi = jarayon(repo, { egasi: { c1: 'a1' } });
  await yuklanish(repo, yangi);
  const job = await kut(yangi.bulk, (x) => x.status !== 'running', 'tugash');
  check('plan yo\'q + hammasi ishlangan — hech kimga yozilmadi', yangi.chaqiruvlar.length, 0);
  check('plan yo\'q + hammasi ishlangan — taqsimot qilinmadi', yangi.planChaqiruvi(), 0);
  check('plan yo\'q + hammasi ishlangan — done', [job.status, job.accounts[0]?.status], ['done', 'done']);
}

// ─── Buzuq shakl — failed, server yiqilmaydi ─────────────────────────────
{
  const repo = new XotiradagiBulkJobRepo();
  await repo.insert({ id: ID, kind: 'start', input: 'buzuq', snapshot: null, startedDay: BUGUN });
  await repo.markCleanStop();
  const yangi = jarayon(repo, { egasi: {} });
  await yuklanish(repo, yangi);
  check('buzuq shakl — failed', repo.rows.get(ID)?.status, 'failed');
}

// ─── Kechagi vazifa — davom ettirilmaydi, "davom etdi" qaydi yo'q ─────────
{
  const repo = new XotiradagiBulkJobRepo();
  await repo.insert({
    id: ID, kind: 'start', startedDay: '2026-10-13',
    input: { clientIds: ['c1'], options: {} },
    snapshot: { total: 1, done: 0, accounts: [{ accountId: 'a1', label: 'A', personaName: 'M', total: 1,
      done: 0, started: 0, skipped: 0, failed: 0, nextAt: null, paceMinutes: null, status: 'running', error: null }] },
  });
  await repo.markCleanStop();
  const yangi = jarayon(repo, { egasi: { c1: 'a1' } });
  await yuklanish(repo, yangi);
  const job = yangi.bulk.current();
  check('kechagi — stopped', repo.rows.get(ID)?.status, 'stopped');
  check('kechagi — xabar yo\'q', yangi.chaqiruvlar.length, 0);
  check('kechagi — resumedCount yo\'q', job?.resumedCount, undefined);
  check('kechagi — qator stopped', job?.accounts[0]?.status, 'stopped');
  check('sameDayOnly', yangi.bulk.sameDayOnly, true);
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
