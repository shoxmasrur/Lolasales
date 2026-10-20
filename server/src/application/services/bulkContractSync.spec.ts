import {
  BulkContractSync,
  type BulkContractSyncJob,
} from '@/application/services/BulkContractSync';
import type { ContractSyncService, SyncResult } from '@/application/services/ContractSyncService';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IEventBus } from '@/domain/services/support';

/**
 * Qo'lda ishga tushiriladi: npm run test:bulk-contract-sync --workspace=server
 *
 * CRM'ga ham, bazaga ham chiqmaydi — hamma port soxta.
 *
 * NEGA KERAK: import qilingan mijozlarda raqam yo'q va operator ularni
 * belgilab bir amalda yangilaydi. Bu vazifa xato sanasa yoki kimnidir
 * jimgina o'tkazib yuborsa, operator "yangiladim" deb o'ylab, aslida
 * raqamsiz mijozga xabar yuborishga urinadi.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

const ok = (contractId: string, newPhones: string[] = []): SyncResult => ({
  outcome: 'ok',
  contractId,
  debtTotal: 0,
  newPhones,
});

interface BuildOptions {
  /** clientId → shartnoma id'lari. */
  readonly contracts: Record<string, string[]>;
  /** contractId → `syncOne` qaytaradigan natija (standart: `ok`). */
  readonly outcomes?: Record<string, SyncResult>;
  readonly delayMs?: number;
  readonly enabled?: boolean;
}

function build(options: BuildOptions): { bulk: BulkContractSync; calls: string[] } {
  const calls: string[] = [];

  const clients = {
    findById: async (id: string) => ({ id, fullName: `Mijoz ${id}` }),
  } as unknown as IClientRepository;

  const contracts = {
    findByClientId: async (clientId: string) =>
      (options.contracts[clientId] ?? []).map((id) => ({ id, clientId })),
  } as unknown as IContractRepository;

  const sync = {
    syncOne: async (contractId: string): Promise<SyncResult> => {
      calls.push(contractId);
      return options.outcomes?.[contractId] ?? ok(contractId);
    },
  } as unknown as ContractSyncService;

  const bulk = new BulkContractSync(
    clients,
    contracts,
    sync,
    { publish: () => undefined } as unknown as IEventBus,
    options.delayMs ?? 0,
    options.enabled ?? true,
  );

  return { bulk, calls };
}

/** Ish fonda ketadi — kutilgan holat kelguncha kuzatamiz. */
async function kut(
  bulk: BulkContractSync,
  shart: (job: BulkContractSyncJob) => boolean,
  nima: string,
): Promise<BulkContractSyncJob> {
  for (let i = 0; i < 500; i += 1) {
    const job = bulk.current();
    if (job && shart(job)) return job;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`kutilgan holat kelmadi: ${nima}`);
}

const tugadi = (job: BulkContractSyncJob): boolean => job.status !== 'running';

// ─── Mijozning HAMMA shartnomasi yangilanadi ─────────────────────────────
// Bir mijozda ikkita shartnoma bo'lishi odatiy hol; faqat birinchisi
// yangilansa ikkinchi uydagi kechikish ko'rinmay qolardi.
{
  const { bulk, calls } = build({ contracts: { c1: ['s1', 's2'] } });
  bulk.start(['c1'], 'j1');
  const job = await kut(bulk, tugadi, 'vazifa tugashi');

  check('holat "done"', job.status === 'done', job.status);
  check('bitta mijoz sanaldi', job.done === 1, String(job.done));
  check('ikkala shartnoma yangilandi', job.contracts === 2, String(job.contracts));
  check('ikkala shartnoma so\'raldi', calls.join(',') === 's1,s2', calls.join(','));
  check('diqqat ro\'yxati bo\'sh', job.missing.length === 0, String(job.missing.length));
}

// ─── Yangi raqamlar hamma shartnoma bo'yicha yig'iladi ───────────────────
{
  const { bulk } = build({
    contracts: { c1: ['s1', 's2'] },
    outcomes: { s1: ok('s1', ['+998901112233']), s2: ok('s2', ['+998907778899', '+998905554433']) },
  });
  bulk.start(['c1'], 'j2');
  const job = await kut(bulk, tugadi, 'vazifa tugashi');

  check('uchta yangi raqam sanaldi', job.newPhones === 3, String(job.newPhones));
}

