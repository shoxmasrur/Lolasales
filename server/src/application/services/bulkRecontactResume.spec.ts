import { BulkRecontact, type BulkRecontactTiming, type RecontactJob } from '@/application/services/BulkRecontact';
import { BulkJobStore } from '@/application/services/BulkJobStore';
import { BulkJobResumer } from '@/application/services/BulkJobResumer';
import { XotiradagiBulkJobRepo } from '@/application/services/bulkJobFake';
import type { InstructAgentInput, InstructAgentUseCase } from '@/application/usecases/messaging/InstructAgentUseCase';
import type { AgentTurnResult } from '@/application/services/AgentRunner';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { IRecontactRepository, RecontactItem } from '@/domain/repositories/IRecontactRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IHolidayRepository } from '@/domain/repositories/IHolidayRepository';
import type { IClock, IEventBus } from '@/domain/services/support';

/**
 * Qo'lda ishga tushiriladi: npm run test:bulk-recontact-resume --workspace=server
 *
 * Deployni taqlid qiladi: `jarayon()` — bitta server jarayoni. Ikki jarayon
 * faqat soxta "baza" (`XotiradagiBulkJobRepo`) va `yuborilgan` to'plami
 * (Telegramdagi haqiqat) orqali bog'langan. Bazaga ham, Telegramga ham
 * chiqmaydi.
 */
let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

const BUGUN = '2026-10-14';
/** 10:00 Toshkent — ish vaqti ichida. */
const HOZIR = new Date('2026-10-14T05:00:00Z');
const PAUZA_MS = 60_000;
const SENT: AgentTurnResult = { sent: true, reply: 'matn', escalated: false, promiseRecorded: false };

const item = (conversationId: string): RecontactItem => ({
  conversationId,
  clientId: `cl-${conversationId}`,
  clientName: `Mijoz ${conversationId}`,
  kind: 'javobsiz',
  overdue: 500_000,
  silentWorkDays: 4,
  lastMessageAt: HOZIR.toISOString(),
  lastMessageDirection: 'out',
  lastMessagePreview: 'salom',
  lastPromise: null,
});

interface JarayonOpts {
  /**
   * Telegramda haqiqatan yozilgan suhbatlar. Haqiqiy ro'yxat so'rovi shu
   * kuni agent yozgan suhbatni chiqarib tashlaydi (oxirgi xabar bugun) —
   * soxta `findOne` shuni takrorlaydi.
   */
  yuborilgan: Set<string>;
  /** Shu suhbatlarda agent darvoza ochilguncha osilib turadi (signal qabul qilmaydi). */
  darvoza?: { ids: string[]; promise: Promise<void> };
  /** `true` — mijozlar orasidagi pauza to'xtatilguncha osilib turadi (deploy pauzaga tushsin). */
  pauzaUshlansin?: boolean;
  /** `findOne` ichida chaqiriladi — Stop/deploy aynan shu oraliqqa tushishini taqlid qiladi. */
  findOneHook?: (id: string) => void;
}

