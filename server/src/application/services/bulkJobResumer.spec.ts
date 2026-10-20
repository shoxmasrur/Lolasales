import {
  BulkJobResumer,
  resumeDecision,
  type ResumableJob,
} from '@/application/services/BulkJobResumer';
import { BulkJobStore } from '@/application/services/BulkJobStore';
import { XotiradagiBulkJobRepo } from '@/application/services/bulkJobFake';
import type { BulkJobRow } from '@/domain/repositories/IBulkJobRepository';

/** Qo'lda ishga tushiriladi: npm run test:bulk-job-resumer --workspace=server */

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

const BUGUN = '2026-10-09';
const ID = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';

// ─── resumeDecision ───────────────────────────────────────────────────────
const q = (p: Partial<Pick<BulkJobRow, 'cleanStop' | 'crashResumes' | 'startedDay'>>, sameDay = true) =>
  resumeDecision({ cleanStop: true, crashResumes: 0, startedDay: BUGUN, ...p }, BUGUN, sameDay);

check('tartibli to\'xtash — davom', q({}), { action: 'resume', crashed: false });
check('avariya, birinchi marta — davom', q({ cleanStop: false }), { action: 'resume', crashed: true });
check('avariya, ikkinchi — davom', q({ cleanStop: false, crashResumes: 1 }), { action: 'resume', crashed: true });
check('avariya, uchinchi — yopiladi', q({ cleanStop: false, crashResumes: 2 }).action, 'close');
check('uchinchi avariya — failed', (q({ cleanStop: false, crashResumes: 2 }) as { status: string }).status, 'failed');
// Deploy hech qachon sanalmaydi: hisoblagich to'la bo'lsa ham tartibli to'xtash davom etadi.
check('tartibli to\'xtash hisoblagichga qaramaydi', q({ cleanStop: true, crashResumes: 2 }).action, 'resume');
check('kechagi vazifa — yopiladi', q({ startedDay: '2026-10-08' }).action, 'close');
check('kechagi vazifa — stopped', (q({ startedDay: '2026-10-08' }) as { status: string }).status, 'stopped');
check('kunga bog\'lanmagan tur kechagisini ham davom ettiradi', q({ startedDay: '2026-10-08' }, false).action, 'resume');

// ─── BulkJobResumer ───────────────────────────────────────────────────────
function muhit(opts: { resumeXatosi?: boolean; sameDayOnly?: boolean } = {}) {
  const repo = new XotiradagiBulkJobRepo();
  const chaqiruvlar: string[] = [];
  const handler: ResumableJob = {
    kind: 'lookup',
    sameDayOnly: opts.sameDayOnly ?? true,
    resume: (row) => {
      chaqiruvlar.push(`resume:${row.id}:${row.resumedCount}`);
      if (opts.resumeXatosi) throw new Error('shakl noto\'g\'ri');
    },
    abandon: (row, status, reason) => {
      chaqiruvlar.push(`abandon:${status}`);
      return { id: row.id, status, error: reason };
    },
  };
  const resumer = new BulkJobResumer(repo, { todayIso: () => BUGUN }, [handler]);
  return { repo, resumer, chaqiruvlar };
}

{
  const m = muhit();
  await m.resumer.run();
  check('running qator yo\'q — hech narsa chaqirilmaydi', m.chaqiruvlar, []);
}

{
  const m = muhit();
  await m.repo.insert({ id: ID, kind: 'lookup', input: {}, snapshot: {}, startedDay: BUGUN });
  await m.repo.markCleanStop();
  await m.resumer.run();
  // `resume` ga berilgan qator — tiklanish qaydidan OLDINGI holat.
  check('tartibli to\'xtashdan keyin resume chaqirildi', m.chaqiruvlar, [`resume:${ID}:0`]);
  check('resumedCount oshdi', m.repo.rows.get(ID)?.resumedCount, 1);
  check('tartibli-to\'xtash belgisi tozalandi', m.repo.rows.get(ID)?.cleanStop, false);
  check('deploy avariya sanalmadi', m.repo.rows.get(ID)?.crashResumes, 0);
  check('qator running bo\'lib qoldi', m.repo.rows.get(ID)?.status, 'running');
}

