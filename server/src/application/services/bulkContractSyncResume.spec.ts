import { BulkContractSync, type BulkContractSyncJob } from '@/application/services/BulkContractSync';
import { BulkJobStore } from '@/application/services/BulkJobStore';
import { BulkJobResumer } from '@/application/services/BulkJobResumer';
import { XotiradagiBulkJobRepo } from '@/application/services/bulkJobFake';
import type { ContractSyncService, SyncResult } from '@/application/services/ContractSyncService';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IEventBus } from '@/domain/services/support';

/**
 * Qo'lda ishga tushiriladi: npm run test:bulk-contract-sync-resume --workspace=server
 *
 * Deployni taqlid qiladi: `jarayon()` — bitta server jarayoni. Ikki jarayon
 * faqat soxta "baza" (`XotiradagiBulkJobRepo`) orqali bog'langan. CRM'ga
 * ham, bazaga ham chiqmaydi.
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
const ID = '44444444-4444-4444-8444-444444444444';

/** Mijoz → shartnomalari. c2 da ikkita shartnoma. */
const SHARTNOMALAR: Record<string, string[]> = { c1: ['k1'], c2: ['k2a', 'k2b'], c3: ['k3'] };

interface JarayonOpts {
  /** Shu shartnomada `syncOne` darvoza ochilguncha osilib turadi. */
  darvoza?: { contractId: string; promise: Promise<void> };
  delayMs?: number;
  enabled?: boolean;
  /** Kechasigi to'liq yangilash ketyaptimi (`ContractSyncScheduler.isRunning`). */
  nightlyBusy?: () => boolean;
}

function jarayon(repo: XotiradagiBulkJobRepo, o: JarayonOpts = {}) {
  const calls: Array<{ id: string; vaqt: number }> = [];
  const sync = {
    syncOne: async (contractId: string): Promise<SyncResult> => {
      calls.push({ id: contractId, vaqt: Date.now() });
      if (o.darvoza?.contractId === contractId) await o.darvoza.promise;
      return { outcome: 'ok', contractId, debtTotal: 0, newPhones: ['+998900000000'] };
    },
  } as unknown as ContractSyncService;
  const store = new BulkJobStore(repo, { todayIso: () => BUGUN }, 1);
  const bulk = new BulkContractSync(
    { findById: async (id: string) => ({ id, fullName: `Mijoz ${id}` }) } as unknown as IClientRepository,
    {
      findByClientId: async (clientId: string) =>
        (SHARTNOMALAR[clientId] ?? []).map((id) => ({ id, clientId })),
    } as unknown as IContractRepository,
    sync,
    { publish: () => undefined } as unknown as IEventBus,
    o.delayMs ?? 0,
    o.enabled ?? true,
    store,
    o.nightlyBusy,
  );
  return { bulk, store, calls };
}