function jarayon(repo: XotiradagiBulkJobRepo, o: JarayonOpts) {
  const agentCalls: string[] = [];
  const sleeps: number[] = [];
  /** Har pauza boshlanganda shu jarayonda nechta agent chaqiruvi bo'lgani. */
  const sleepAtCalls: number[] = [];
  const darvozaIds = new Set(o.darvoza?.ids ?? []);

  const agent = {
    execute: async (i: InstructAgentInput) => {
      agentCalls.push(i.conversationId);
      if (darvozaIds.has(i.conversationId)) await o.darvoza!.promise;
      o.yuborilgan.add(i.conversationId);
      return SENT;
    },
  } as unknown as InstructAgentUseCase;

  const recontactList = {
    findOne: async (id: string) => {
      o.findOneHook?.(id);
      return o.yuborilgan.has(id) ? null : item(id);
    },
  } as unknown as IRecontactRepository;

  const settings = {
    get: async () => ({
      minDelaySec: 60, maxDelaySec: 180, windowStart: '09:00', windowEnd: '18:00',
      weekdays: [1, 2, 3, 4, 5, 6, 7], killSwitch: false, silenceNudgeMax: 2, minDebt: 100_000,
    }),
  } as unknown as RuntimeSettings;

  const timing: BulkRecontactTiming = {
    sleep: async (ms, signal) => {
      sleeps.push(ms);
      sleepAtCalls.push(agentCalls.length);
      if (!o.pauzaUshlansin || ms !== PAUZA_MS) return;
      await new Promise<void>((resolve) => {
        if (signal?.aborted) { resolve(); return; }
        signal?.addEventListener('abort', () => resolve(), { once: true });
      });
    },
    random: (min) => min,
    windowPollMs: 1000,
  };

  const store = new BulkJobStore(repo, { todayIso: () => BUGUN }, 1);
  const service = new BulkRecontact(
    agent, recontactList, settings, { list: async () => [] } as unknown as IHolidayRepository,
    { publish: () => undefined } as unknown as IEventBus,
    { now: () => HOZIR, todayIso: () => BUGUN } as unknown as IClock,
    { findById: async (id: string) => ({ id, clientId: `cl-${id}` }) } as unknown as IConversationRepository,
    { findById: async (id: string) => ({ id, fullName: `Bazadan ${id}` }) } as unknown as IClientRepository,
    { sukutdami: async () => false },
    timing,
    store,
  );
  return { service, store, agentCalls, sleeps, sleepAtCalls };
}

const input = (ids: string[]) => ({
  conversationIds: ids, instruction: 'To\'lov haqida so\'ra', userId: 'u1', userEmail: 'op@x.uz',
});

async function kut(s: BulkRecontact, shart: (j: RecontactJob) => boolean, nima: string): Promise<RecontactJob> {
  for (let i = 0; i < 1000; i += 1) {
    const job = s.current();
    if (job && shart(job)) return job;
    await new Promise((r) => setTimeout(r, 2));
  }
  throw new Error(`kutilgan holat kelmadi: ${nima}`);
}

/** `main.ts` dagi to'xtash tartibi. */
async function deploy(j: ReturnType<typeof jarayon>): Promise<void> {
  j.store.beginShutdown();
  j.service.pauseForShutdown();
  await j.service.idle();
  await j.store.freeze();
}

async function yuklanish(repo: XotiradagiBulkJobRepo, j: ReturnType<typeof jarayon>): Promise<void> {
  await new BulkJobResumer(repo, { todayIso: () => BUGUN }, [j.service], j.store).run();
}

const darvoza = () => {
  let ochish!: () => void;
  const promise = new Promise<void>((r) => { ochish = r; });
  return { promise, ochish };
};

/** Store navbatidagi yozuvlar tugasin (`assertFree` navbatni kutadi). */
const navbatniKut = (j: ReturnType<typeof jarayon>) => j.store.assertFree('lookup');

// ─── Oddiy ish bazaga yoziladi ───────────────────────────────────────────
{
  const repo = new XotiradagiBulkJobRepo();
  const j = jarayon(repo, { yuborilgan: new Set() });
  const job = await j.service.start(input(['a', 'b', 'a', 'c']));
  await kut(j.service, (x) => x.status !== 'running', 'tugash');
  await j.service.idle();
  await navbatniKut(j);
  const qator = repo.rows.get(job.id)!;
  check('done yozildi', qator.status, 'done');
  check('hamma suhbat processed', qator.processedIds, ['a', 'b', 'c']);
  check('input takrorsiz saqlandi', (qator.input as { conversationIds: string[] }).conversationIds, ['a', 'b', 'c']);
  check('snapshot hisoblagichi', (qator.snapshot as RecontactJob).sent, 3);
}