{
  const m = muhit();
  await m.repo.insert({ id: ID, kind: 'lookup', input: {}, snapshot: {}, startedDay: BUGUN });
  // markCleanStop YO'Q — jarayon o'lgan.
  await m.resumer.run();
  check('avariya sanaldi', m.repo.rows.get(ID)?.crashResumes, 1);
  await m.resumer.run();
  await m.resumer.run();
  check('uchinchi avariyada yopildi', m.repo.rows.get(ID)?.status, 'failed');
  check('uchinchisida resume chaqirilmadi',
    m.chaqiruvlar, [`resume:${ID}:0`, `resume:${ID}:1`, 'abandon:failed']);
}

{
  const m = muhit();
  await m.repo.insert({ id: ID, kind: 'lookup', input: {}, snapshot: {}, startedDay: '2026-10-08' });
  await m.repo.markCleanStop();
  await m.resumer.run();
  check('kechagi vazifa stopped', m.repo.rows.get(ID)?.status, 'stopped');
  check('yopilgan snapshot yozildi',
    (m.repo.rows.get(ID)?.snapshot as { status: string }).status, 'stopped');
}

// Review Focus 4: saqlangan shakl buzuq — server yiqilmaydi, vazifa failed.
{
  const m = muhit({ resumeXatosi: true });
  await m.repo.insert({ id: ID, kind: 'lookup', input: 'buzuq', snapshot: null, startedDay: BUGUN });
  await m.repo.markCleanStop();
  let tashladi = false;
  try {
    await m.resumer.run();
  } catch {
    tashladi = true;
  }
  check('run() xato tashlamaydi', tashladi, false);
  check('buzuq vazifa failed', m.repo.rows.get(ID)?.status, 'failed');
}

// ─── Store bilan: deploy tiklash paytida keldi ────────────────────────────
function storeBilan() {
  const repo = new XotiradagiBulkJobRepo();
  const store = new BulkJobStore(repo, { todayIso: () => BUGUN }, 1);
  const chaqiruvlar: string[] = [];
  const handler: ResumableJob = {
    kind: 'lookup',
    sameDayOnly: true,
    resume: (row) => { chaqiruvlar.push(`resume:${row.id}`); },
    abandon: (row, status, reason) => {
      chaqiruvlar.push(`abandon:${status}`);
      return { id: row.id, status, error: reason };
    },
  };
  const resumer = new BulkJobResumer(repo, { todayIso: () => BUGUN }, [handler], store);
  return { repo, store, resumer, chaqiruvlar };
}

{
  const m = storeBilan();
  await m.repo.insert({ id: ID, kind: 'lookup', input: {}, snapshot: {}, startedDay: BUGUN });
  await m.repo.markCleanStop();
  m.store.beginShutdown();
  await m.resumer.run();
  check('to\'xtash boshlangan — tiklanmaydi', m.chaqiruvlar, []);
  check('to\'xtash boshlangan — belgi saqlandi', m.repo.rows.get(ID)?.cleanStop, true);
}

{
  const m = storeBilan();
  await m.repo.insert({ id: ID, kind: 'lookup', input: {}, snapshot: {}, startedDay: BUGUN });
  await m.repo.markCleanStop();
  // SIGTERM aynan tiklanish qaydi yozilayotganda keldi.
  const asl = m.repo.markResumed.bind(m.repo);
  m.repo.markResumed = async (id, crashed) => {
    m.store.beginShutdown();
    await asl(id, crashed);
  };
  await m.resumer.run();
  await m.store.freeze();
  check('qayddan keyin to\'xtash — resume chaqirilmadi', m.chaqiruvlar, []);
  check('keyingi yuklanish avariya sanamaydi', m.repo.rows.get(ID)?.cleanStop, true);
}

{
  const m = storeBilan();
  await m.repo.insert({ id: ID, kind: 'lookup', input: {}, snapshot: {}, startedDay: '2026-10-08' });
  await m.repo.markCleanStop();
  await m.resumer.run();
  check('store bilan kechagi vazifa yopildi', m.repo.rows.get(ID)?.status, 'stopped');
  // Tiklash tugadi: boshqa turdagi egasiz qator endi yetim.
  await m.repo.insert({ id: ID2, kind: 'start', input: {}, snapshot: {}, startedDay: BUGUN });
  let xato = 'yo\'q';
  try { await m.store.assertFree('start'); } catch { xato = 'bor'; }
  check('run() oxirida tiklashYakunlandi chaqirildi', xato, 'yo\'q');
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
