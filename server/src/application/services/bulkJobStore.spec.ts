import { BulkJobStore } from '@/application/services/BulkJobStore';
import { XotiradagiBulkJobRepo } from '@/application/services/bulkJobFake';
import { ConflictError } from '@/shared/errors';

/** Qo'lda ishga tushiriladi: npm run test:bulk-job-store --workspace=server */

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

const ID = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';
const muhit = () => {
  const repo = new XotiradagiBulkJobRepo();
  const store = new BulkJobStore(repo, { todayIso: () => '2026-10-09' }, 1);
  return { repo, store };
};
const xatomi = async (fn: () => Promise<unknown>): Promise<string> => {
  try {
    await fn();
    return 'xato yo\'q';
  } catch (err) {
    return err instanceof ConflictError ? 'ConflictError' : String(err);
  }
};

// ─── begin / save / finish ────────────────────────────────────────────────
{
  const { repo, store } = muhit();
  await store.begin('lookup', ID, { clientIds: ['a', 'b'] }, { done: 0 });
  check('begin — running qator', repo.rows.get(ID)?.status, 'running');
  check('begin — kun yozildi', repo.rows.get(ID)?.startedDay, '2026-10-09');

  // Kutmasdan ketma-ket: tartib saqlanishi shart.
  void store.save(ID, { done: 1 }, 'a');
  await store.save(ID, { done: 2 }, 'b');
  check('save — tartib bilan', repo.rows.get(ID)?.processedIds, ['a', 'b']);
  check('save — oxirgi holat', repo.rows.get(ID)?.snapshot, { done: 2 });

  await store.save(ID, { done: 2, currentName: 'X' });
  check('processedId siz save ro\'yxatga tegmaydi', repo.rows.get(ID)?.processedIds, ['a', 'b']);

  await store.finish(ID, 'done', { done: 2, status: 'done' });
  check('finish — holat', repo.rows.get(ID)?.status, 'done');
}

// ─── Band tur (Review Focus 1) ────────────────────────────────────────────
{
  const { store } = muhit();
  check('bo\'sh turda assertFree o\'tadi', await xatomi(() => store.assertFree('lookup')), 'xato yo\'q');
  await store.begin('lookup', ID, {}, {});
  check('band turda assertFree', await xatomi(() => store.assertFree('lookup')), 'ConflictError');
  check('band turda begin', await xatomi(() => store.begin('lookup', ID2, {}, {})), 'ConflictError');
  check('boshqa tur band emas', await xatomi(() => store.assertFree('start')), 'xato yo\'q');
}

// ─── Baza xatosi vazifani yiqitmaydi (Review Focus 5) ─────────────────────
{
  const { repo, store } = muhit();
  await store.begin('lookup', ID, {}, {});
  repo.saveXatosi = new Error('baza uzildi');
  check('save rad etmaydi', await xatomi(() => store.save(ID, { done: 1 }, 'a')), 'xato yo\'q');
  await store.save(ID, { done: 2 }, 'b');
  check('keyingi yozuv ishlaydi', repo.rows.get(ID)?.processedIds, ['b']);
}

// ─── To'xtash: "stopped" bazaga yozilmaydi ────────────────────────────────
{
  const { repo, store } = muhit();
  await store.begin('lookup', ID, {}, { done: 0 });
  store.beginShutdown();

  // Ketayotgan mijoz tugadi — bu HALI yoziladi.
  await store.save(ID, { done: 1 }, 'a');
  check('to\'xtash boshlangach ham natija yoziladi', repo.rows.get(ID)?.processedIds, ['a']);

  await store.finish(ID, 'stopped', { done: 1, status: 'stopped' });
  check('"stopped" yozilmadi — qator running', repo.rows.get(ID)?.status, 'running');

  check('to\'xtash paytida yangi vazifa rad etiladi',
    await xatomi(() => store.begin('start', ID2, {}, {})), 'ConflictError');

  await store.freeze();
  check('freeze — tartibli to\'xtash belgisi', repo.rows.get(ID)?.cleanStop, true);

  await store.save(ID, { done: 2 }, 'b');
  check('freeze dan keyingi yozuv tashlanadi', repo.rows.get(ID)?.processedIds, ['a']);

  // Review Focus 6: ikkinchi SIGTERM.
  check('ikkinchi freeze xatosiz', await xatomi(() => store.freeze()), 'xato yo\'q');
}