// ─── Deploy pauzada → tiklash faqat qolganlar, birinchi xabar oldidan pauza
{
  const repo = new XotiradagiBulkJobRepo();
  const yuborilgan = new Set<string>();
  const eski = jarayon(repo, { yuborilgan, pauzaUshlansin: true });
  const job = await eski.service.start(input(['a', 'b', 'c']));
  await kut(eski.service, (x) => x.sent === 1, 'a yuborildi');
  await new Promise((r) => setTimeout(r, 10)); // pauzaga kirsin
  await deploy(eski);
  const qator = repo.rows.get(job.id)!;
  check('deploy — running', qator.status, 'running');
  check('deploy — tartibli to\'xtash', qator.cleanStop, true);
  check('deploy — faqat a processed', qator.processedIds, ['a']);

  const yangi = jarayon(repo, { yuborilgan });
  await yuklanish(repo, yangi);
  const tiklangan = await kut(yangi.service, (x) => x.status !== 'running', 'tiklangan ish tugashi');
  check('tiklash — faqat qolganlarga agent', yangi.agentCalls, ['b', 'c']);
  // Faqat `sleeps[0]` yetmaydi: b dan keyingi pauza ham PAUZA_MS. Birinchi
  // pauza agent chaqiruvidan OLDIN bo'lishi shart.
  check('tiklash — pauzalar soni (b, c)', yangi.sleeps, [PAUZA_MS, PAUZA_MS]);
  check('tiklash — birinchi pauza birinchi xabardan OLDIN', yangi.sleepAtCalls[0], 0);
  check('tiklash — hisoblagich davom etdi', tiklangan.sent, 3);
  check('tiklash — natijalar saqlandi', tiklangan.results.map((r) => r.conversationId), ['a', 'b', 'c']);
  check('tiklash — resumedCount', tiklangan.resumedCount, 1);
  check('tiklash — done', tiklangan.status, 'done');
}

// ─── Deploy agent yozayotganda, 45 s ichida tugamadi (Review Focus 1) ─────
{
  const repo = new XotiradagiBulkJobRepo();
  const yuborilgan = new Set<string>();
  const d = darvoza();
  const eski = jarayon(repo, { yuborilgan, darvoza: { ids: ['b'], promise: d.promise } });
  const job = await eski.service.start(input(['a', 'b', 'c']));
  await kut(eski.service, () => eski.agentCalls.includes('b'), 'b yozilyapti');
  // `idle()` chegarasi o'tdi: muzlatish agent tugashidan OLDIN.
  eski.store.beginShutdown();
  eski.service.pauseForShutdown();
  await eski.store.freeze();
  d.ochish();
  await eski.service.idle();
  check('b xabari ketdi, lekin processed ga yozilmadi', repo.rows.get(job.id)?.processedIds, ['a']);

  const yangi = jarayon(repo, { yuborilgan });
  await yuklanish(repo, yangi);
  const tiklangan = await kut(yangi.service, (x) => x.status !== 'running', 'tugash');
  check('b ga agent qayta chaqirilmadi', yangi.agentCalls, ['c']);
  const b = tiklangan.results.find((r) => r.conversationId === 'b');
  check('b — o\'tkazib yuborildi', b?.outcome, 'skipped');
  check('b sababi — neytral (o\'zimiz yozgan bo\'lishi mumkin)', b?.reason?.includes('server yangilanishi'), true);
}

// ─── Tiklashda faqat birinchi suhbat neytral sabab oladi (F3) ─────────────
{
  const repo = new XotiradagiBulkJobRepo();
  const yuborilgan = new Set<string>(['b', 'c']); // ikkalasi ham ro'yxatdan chiqib ketgan
  await repo.insert({
    id: 'f3', kind: 'recontact', startedDay: BUGUN, input: input(['a', 'b', 'c']),
    snapshot: {
      id: 'f3', status: 'running', total: 3, sent: 1, skipped: 0, failed: 0, current: null,
      results: [{ conversationId: 'a', clientName: 'Mijoz a', outcome: 'sent' }],
      startedAt: HOZIR.toISOString(), finishedAt: null, startedBy: 'op@x.uz', stopReason: null,
    },
  });
  await repo.save('f3', repo.rows.get('f3')!.snapshot, 'a');
  await repo.markCleanStop();
  const yangi = jarayon(repo, { yuborilgan });
  await yuklanish(repo, yangi);
  const t = await kut(yangi.service, (x) => x.status !== 'running', 'tugash');
  check('F3 — b neytral sabab', t.results.find((r) => r.conversationId === 'b')?.reason?.includes('server yangilanishi'), true);
  check('F3 — c eski sabab', t.results.find((r) => r.conversationId === 'c')?.reason?.includes('endi mos kelmaydi'), true);
}