// ─── Shartnomasiz mijoz jimgina o'tkazib yuborilmaydi ────────────────────
// Bunday mijozni CRM'dan topib bo'lmaydi — operator buni ko'rishi kerak.
{
  const { bulk, calls } = build({ contracts: { c1: [] } });
  bulk.start(['c1'], 'j3');
  const job = await kut(bulk, tugadi, 'vazifa tugashi');

  check('shartnomasiz sanoqqa tushdi', job.noContract === 1, String(job.noContract));
  check('CRM\'ga so\'rov ketmadi', calls.length === 0, String(calls.length));
  check(
    'diqqat ro\'yxatida sababi bilan turibdi',
    job.missing.length === 1 && job.missing[0]?.reason === 'no_contract',
    JSON.stringify(job.missing),
  );
  check('ismi yozildi', job.missing[0]?.name === 'Mijoz c1', String(job.missing[0]?.name));
}

// ─── Sahifa ochilgandan tugma bosilgunicha o'chirilgan mijoz ─────────────
// `findById` `null` qaytarsa ismi yo'q — shunda ham diqqat ro'yxatiga
// yozilishi kerak, aks holda panelda ismsiz "Xato: 1" chiqib, operator
// kimni tekshirishni bilmay qolardi.
{
  const clients = {
    findById: async () => null,
  } as unknown as IClientRepository;
  const contracts = {
    findByClientId: async () => [],
  } as unknown as IContractRepository;
  const sync = { syncOne: async () => ok('s0') } as unknown as ContractSyncService;
  const bulk = new BulkContractSync(
    clients,
    contracts,
    sync,
    { publish: () => undefined } as unknown as IEventBus,
    0,
    true,
  );
  bulk.start(['ghost-1'], 'j3b');
  const job = await kut(bulk, tugadi, 'vazifa tugashi');

  check('xato: 1', job.failed === 1, String(job.failed));
  check(
    'diqqat ro\'yxatida id bilan yozildi',
    job.missing.length === 1 && job.missing[0]?.name === 'ghost-1',
    JSON.stringify(job.missing),
  );
}

// ─── `not_found` va `error` mos sanoqlarga tushadi ───────────────────────
{
  const { bulk } = build({
    contracts: { c1: ['s1'], c2: ['s2'], c3: ['s3'] },
    outcomes: {
      s1: { outcome: 'not_found', contractId: 's1', debtTotal: 0, newPhones: [] },
      s2: { outcome: 'error', contractId: 's2', debtTotal: 0, newPhones: [], error: 'timeout' },
    },
  });
  bulk.start(['c1', 'c2', 'c3'], 'j4');
  const job = await kut(bulk, tugadi, 'vazifa tugashi');

  check('topilmadi: 1', job.notFound === 1, String(job.notFound));
  check('xato: 1', job.failed === 1, String(job.failed));
  check('yangilangan shartnoma: 1', job.contracts === 1, String(job.contracts));
  check('uchala mijoz sanaldi', job.done === 3, String(job.done));
  check('diqqat ro\'yxatida ikkitasi', job.missing.length === 2, String(job.missing.length));
}

// ─── Aralash natijada xato ustun turadi ──────────────────────────────────
// `not_found` aniq javob (bunday shartnoma yo'q), `error` esa qayta
// urinish kerakligini bildiradi. Mijoz ikkala sanoqqa tushib qolsa
// jami sanoq tanlanganlar sonidan oshib ketardi.
{
  const { bulk } = build({
    contracts: { c1: ['s1', 's2'] },
    outcomes: {
      s1: { outcome: 'not_found', contractId: 's1', debtTotal: 0, newPhones: [] },
      s2: { outcome: 'error', contractId: 's2', debtTotal: 0, newPhones: [], error: 'timeout' },
    },
  });
  bulk.start(['c1'], 'j5');
  const job = await kut(bulk, tugadi, 'vazifa tugashi');

  check('mijoz "xato" ga tushdi', job.failed === 1, String(job.failed));
  check('"topilmadi" ga tushmadi', job.notFound === 0, String(job.notFound));
  check('bir marta sanaldi', job.missing.length === 1, String(job.missing.length));
  check('sababi "error"', job.missing[0]?.reason === 'error', String(job.missing[0]?.reason));
}

