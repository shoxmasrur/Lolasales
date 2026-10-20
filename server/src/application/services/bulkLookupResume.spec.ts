import { BulkJobStore } from '@/application/services/BulkJobStore';
import { XotiradagiBulkJobRepo } from '@/application/services/bulkJobFake';
import {
  BulkTelegramLookup,
  type BulkLookupJob,
} from '@/application/services/BulkTelegramLookup';
import type { ClientTelegramResolver } from '@/application/services/ClientTelegramResolver';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IEventBus } from '@/domain/services/support';

/**
 * Qo'lda ishga tushiriladi: npm run test:bulk-lookup-resume --workspace=server
 *
 * Deployni taqlid qiladi: birinchi `BulkTelegramLookup` — eski jarayon,
 * ikkinchisi — yangi jarayon. Ular faqat "baza" (soxta repozitoriy)
 * orqali bog'langan.
 */
let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

const ID = '11111111-1111-4111-8111-111111111111';

function jarayon(repo: XotiradagiBulkJobRepo, delayMs: number, opts: { yoq?: string[]; darvoza?: Promise<void> } = {}) {
  const qidirilgan: string[] = [];
  const qidiruvVaqtlari: number[] = [];
  const clients = {
    findById: async (id: string) => (opts.yoq?.includes(id) ? null : { id, fullName: `Mijoz ${id}` }),
  } as unknown as IClientRepository;
  const resolver = {
    resolve: async (c: { id: string }) => {
      qidirilgan.push(c.id);
      qidiruvVaqtlari.push(Date.now());
      if (opts.darvoza && c.id === 'c2') await opts.darvoza;
      return { kind: 'ok' };
    },
  } as unknown as ClientTelegramResolver;
  const store = new BulkJobStore(repo, { todayIso: () => '2026-10-09' }, 1);
  const lookup = new BulkTelegramLookup(
    clients, resolver, { publish: () => undefined } as unknown as IEventBus, delayMs, store,
  );
  return { lookup, store, qidirilgan, qidiruvVaqtlari };
}

async function kut(lookup: BulkTelegramLookup, shart: (j: BulkLookupJob) => boolean, nima: string): Promise<BulkLookupJob> {
  for (let i = 0; i < 500; i += 1) {
    const job = lookup.current();
    if (job && shart(job)) return job;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`kutilgan holat kelmadi: ${nima}`);
}

/** `main.ts` dagi to'xtash tartibi. */
async function deploy(j: ReturnType<typeof jarayon>): Promise<void> {
  j.store.beginShutdown();
  j.lookup.pauseForShutdown();
  await j.lookup.idle();
  await j.store.freeze();
}

// ─── Deploy: qolgan mijozlardan davom etadi ───────────────────────────────
{
  const repo = new XotiradagiBulkJobRepo();
  const eski = jarayon(repo, 60_000);
  await eski.lookup.start(['c1', 'c2', 'c3'], ID);
  await kut(eski.lookup, (j) => j.done === 1, 'birinchi mijoz');
  await deploy(eski);

  const qator = repo.rows.get(ID)!;
  check('bazada running bo\'lib qoldi', qator.status, 'running');
  check('tartibli to\'xtash belgisi', qator.cleanStop, true);
  check('ishlangan mijoz yozildi', qator.processedIds, ['c1']);
  check('saqlangan holatda hisoblagich', (qator.snapshot as BulkLookupJob).done, 1);

  const yangi = jarayon(repo, 20);
  const tiklandi = Date.now();
  yangi.lookup.resume((await repo.findRunning('lookup'))!);
  check('tiklangach darhol running', yangi.lookup.current()?.status, 'running');
  check('hisoblagich noldan emas', yangi.lookup.current()?.done, 1);
  check('resumedCount ko\'rinadi', yangi.lookup.current()?.resumedCount, 1);

  const job = await kut(yangi.lookup, (j) => j.status !== 'running', 'tugash');
  check('tugadi', job.status, 'done');
  check('faqat qolganlar qidirildi', yangi.qidirilgan, ['c2', 'c3']);
  check('jami hisoblagich', [job.total, job.done, job.found], [3, 3, 3]);
  check('vazifa id\'si o\'zgarmadi', job.id, ID);
  // Birinchi qidiruv oldidan ham pauza: deploy navbatdan tashqari so'rov chiqarmasin.
  check('tiklangach birinchi qidiruv oldidan pauza', (yangi.qidiruvVaqtlari[0] ?? 0) - tiklandi >= 15, true);
  await yangi.lookup.idle();
  check('bazada done', repo.rows.get(ID)?.status, 'done');
  check('bazada hammasi ishlangan', repo.rows.get(ID)?.processedIds, ['c1', 'c2', 'c3']);
}

// ─── Operator to'xtatgani YAKUNIY ─────────────────────────────────────────
{
  const repo = new XotiradagiBulkJobRepo();
  const j = jarayon(repo, 60_000);
  await j.lookup.start(['c1', 'c2'], ID);
  await kut(j.lookup, (x) => x.done === 1, 'birinchi mijoz');
  j.lookup.stop();
  await j.lookup.idle();
  check('operator to\'xtatdi — bazada stopped', repo.rows.get(ID)?.status, 'stopped');
  check('tiklanadigan vazifa yo\'q', await repo.findRunning('lookup'), null);
}