// ─── Deploy findOne paytida keldi — agent chaqirilmaydi (F2) ──────────────
{
  const repo = new XotiradagiBulkJobRepo();
  const yuborilgan = new Set<string>();
  let eskiJ!: ReturnType<typeof jarayon>;
  const eski = jarayon(repo, {
    yuborilgan,
    findOneHook: (id) => {
      if (id !== 'b') return;
      eskiJ.store.beginShutdown();
      eskiJ.service.pauseForShutdown();
    },
  });
  eskiJ = eski;
  const job = await eski.service.start(input(['a', 'b', 'c']));
  await eski.service.idle();
  await eski.store.freeze();
  check('F2 — b ga agent chaqirilmadi', eski.agentCalls, ['a']);
  check('F2 — b processed emas', repo.rows.get(job.id)?.processedIds, ['a']);
  check('F2 — qator running', repo.rows.get(job.id)?.status, 'running');

  const yangi = jarayon(repo, { yuborilgan });
  await yuklanish(repo, yangi);
  const t = await kut(yangi.service, (x) => x.status !== 'running', 'tugash');
  check('F2 — tiklashda b va c', yangi.agentCalls, ['b', 'c']);
  check('F2 — sent 3', t.sent, 3);
}

// ─── Operator Stop findOne paytida keldi — natija yozilmaydi (F2) ─────────
{
  const repo = new XotiradagiBulkJobRepo();
  let j!: ReturnType<typeof jarayon>;
  j = jarayon(repo, { yuborilgan: new Set(), findOneHook: (id) => { if (id === 'b') void j.service.stop(); } });
  const job = await j.service.start(input(['a', 'b', 'c']));
  await j.service.idle();
  await j.store.freeze();
  check('F2 stop — b ga agent yo\'q', j.agentCalls, ['a']);
  check('F2 stop — natijalar faqat a', j.service.current()?.results.map((r) => r.conversationId), ['a']);
  check('F2 stop — bazada stopped', repo.rows.get(job.id)?.status, 'stopped');
}

// ─── Resume: snapshot'da hisoblagichlar yo'q (F4) ─────────────────────────
{
  const repo = new XotiradagiBulkJobRepo();
  await repo.insert({
    id: 'f4', kind: 'recontact', startedDay: BUGUN, input: input(['p']),
    snapshot: { total: 1, results: [] },
  });
  await repo.markCleanStop();
  const yangi = jarayon(repo, { yuborilgan: new Set() });
  await yuklanish(repo, yangi);
  const t = await kut(yangi.service, (x) => x.status !== 'running', 'tugash');
  check('F4 — sent raqam', t.sent, 1);
  check('F4 — skipped/failed raqam', [t.skipped, t.failed], [0, 0]);
  check('F4 — startedBy', t.startedBy, 'Noma\'lum');
}

// ─── Deploy agent yozayotganda, vaqtida tugadi — natija yoziladi ──────────
{
  const repo = new XotiradagiBulkJobRepo();
  const yuborilgan = new Set<string>();
  const d = darvoza();
  const eski = jarayon(repo, { yuborilgan, darvoza: { ids: ['b'], promise: d.promise } });
  const job = await eski.service.start(input(['a', 'b', 'c']));
  await kut(eski.service, () => eski.agentCalls.includes('b'), 'b yozilyapti');
  eski.store.beginShutdown();
  eski.service.pauseForShutdown();
  d.ochish();
  await eski.service.idle();
  await eski.store.freeze();
  check('vaqtida tugagan b processed', repo.rows.get(job.id)?.processedIds, ['a', 'b']);
  check('c ga yozilmadi', eski.agentCalls, ['a', 'b']);
}