// ─── To'xtatish qolganlarni boshlamaydi ──────────────────────────────────
// Pauza 60 soniya: `stop()` faqat bayroq qo'yса, vazifa shuncha vaqt
// "ketyapti" bo'lib turardi.
{
  const { bulk, calls } = build({
    contracts: { c1: ['s1'], c2: ['s2'], c3: ['s3'] },
    delayMs: 60_000,
  });
  bulk.start(['c1', 'c2', 'c3'], 'j6');
  await kut(bulk, (j) => j.done === 1, 'birinchi mijoz tugashi');

  const boshlandi = Date.now();
  bulk.stop();
  const job = await kut(bulk, tugadi, 'to\'xtash');
  const ketganVaqt = Date.now() - boshlandi;

  check('holat "stopped"', job.status === 'stopped', job.status);
  check('pauza kutilmadi', ketganVaqt < 1000, `${ketganVaqt} ms`);
  check('qolganlarga so\'rov ketmadi', calls.length === 1, calls.join(','));
  check('tugash vaqti yozildi', job.finishedAt !== null, String(job.finishedAt));
  // `done` halol bo'lishi kerak: c2 va c3 hech qachon ishlanmadi, ular
  // sanoqqa tushib qolsa operator "yangiladim" deb o'ylab qolar edi.
  check('done soni halol (faqat c1)', job.done === 1, String(job.done));
}

// ─── Bitta mijozning ikki shartnomasi orasida to'xtatish ─────────────────
// `stop()` ikkinchi shartnomaga o'tishdan OLDIN, birinchisi tugagandan
// KEYIN kelsa — bu mijozni "done" deb sanash xato: ikkinchi shartnomasi
// (demak, undagi raqamlar) yangilanmay qoldi. Operator "qolganini"
// qayta belgilasa, bu mijoz jimgina o'tkazib yuboriladi.
{
  const { bulk, calls } = build({
    contracts: { c1: ['s1', 's2'] },
    delayMs: 60_000,
  });
  bulk.start(['c1'], 'j6b');
  // Birinchi shartnoma darhol so'raladi (pauzasiz), ikkinchisidan oldin
  // 60 soniyalik pauzaga to'xtaymiz — shu yerda to'xtatamiz.
  await kut(bulk, () => calls.length === 1, 'birinchi shartnoma so\'ralishi');

  bulk.stop();
  const job = await kut(bulk, tugadi, 'to\'xtash');

  check('holat "stopped"', job.status === 'stopped', job.status);
  check('mijoz "done"ga tushmadi', job.done === 0, String(job.done));
  check('ikkinchi shartnomaga so\'rov ketmadi', calls.length === 1, calls.join(','));
}

// ─── Oxirgi mijozni ishlayotganda to'xtatish ─────────────────────────────
// Tsikl tabiiy ravishda ro'yxat oxiriga yetganda ham, agar shu payt
// `cancelled` ko'tarilgan bo'lsa, holat "done" emas "stopped" bo'lishi
// kerak — aks holda operator "To'xtatish" bosgan bo'lsa ham "Yangilash
// tugadi" degan noto'g'ri xabarni ko'rardi.
{
  const { bulk } = build({
    contracts: { c1: ['s1'], c2: ['s2'] },
    delayMs: 60_000,
  });
  bulk.start(['c1', 'c2'], 'j6c');
  // c1 tugaguncha kutamiz — c2 endi oxirgi (va yagona qolgan) mijoz
  // sifatida pauzada turibdi.
  await kut(bulk, (j) => j.done === 1, 'birinchi mijoz tugashi');

  bulk.stop();
  const job = await kut(bulk, tugadi, 'to\'xtash');

  check('holat "stopped" ("done" emas)', job.status === 'stopped', job.status);
  check('oxirgi mijoz sanalmadi', job.done === 1, String(job.done));
}

// ─── Sync o'chirilgan bo'lsa CRM'ga umuman tegilmaydi ────────────────────
{
  const { bulk, calls } = build({ contracts: { c1: ['s1'] }, enabled: false });
  const job = await bulk.start(['c1'], 'j7');

  check('holat "failed"', job.status === 'failed', job.status);
  check('sabab yozildi', Boolean(job.error), String(job.error));
  check('CRM\'ga so\'rov ketmadi', calls.length === 0, String(calls.length));
  check('vazifa ketmayapti', !bulk.isRunning(), String(bulk.isRunning()));
}

// ─── Ish ketmayotganda stop() xato bermaydi ──────────────────────────────
// Tugma ikki marta bosilishi mumkin.
{
  const { bulk } = build({ contracts: {} });
  let xato: unknown = null;
  try {
    bulk.stop();
  } catch (err) {
    xato = err;
  }
  check('bo\'sh holatda stop() xato tashlamaydi', xato === null, String(xato));
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