// ─── Review Focus 2: hamma ishlangan, lekin "done" yozilmagan ─────────────
{
  const repo = new XotiradagiBulkJobRepo();
  await repo.insert({
    id: ID, kind: 'lookup', input: { clientIds: ['c1', 'c2'] }, startedDay: '2026-10-09',
    snapshot: {
      id: ID, total: 2, done: 2, found: 2, needsReview: 0, notFound: 0, failed: 0,
      status: 'running', currentName: null, startedAt: '2026-10-09T05:00:00.000Z', finishedAt: null, error: null,
    },
  });
  await repo.save(ID, repo.rows.get(ID)!.snapshot, 'c1');
  await repo.save(ID, repo.rows.get(ID)!.snapshot, 'c2');
  const j = jarayon(repo, 60_000);
  j.lookup.resume((await repo.findRunning('lookup'))!);
  const job = await kut(j.lookup, (x) => x.status !== 'running', 'darhol tugash');
  check('qoldiq yo\'q — darhol done', job.status, 'done');
  check('hech kim qayta qidirilmadi', j.qidirilgan, []);
}

// ─── Review Focus 3: mijoz orada o'chirilgan ──────────────────────────────
{
  const repo = new XotiradagiBulkJobRepo();
  const eski = jarayon(repo, 60_000);
  await eski.lookup.start(['c1', 'c2', 'c3'], ID);
  await kut(eski.lookup, (j) => j.done === 1, 'birinchi mijoz');
  await deploy(eski);

  const yangi = jarayon(repo, 1, { yoq: ['c2'] });
  yangi.lookup.resume((await repo.findRunning('lookup'))!);
  const job = await kut(yangi.lookup, (j) => j.status !== 'running', 'tugash');
  check('o\'chirilgan mijoz xato sanaldi, vazifa tugadi', [job.status, job.done, job.failed, job.found], ['done', 3, 1, 2]);
}

// ─── Review Focus 1: band turda start rad etiladi ─────────────────────────
{
  const repo = new XotiradagiBulkJobRepo();
  await repo.insert({ id: ID, kind: 'lookup', input: { clientIds: [] }, snapshot: {}, startedDay: '2026-10-09' });
  const j = jarayon(repo, 1);
  let xato = '';
  try {
    await j.lookup.start(['x1'], '22222222-2222-4222-8222-222222222222');
  } catch (err) {
    xato = err instanceof Error ? err.constructor.name : String(err);
  }
  check('bazada running turganda start rad etiladi', xato, 'ConflictError');
  check('xotirada vazifa paydo bo\'lmadi', j.lookup.current(), null);
  check('hech kim qidirilmadi', j.qidirilgan, []);
}

// ─── Buzuq saqlangan shakl: resume xato tashlaydi ─────────────────────────
{
  const repo = new XotiradagiBulkJobRepo();
  await repo.insert({ id: ID, kind: 'lookup', input: 'buzuq', snapshot: null, startedDay: '2026-10-09' });
  const j = jarayon(repo, 1);
  let tashladi = false;
  try {
    j.lookup.resume((await repo.findRunning('lookup'))!);
  } catch {
    tashladi = true;
  }
  check('buzuq shaklda resume xato tashlaydi', tashladi, true);
  const yopilgan = j.lookup.abandon((await repo.findRunning('lookup'))!, 'failed', 'sabab');
  check('abandon buzuq shaklda ham ishlaydi', [yopilgan.status, yopilgan.error], ['failed', 'sabab']);
  check('abandon dan keyin current() shu vazifa', j.lookup.current()?.status, 'failed');
}

// ─── Operator to'xtatdi, shu zahoti deploy keldi (nuqson 1) ──────────────
{
  const repo = new XotiradagiBulkJobRepo();
  let ochish!: () => void;
  const darvoza = new Promise<void>((r) => { ochish = r; });
  const eski = jarayon(repo, 1, { darvoza });
  await eski.lookup.start(['c1', 'c2', 'c3'], ID);
  await kut(eski.lookup, (j) => j.done === 1 && eski.qidirilgan.includes('c2'), 'c2 qidirilyapti');
  eski.lookup.stop();                 // operator
  eski.store.beginShutdown();          // SIGTERM — tsikl hali bayroqni o'qimagan
  eski.lookup.pauseForShutdown();
  ochish();
  await eski.lookup.idle();
  await eski.store.freeze();
  check('operator to\'xtatgani bazada qoldi', repo.rows.get(ID)?.status, 'stopped');
}

// ─── Yopilgan vazifada "davom etdi" qaydi yo'q ───────────────────────────
{
  const repo = new XotiradagiBulkJobRepo();
  const j = jarayon(repo, 1);
  const yopilgan = j.lookup.abandon(
    { id: ID, kind: 'lookup', status: 'running', input: { clientIds: [] }, plan: null,
      snapshot: { total: 3, done: 1 }, processedIds: [], cleanStop: true, crashResumes: 0,
      resumedCount: 2, startedDay: '2026-10-08' },
    'stopped', 'sabab',
  );
  check('abandon resumedCount bermaydi', yopilgan.resumedCount, undefined);
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