// ─── Operator to'xtatdi, shu zahoti deploy (Review Focus 2) ──────────────
{
  const repo = new XotiradagiBulkJobRepo();
  const d = darvoza();
  const eski = jarayon(repo, { yuborilgan: new Set(), darvoza: { ids: ['b'], promise: d.promise } });
  const job = await eski.service.start(input(['a', 'b', 'c']));
  await kut(eski.service, () => eski.agentCalls.includes('b'), 'b yozilyapti');
  void eski.service.stop();       // operator
  eski.store.beginShutdown();
  eski.service.pauseForShutdown();
  d.ochish();
  await eski.service.idle();
  await eski.store.freeze();
  check('operator to\'xtatgani bazada', repo.rows.get(job.id)?.status, 'stopped');
}

// ─── Kechagi vazifa ham davom etadi (Review Focus 3) ─────────────────────
{
  const repo = new XotiradagiBulkJobRepo();
  await repo.insert({
    id: 'kecha', kind: 'recontact', startedDay: '2026-10-13',
    input: input(['x', 'y']),
    snapshot: {
      id: 'kecha', status: 'running', total: 2, sent: 1, skipped: 0, failed: 0, current: null,
      results: [{ conversationId: 'x', clientName: 'Mijoz x', outcome: 'sent' }],
      startedAt: '2026-10-13T12:00:00.000Z', finishedAt: null, startedBy: 'op@x.uz', stopReason: null,
    },
  });
  await repo.save('kecha', repo.rows.get('kecha')!.snapshot, 'x');
  await repo.markCleanStop();
  const yangi = jarayon(repo, { yuborilgan: new Set(['x']) });
  await yuklanish(repo, yangi);
  const job = await kut(yangi.service, (x) => x.status !== 'running', 'tugash');
  check('kechagi — davom etdi', yangi.agentCalls, ['y']);
  check('kechagi — sent 2', job.sent, 2);
}

// ─── Band tur: yangi ish rad etiladi (Review Focus 4) ────────────────────
{
  const repo = new XotiradagiBulkJobRepo();
  await repo.insert({ id: 'eski', kind: 'recontact', input: {}, snapshot: {}, startedDay: BUGUN });
  const j = jarayon(repo, { yuborilgan: new Set() });
  let rad = 'yo\'q';
  try { await j.service.start(input(['a'])); } catch { rad = 'bor'; }
  await new Promise((r) => setTimeout(r, 10));
  check('band turda start rad etildi', rad, 'bor');
  check('xotirada vazifa yo\'q', j.service.current(), null);
  check('agent chaqirilmadi', j.agentCalls, []);
}

// ─── Buzuq shakl — failed, server yiqilmaydi ─────────────────────────────
{
  const repo = new XotiradagiBulkJobRepo();
  await repo.insert({ id: 'buzuq', kind: 'recontact', input: 'buzuq', snapshot: null, startedDay: BUGUN });
  await repo.markCleanStop();
  const yangi = jarayon(repo, { yuborilgan: new Set() });
  await yuklanish(repo, yangi);
  check('buzuq — failed', repo.rows.get('buzuq')?.status, 'failed');
  check('buzuq — agent chaqirilmadi', yangi.agentCalls, []);
}

// ─── abandon — "davom etdi" qaydi yo'q ───────────────────────────────────
{
  const repo = new XotiradagiBulkJobRepo();
  const j = jarayon(repo, { yuborilgan: new Set() });
  const yopilgan = j.service.abandon(
    { id: 'z', kind: 'recontact', status: 'running', input: input(['p']), plan: null,
      snapshot: { total: 1, sent: 0, skipped: 0, failed: 0, results: [], startedBy: 'op@x.uz' },
      processedIds: [], cleanStop: false, crashResumes: 2, resumedCount: 2, startedDay: BUGUN },
    'failed', 'sabab',
  );
  check('abandon — stopped', yopilgan.status, 'stopped');
  check('abandon — sabab', yopilgan.stopReason, 'sabab');
  check('abandon — resumedCount yo\'q', yopilgan.resumedCount, undefined);
  check('sameDayOnly', j.service.sameDayOnly, false);
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