// ─── To'xtash paytida tabiiy tugagan vazifa yopiladi ──────────────────────
{
  const { repo, store } = muhit();
  await store.begin('lookup', ID, {}, {});
  store.beginShutdown();
  await store.finish(ID, 'done', { status: 'done' });
  check('"done" to\'xtash paytida ham yoziladi', repo.rows.get(ID)?.status, 'done');
  await store.freeze();
  check('yopilgan qator tartibli-to\'xtash belgisini olmaydi', repo.rows.get(ID)?.cleanStop, false);
}

// ─── finish qayta urinadi (nuqson 2) ──────────────────────────────────────
{
  const { repo, store } = muhit();
  await store.begin('lookup', ID, {}, {});
  repo.finishXatolari = 2;
  await store.finish(ID, 'done', { status: 'done' });
  check('ikki xatodan keyin uchinchi urinish yozdi', repo.rows.get(ID)?.status, 'done');
}
{
  const { repo, store } = muhit();
  await store.begin('lookup', ID, {}, {});
  repo.finishXatolari = 5;
  const natija = await xatomi(() => store.finish(ID, 'done', {}));
  check('uch urinish ham yiqildi — rad etmaydi', natija, 'xato yo\'q');
  check('qator running bo\'lib qoldi', repo.rows.get(ID)?.status, 'running');
}

// ─── Yetim qator (nuqson 2) ───────────────────────────────────────────────
{
  const { repo, store } = muhit();
  // Oldingi jarayondan qolgan, xotirada egasi yo'q qator.
  await repo.insert({ id: ID, kind: 'start', input: {}, snapshot: { status: 'running' }, startedDay: '2026-10-09' });
  check('tiklash tugamaguncha yetim ham band', await xatomi(() => store.assertFree('start')), 'ConflictError');
  store.tiklashYakunlandi();
  check('tiklashdan keyin yetim yopiladi', await xatomi(() => store.assertFree('start')), 'xato yo\'q');
  check('yetim failed bo\'ldi', repo.rows.get(ID)?.status, 'failed');
  check('yetim sababi yozildi',
    (repo.rows.get(ID)?.snapshot as { error?: string }).error, 'Vazifa yopilmay qolgan edi — avtomatik yopildi');
}
{
  const { repo, store } = muhit();
  store.tiklashYakunlandi();
  await store.begin('start', ID, {}, {});
  check('shu jarayonda tirik vazifa yetim emas', await xatomi(() => store.assertFree('start')), 'ConflictError');
  check('tirik qator tegilmadi', repo.rows.get(ID)?.status, 'running');
  // Yakuniy yozuv bazaga tushmadi — xotirada vazifa yopilgan, bazada running.
  repo.finishXatolari = 5;
  await store.finish(ID, 'done', {});
  check('yozilmagan finish dan keyin yetim yopiladi', await xatomi(() => store.assertFree('start')), 'xato yo\'q');
  check('qotgan qator failed', repo.rows.get(ID)?.status, 'failed');
}
{
  const { repo, store } = muhit();
  store.tiklashYakunlandi();
  await store.begin('start', ID, {}, {});
  // `finish` navbatda turibdi — assertFree uni kutishi va yetim deb yopmasligi shart.
  void store.finish(ID, 'done', { status: 'done' });
  check('navbatdagi finish kutildi', await xatomi(() => store.assertFree('start')), 'xato yo\'q');
  check('done failed bilan bosilmadi', repo.rows.get(ID)?.status, 'done');
}