async function kut(
  b: BulkContractSync,
  shart: (j: BulkContractSyncJob) => boolean,
  nima: string,
): Promise<BulkContractSyncJob> {
  for (let i = 0; i < 1000; i += 1) {
    const job = b.current();
    if (job && shart(job)) return job;
    await new Promise((r) => setTimeout(r, 2));
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

async function yuklanish(repo: XotiradagiBulkJobRepo, j: ReturnType<typeof jarayon>): Promise<void> {
  await new BulkJobResumer(repo, { todayIso: () => BUGUN }, [j.bulk], j.store).run();
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
  const j = jarayon(repo);
  await j.bulk.start(['c1', 'c2', 'c3'], ID);
  await kut(j.bulk, (x) => x.status !== 'running', 'tugash');
  await j.bulk.idle();
  await navbatniKut(j);
  const qator = repo.rows.get(ID)!;
  check('done yozildi', qator.status, 'done');
  check('hamma mijoz processed', qator.processedIds, ['c1', 'c2', 'c3']);
  check('snapshot shartnomalar', (qator.snapshot as BulkContractSyncJob).contracts, 4);
}

// ─── Deploy shartnomalar orasida (Review Focus 1, 3) ─────────────────────
{
  const repo = new XotiradagiBulkJobRepo();
  const d = darvoza();
  const eski = jarayon(repo, { darvoza: { contractId: 'k2a', promise: d.promise } });
  await eski.bulk.start(['c1', 'c2', 'c3'], ID);
  await kut(eski.bulk, () => eski.calls.some((c) => c.id === 'k2a'), 'k2a osilgan');
  eski.store.beginShutdown();
  eski.bulk.pauseForShutdown();
  d.ochish();
  await eski.bulk.idle();
  await eski.store.freeze();
  const qator = repo.rows.get(ID)!;
  check('deploy — running', qator.status, 'running');
  check('deploy — tartibli to\'xtash', qator.cleanStop, true);
  check('yarim qolgan c2 processed emas', qator.processedIds, ['c1']);
  check('k2b so\'ralmadi', eski.calls.map((c) => c.id), ['k1', 'k2a']);
  check('snapshot: faqat c1 sanalgan', (qator.snapshot as BulkContractSyncJob).done, 1);

  const yangi = jarayon(repo, { delayMs: 60 });
  const boshi = Date.now();
  await yuklanish(repo, yangi);
  const job = await kut(yangi.bulk, (x) => x.status !== 'running', 'tiklangan ish tugashi');
  check('tiklash — c2 to\'liq, keyin c3', yangi.calls.map((c) => c.id), ['k2a', 'k2b', 'k3']);
  check('tiklash — birinchi so\'rov oldidan pauza', (yangi.calls[0]?.vaqt ?? 0) - boshi >= 50, true);
  check('tiklash — done hisoblagichi', job.done, 3);
  check('tiklash — shartnomalar ikki marta sanalmadi', job.contracts, 4);
  check('tiklash — resumedCount', job.resumedCount, 1);
  check('tiklash — done', job.status, 'done');
}

// ─── Operator to'xtatdi, shu zahoti deploy (Review Focus 2) ──────────────
{
  const repo = new XotiradagiBulkJobRepo();
  const d = darvoza();
  const eski = jarayon(repo, { darvoza: { contractId: 'k2a', promise: d.promise } });
  await eski.bulk.start(['c1', 'c2', 'c3'], ID);
  await kut(eski.bulk, () => eski.calls.some((c) => c.id === 'k2a'), 'k2a osilgan');
  eski.bulk.stop();               // operator
  eski.store.beginShutdown();
  eski.bulk.pauseForShutdown();
  d.ochish();
  await eski.bulk.idle();
  await eski.store.freeze();
  check('operator to\'xtatgani bazada', repo.rows.get(ID)?.status, 'stopped');
}

// ─── Sinxronizatsiya o'chiq (Review Focus 4) ─────────────────────────────
{
  const repo = new XotiradagiBulkJobRepo();
  const j = jarayon(repo, { enabled: false });
  const job = await j.bulk.start(['c1'], ID);
  check('o\'chiq — darhol failed', job.status, 'failed');
  check('o\'chiq — bazaga yozilmadi', repo.rows.size, 0);

  await repo.insert({
    id: ID, kind: 'contract_sync', input: { clientIds: ['c1'] }, startedDay: BUGUN,
    snapshot: { id: ID, total: 1, done: 0, contracts: 0, newPhones: 0, notFound: 0, failed: 0, noContract: 0,
      status: 'running', currentName: null, startedAt: '2026-10-14T05:00:00.000Z', finishedAt: null,
      error: null, missing: [], missingTruncated: 0 },
  });
  await repo.markCleanStop();
  await yuklanish(repo, j);
  check('o\'chiq — tiklashda failed', repo.rows.get(ID)?.status, 'failed');
  check('o\'chiq — CRM\'ga so\'rov yo\'q', j.calls.length, 0);
  // Resumer `abandon()` ga umumiy matn beradi — panelda esa aniq sabab.
  const yakuniy = repo.rows.get(ID)?.snapshot as BulkContractSyncJob;
  check('o\'chiq — bazadagi sabab aniq', yakuniy.error?.includes('CONTRACTS_SYNC_ENABLED'), true);
  check('o\'chiq — xotiradagi sabab aniq', j.bulk.current()?.error?.includes('CONTRACTS_SYNC_ENABLED'), true);
  check('o\'chiq — status failed', j.bulk.current()?.status, 'failed');
}

// ─── Kechasigi yangilash ketyapti — tiklangan ish kutadi (F1) ────────────
const tiklanadigan = async (repo: XotiradagiBulkJobRepo): Promise<void> => {
  await repo.insert({
    id: ID, kind: 'contract_sync', input: { clientIds: ['c1', 'c3'] }, startedDay: BUGUN,
    snapshot: { id: ID, total: 2, done: 0, contracts: 0, newPhones: 0, notFound: 0, failed: 0, noContract: 0,
      status: 'running', currentName: null, startedAt: '2026-10-14T05:00:00.000Z', finishedAt: null,
      error: null, missing: [], missingTruncated: 0 },
  });
  await repo.markCleanStop();
};
{
  const repo = new XotiradagiBulkJobRepo();
  await tiklanadigan(repo);
  let kechasi = true;
  const j = jarayon(repo, { nightlyBusy: () => kechasi });
  await yuklanish(repo, j);
  await new Promise((r) => setTimeout(r, 150));
  check('kechasi — so\'rov yo\'q', j.calls.length, 0);
  check('kechasi — ish hali running', j.bulk.current()?.status, 'running');
  kechasi = false;
  const job = await kut(j.bulk, (x) => x.status !== 'running', 'kechasi tugagach tugash');
  check('kechasi tugagach — davom etdi', j.calls.map((c) => c.id), ['k1', 'k3']);
  check('kechasi tugagach — done', job.status, 'done');
}
{
  const repo = new XotiradagiBulkJobRepo();
  await tiklanadigan(repo);
  const j = jarayon(repo, { nightlyBusy: () => true });
  await yuklanish(repo, j);
  await new Promise((r) => setTimeout(r, 50));
  j.bulk.stop();
  const job = await kut(j.bulk, (x) => x.status !== 'running', 'kutishda to\'xtash');
  await j.bulk.idle();
  await navbatniKut(j);
  check('kutishda to\'xtatildi — so\'rov yo\'q', j.calls.length, 0);
  check('kutishda to\'xtatildi — stopped', job.status, 'stopped');
  check('kutishda to\'xtatildi — bazada stopped', repo.rows.get(ID)?.status, 'stopped');
}

// ─── Takroriy mijozlar bir marta (F5) ────────────────────────────────────
{
  const repo = new XotiradagiBulkJobRepo();
  const j = jarayon(repo);
  const boshida = await j.bulk.start(['c1', 'c1', 'c3'], ID);
  check('takror — total 2', boshida.total, 2);
  await kut(j.bulk, (x) => x.status !== 'running', 'takror tugashi');
  await j.bulk.idle();
  await navbatniKut(j);
  check('takror — processed', repo.rows.get(ID)?.processedIds, ['c1', 'c3']);
  check('takror — input', (repo.rows.get(ID)?.input as { clientIds: string[] }).clientIds, ['c1', 'c3']);
  check('takror — CRM bir martadan', j.calls.map((c) => c.id), ['k1', 'k3']);
}

// ─── Band tur (Review Focus 5) ───────────────────────────────────────────
{
  const repo = new XotiradagiBulkJobRepo();
  await repo.insert({ id: 'eski', kind: 'contract_sync', input: {}, snapshot: {}, startedDay: BUGUN });
  const j = jarayon(repo);
  let rad = 'yo\'q';
  try { await j.bulk.start(['c1'], ID); } catch { rad = 'bor'; }
  await new Promise((r) => setTimeout(r, 10));
  check('band turda start rad etildi', rad, 'bor');
  check('xotirada vazifa yo\'q', j.bulk.current(), null);
  check('CRM\'ga so\'rov yo\'q', j.calls.length, 0);
}

// ─── Kechagi vazifa ham davom etadi ──────────────────────────────────────
{
  const repo = new XotiradagiBulkJobRepo();
  await repo.insert({
    id: ID, kind: 'contract_sync', input: { clientIds: ['c1', 'c3'] }, startedDay: '2026-10-13',
    snapshot: { id: ID, total: 2, done: 1, contracts: 1, newPhones: 1, notFound: 0, failed: 0, noContract: 0,
      status: 'running', currentName: null, startedAt: '2026-10-13T05:00:00.000Z', finishedAt: null,
      error: null, missing: [], missingTruncated: 0 },
  });
  await repo.save(ID, repo.rows.get(ID)!.snapshot, 'c1');
  await repo.markCleanStop();
  const j = jarayon(repo);
  await yuklanish(repo, j);
  const job = await kut(j.bulk, (x) => x.status !== 'running', 'tugash');
  check('kechagi — faqat c3', j.calls.map((c) => c.id), ['k3']);
  check('kechagi — done 2', job.done, 2);
}

// ─── Buzuq shakl — failed, server yiqilmaydi ─────────────────────────────
{
  const repo = new XotiradagiBulkJobRepo();
  await repo.insert({ id: ID, kind: 'contract_sync', input: 'buzuq', snapshot: null, startedDay: BUGUN });
  await repo.markCleanStop();
  const j = jarayon(repo);
  await yuklanish(repo, j);
  check('buzuq — failed', repo.rows.get(ID)?.status, 'failed');
  check('buzuq — CRM\'ga so\'rov yo\'q', j.calls.length, 0);
}

// ─── abandon — "davom etdi" qaydi yo'q ───────────────────────────────────
{
  const repo = new XotiradagiBulkJobRepo();
  const j = jarayon(repo);
  const yopilgan = j.bulk.abandon(
    { id: ID, kind: 'contract_sync', status: 'running', input: { clientIds: ['c1'] }, plan: null,
      snapshot: { total: 1, done: 0 }, processedIds: [], cleanStop: false, crashResumes: 2,
      resumedCount: 2, startedDay: BUGUN },
    'failed', 'sabab',
  );
  check('abandon — status', yopilgan.status, 'failed');
  check('abandon — sabab', yopilgan.error, 'sabab');
  check('abandon — resumedCount yo\'q', yopilgan.resumedCount, undefined);
  check('abandon — missing massiv', Array.isArray(yopilgan.missing), true);
  check('sameDayOnly', j.bulk.sameDayOnly, false);
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