// ─── Yetim poygasi: finish `findRunning` kutilayotganda navbatga tushdi ───
{
  const { repo, store } = muhit();
  store.tiklashYakunlandi();
  await store.begin('start', ID, {}, {});
  const asl = repo.findRunning.bind(repo);
  // `findRunning` qatorni `running` deb qaytaradi, lekin shu oraliqda vazifa
  // tugab `finish` ni navbatga qo'yadi (va `faol` dan o'chadi).
  repo.findRunning = async (kind) => {
    const r = await asl(kind);
    repo.findRunning = asl; // bir martalik
    void store.finish(ID, 'done', { status: 'done' });
    return r;
  };
  await xatomi(() => store.assertFree('start'));
  await store.assertFree('lookup'); // navbat tugasin
  check('poyga — done failed bilan bosilmadi', repo.rows.get(ID)?.status, 'done');
  check('poyga — snapshot ham done', (repo.rows.get(ID)?.snapshot as { status?: string }).status, 'done');
}
{
  const { repo, store } = muhit();
  store.tiklashYakunlandi();
  // Oldingi jarayondan qolgan qator — tashqi tekshiruvda yetim ko'rinadi.
  await repo.insert({ id: ID, kind: 'start', input: {}, snapshot: { status: 'running' }, startedDay: '2026-10-09' });
  const aslSave = repo.save.bind(repo);
  repo.save = async (...a) => { await new Promise((r) => setTimeout(r, 30)); await aslSave(...a); };
  const asl = repo.findRunning.bind(repo);
  repo.findRunning = async (kind) => {
    const r = await asl(kind);
    repo.findRunning = asl; // bir martalik
    // Navbat band (sekin save), shu orada vazifa egasini topadi (tiklandi).
    void store.save(ID, { status: 'running' }, null);
    setTimeout(() => { void store.markResumed(ID, 'start', false); }, 5);
    return r;
  };
  await xatomi(() => store.assertFree('start'));
  await new Promise((r) => setTimeout(r, 60));
  await store.assertFree('lookup');
  check('navbatda qayta tekshiruv — egasi topilgan qator yopilmadi', repo.rows.get(ID)?.status, 'running');
}
{
  const { repo } = muhit();
  await repo.insert({ id: ID, kind: 'start', input: {}, snapshot: {}, startedDay: '2026-10-09' });
  await repo.finish(ID, 'done', { status: 'done' });
  await repo.finish(ID, 'failed', { status: 'failed' }, { onlyIfRunning: true });
  check('onlyIfRunning — yopilgan qatorga yozilmaydi', repo.rows.get(ID)?.status, 'done');
}

// ─── Operator to'xtatishi deploy paytida ham yoziladi (nuqson 1) ──────────
{
  const { repo, store } = muhit();
  await store.begin('lookup', ID, {}, {});
  store.beginShutdown();
  await store.finish(ID, 'stopped', { status: 'stopped' });
  check('deploy to\'xtatishi yozilmaydi', repo.rows.get(ID)?.status, 'running');
  await store.finish(ID, 'stopped', { status: 'stopped' }, { yakuniy: true });
  check('yakuniy to\'xtatish yoziladi', repo.rows.get(ID)?.status, 'stopped');
}

// ─── markResumed navbat orqali ────────────────────────────────────────────
{
  const { repo, store } = muhit();
  await repo.insert({ id: ID, kind: 'lookup', input: {}, snapshot: {}, startedDay: '2026-10-09' });
  await repo.markCleanStop();
  await store.markResumed(ID, 'lookup', false);
  check('markResumed yozildi', repo.rows.get(ID)?.resumedCount, 1);
  await store.freeze();
  await store.markResumed(ID, 'lookup', false);
  check('freeze dan keyin markResumed tashlanadi', repo.rows.get(ID)?.resumedCount, 1);
  check('isShuttingDown', store.isShuttingDown(), true);
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
