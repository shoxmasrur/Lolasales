import type { AddressInfo } from 'node:net';
import express, { type RequestHandler } from 'express';
import type { Container } from '@/composition/container';
import { QamrovTekshiruvchi } from '@/application/services/QamrovTekshiruvchi';
import { CreateClientFromContract } from '@/application/usecases/clients/CreateClientFromContract';
import type { MijozQamrovi } from '@/domain/entities/MijozQamrovi';
import { PERMISSIONS, type Permission } from '@/domain/entities/Permission';
import type { User } from '@/domain/entities/User';
import type { IQamrovRepository } from '@/domain/repositories/IQamrovRepository';
import type { ExternalContract } from '@/domain/services/IContractGateway';
import { errorHandler } from '@/presentation/http/middleware/errorHandler';
import { clientRoutes } from '@/presentation/http/routes/clientRoutes';

/**
 * Qo'lda ishga tushiriladi: npm run test:client-qamrov --workspace=server
 * (CI'da soxta DATABASE_URL/JWT_SECRET/ENCRYPTION_KEY bilan — errorHandler
 * `shared/config` ni tortadi; bazaga chiqmaydi).
 *
 * Obyekt cheklovi — `/clients` bo'limi:
 *   • ro'yxat/ids/eksport/tab-counts/contract-statuses/phone-blocks repoga
 *     so'rovchining qamrovini beradi (cheklanmaganda — cheklovsiz);
 *   • begona `/:id` va `/:id/*` — 404, repo amallari chaqirilmaydi;
 *     o'chirilgan mijoz cheklanganga ko'rinmaydi;
 *   • `from-contract` — CRM shartnomasi obyekti qamrovda bo'lmasa 404,
 *     hech narsa yozilmaydi; bazadagi begona mijozning shartnomasi ham 404;
 *   • ommaviy amallar: begona id'lar tushadi, javobda `chiqarildi`;
 *     hammasi begona bo'lsa — 422;
 *   • boshqa foydalanuvchining vazifasi cheklanganga ismsiz/ro'yxatsiz,
 *     `stop` — 403 `OBYEKT_CHEKLOVI`;
 *   • cheklanmagan: javoblar avvalgidek (`chiqarildi` yo'q, holat to'liq).
 */

let failed = 0;
function eq(nom: string, actual: unknown, kutilgan: unknown): void {
  const a = JSON.stringify(actual);
  const k = JSON.stringify(kutilgan);
  if (a === k) console.log(`✓ ${nom}`);
  else {
    failed += 1;
    console.log(`✗ ${nom}: ${a}  (kutilgan: ${k})`);
  }
}

const ROLE_ID = '33333333-3333-4333-8333-333333333333';
const ADMIN_UID = '11111111-1111-4111-8111-111111111111';
const CHEK_UID = '55555555-5555-4555-8555-555555555555';
const BOSHQA_UID = '66666666-6666-4666-8666-666666666666';

const VATAN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BEGONA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OCHIRILGAN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ACC = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function user(id: string, objects: string[]): User {
  return {
    id, email: `${id.slice(0, 4)}@xonsaroy.uz`, passwordHash: 'h', fullName: 'Xodim', roleId: ROLE_ID,
    role: {
      id: ROLE_ID, key: 'operator', name: 'Operator', description: null,
      permissions: [...PERMISSIONS] as Permission[], isSystem: false, createdAt: new Date(), updatedAt: new Date(),
    },
    isActive: true, failedLoginAttempts: 0, lockedAt: null, objects,
    createdAt: new Date(), updatedAt: new Date(),
  };
}

// ── Soxta qamrov: faqat VATAN mijozi `Vatan` obyektida. ──
const qamrovRepo: IQamrovRepository = {
  // O'chirilgan mijoz ham "qamrovda" — route'ning o'z savat himoyasi sinaladi.
  mijozQamrovdaMi: async (_q, id) => id === VATAN || id === OCHIRILGAN,
  suhbatQamrovdaMi: async () => false,
  xabarQamrovdaMi: async () => false,
  shartnomaQamrovdaMi: async () => false,
  shartnomaRaqamiQamrovdaMi: async () => false,
  talabnomaQamrovdaMi: async () => false,
  qamrovdagiMijozlar: async (_q, ids) => ids.filter((id) => id === VATAN),
  qamrovdagiSuhbatlar: async () => [],
};

const mijozlar = new Map<string, { id: string; fullName: string; deletedAt: Date | null }>([
  [VATAN, { id: VATAN, fullName: 'Vatan Mijoz', deletedAt: null }],
  [BEGONA, { id: BEGONA, fullName: 'Begona Mijoz', deletedAt: null }],
  [OCHIRILGAN, { id: OCHIRILGAN, fullName: 'Ochirilgan Mijoz', deletedAt: new Date() }],
]);

/** Repo chaqiruvlari: metod nomi → oxirgi qamrov argumenti. */
const qamrovlar = new Map<string, MijozQamrovi | undefined>();
const amallar: string[] = [];
const yaratilganlar: string[] = [];
const upsertlar: string[] = [];

const bazadagiShartnomalar = new Map<string, { id: string; clientId: string }>([
  ['BEGONA-1', { id: 'k1', clientId: BEGONA }],
  ['VATAN-1', { id: 'k2', clientId: VATAN }],
]);
const crm = new Map<string, Partial<ExternalContract>>([
  ['YANGI-VATAN', { contractNo: 'YANGI-VATAN', objectName: ' Vatan ' }],
  ['YANGI-BOG', { contractNo: 'YANGI-BOG', objectName: "Bog'" }],
  ['BEGONA-1', { contractNo: 'BEGONA-1', objectName: "Bog'" }],
  ['VATAN-1', { contractNo: 'VATAN-1', objectName: 'Vatan' }],
]);

const clientsRepo = {
  search: async (_f: unknown, q?: MijozQamrovi) => { qamrovlar.set('search', q); return { items: [], total: 0, limit: 50, offset: 0 }; },
  searchIds: async (_f: unknown, q?: MijozQamrovi) => { qamrovlar.set('searchIds', q); return []; },
  searchAll: async function* (_f: unknown, _b?: number, q?: MijozQamrovi) { qamrovlar.set('searchAll', q); yield []; },
  tabCounts: async (q?: MijozQamrovi) => { qamrovlar.set('tabCounts', q); return {}; },
  contractStatuses: async (q?: MijozQamrovi) => { qamrovlar.set('contractStatuses', q); return []; },
  findById: async (id: string, o?: { includeDeleted?: boolean }) => {
    const m = mijozlar.get(id);
    if (!m || (m.deletedAt && !o?.includeDeleted)) return null;
    return { ...m, telegramStatus: 'unknown', telegramUserId: null, deletedBy: null };
  },
  findByPhone: async () => null,
  create: async (c: { fullName: string }) => { yaratilganlar.push(c.fullName); return { id: 'yangi', fullName: c.fullName }; },
  update: async (id: string) => { amallar.push(`update:${id}`); return { id }; },
  softDelete: async (id: string) => { amallar.push(`softDelete:${id}`); return {}; },
  restore: async (id: string) => { amallar.push(`restore:${id}`); return {}; },
  previewBulkStart: async (ids: string[]) => { amallar.push(`preview:${ids.join(',')}`); return { total: ids.length, counts: {}, mismatches: [] }; },
  assignAccounts: async () => 0,
};

const contractsRepo = {
  findByClientId: async () => [],
  findByContractNo: async (no: string) => bazadagiShartnomalar.get(no) ?? null,
  upsert: async (c: { contractNo: string }) => { upsertlar.push(c.contractNo); return { contract: { id: 'yk' } }; },
};

const clock = { now: () => new Date('2026-10-20T06:00:00Z'), todayIso: () => '2026-10-20' };
const gateway = {
  findByContractNo: async (no: string) => {
    const c = crm.get(no);
    return c
      ? ({ clientName: 'CRM Mijoz', clientFirstName: 'CRM', phones: [], schedule: [], history: [], ...c } as unknown as ExternalContract)
      : null;
  },
};
const contractSync = { syncOne: async () => ({ outcome: 'ok', debtTotal: 0, newPhones: [] }) };
const audit = { record: async () => undefined };

type Vazifa = Record<string, unknown> & { boshlaganUserId?: string | null };
function bulkFake(nom: string) {
  return {
    holat: null as Vazifa | null,
    startlar: [] as Array<{ ids: string[]; extra: unknown }>,
    toxtatildi: 0,
    current() { return this.holat; },
    isRunning() { return false; },
    async start(ids: string[], jobId: string, extra?: unknown) {
      this.startlar.push({ ids, extra });
      return { id: jobId, nom };
    },
    stop() { this.toxtatildi += 1; },
  };
}
const bulkLookup = bulkFake('lookup');
const bulkStart = bulkFake('start');
const planlar: string[][] = [];

const container = {
  repositories: {
    clients: clientsRepo,
    contracts: contractsRepo,
    conversations: { findByClientId: async () => null },
    contractPayments: { listSchedule: async () => [], listRecentPayments: async () => [] },
    audit,
    phoneBlocks: {
      report: async (q?: MijozQamrovi) => { qamrovlar.set('phoneBlocks', q); return []; },
      listForClient: async () => [],
      unblock: async (id: string) => { amallar.push(`unblock:${id}`); },
    },
    telegramAccounts: { list: async () => [{ id: ACC, isEnabled: true, spamStatus: 'ok', label: 'A' }] },
  },
  services: {
    contractSync,
    qamrovTekshiruvchi: new QamrovTekshiruvchi(qamrovRepo),
    bulkLookup,
    bulkStart,
    bulkJobStore: { assertFree: async () => undefined },
    bulkStartPlanner: {
      plan: async (ids: string[]) => { planlar.push(ids); return { accountPlan: [{ accountId: ACC }], reassigned: 0, assignments: new Map() }; },
    },
  },
  useCases: {
    createClientFromContract: new CreateClientFromContract(
      clientsRepo as never, contractsRepo as never, gateway as never, contractSync as never,
      audit as never, clock as never, true,
    ),
  },
  settings: { get: async () => ({ minDebt: 0 }) },
  events: { publish: () => undefined },
} as unknown as Container;

const users = new Map<string, User>([
  [ADMIN_UID, user(ADMIN_UID, [])],
  [CHEK_UID, user(CHEK_UID, ['Vatan'])],
]);
const app = express();
app.use(express.json());
const authenticate: RequestHandler = (req, _res, next) => {
  req.user = users.get(String(req.headers['x-uid'] ?? ADMIN_UID));
  next();
};
app.use('/api/clients', authenticate, clientRoutes(container));
app.use(errorHandler);

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/clients`;

async function so(method: string, path: string, body?: unknown, uid = ADMIN_UID) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-uid': uid },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const tur = res.headers.get('content-type') ?? '';
  const json = (tur.includes('json') ? await res.json() : null) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  return { status: res.status, json };
}
const C = CHEK_UID;
const qisqa = (q: MijozQamrovi | undefined) => (q ? { cheklangan: q.cheklangan, obyektlar: q.obyektlar } : q);

try {
  // ── Ro'yxatlar: SQL'ga qamrov boradi ──
  const royxatlar: Array<[string, string]> = [
    ['/', 'search'], ['/ids', 'searchIds'], ['/export', 'searchAll'], ['/tab-counts', 'tabCounts'],
    ['/contract-statuses', 'contractStatuses'], ['/phone-blocks', 'phoneBlocks'],
  ];
  for (const [yol, metod] of royxatlar) {
    qamrovlar.clear();
    const r = await so('GET', yol, undefined, C);
    eq(`cheklangan GET ${yol} — 200, repo qamrovi Vatan`, [r.status, qisqa(qamrovlar.get(metod))],
      [200, { cheklangan: true, obyektlar: ['Vatan'] }]);
    qamrovlar.clear();
    const u = await so('GET', yol);
    eq(`cheklanmagan GET ${yol} — cheklovsiz`, [u.status, qamrovlar.get(metod)?.cheklangan], [200, false]);
  }

  // ── Bitta mijoz ──
  eq('cheklangan GET /:id o\'zi — 200', (await so('GET', `/${VATAN}`, undefined, C)).status, 200);
  const b = await so('GET', `/${BEGONA}`, undefined, C);
  eq('cheklangan GET /:id begona — 404 NOT_FOUND', [b.status, b.json?.error?.code], [404, 'NOT_FOUND']);
  eq('cheklangan GET /:id yaroqsiz id — 404', (await so('GET', '/xyz', undefined, C)).status, 404);
  eq('cheklanmagan GET /:id begona — 200', (await so('GET', `/${BEGONA}`)).status, 200);
  eq('cheklanmagan GET /:id o\'chirilgan — 200', (await so('GET', `/${OCHIRILGAN}`)).status, 200);
  eq('cheklangan GET /:id o\'chirilgan — 404', (await so('GET', `/${OCHIRILGAN}`, undefined, C)).status, 404);

  amallar.length = 0;
  const begonaYozuvlar: Array<[string, string, unknown?]> = [
    ['PATCH', `/${BEGONA}`, { notes: 'x' }],
    ['DELETE', `/${BEGONA}`],
    ['POST', `/${OCHIRILGAN}/restore`],
    ['POST', `/${BEGONA}/phones/block`, { phone: '+998901112233' }],
    ['DELETE', `/${BEGONA}/phones/block`, { phone: '+998901112233' }],
    ['POST', `/${BEGONA}/sync-contract`, { contractId: 'k1' }],
    ['POST', `/${BEGONA}/telegram-lookup`],
    ['POST', `/${BEGONA}/telegram-username`, { username: '@begona_x' }],
    ['POST', `/${BEGONA}/telegram-confirm`],
    ['POST', `/${BEGONA}/start-conversation`, {}],
  ];
  for (const [m, yol, body] of begonaYozuvlar) {
    eq(`cheklangan ${m} ${yol.replace(BEGONA, 'BEGONA').replace(OCHIRILGAN, 'OCHIRILGAN')} — 404`,
      (await so(m, yol, body, C)).status, 404);
  }
  eq('begona yozuvlarda repo amallari chaqirilmadi', amallar, []);
  eq('cheklangan PATCH /:id o\'zi — 200', (await so('PATCH', `/${VATAN}`, { notes: 'x' }, C)).status, 200);
  eq('cheklanmagan PATCH begona — 200', (await so('PATCH', `/${BEGONA}`, { notes: 'x' })).status, 200);
  eq('cheklanmagan restore o\'chirilgan — 200', (await so('POST', `/${OCHIRILGAN}/restore`)).status, 200);

  // ── Shartnomadan qo'shish ──
  const pv = await so('POST', '/from-contract/preview', { contractNo: 'YANGI-VATAN' }, C);
  eq('cheklangan preview qamrovdagi yangi shartnoma — 200', [pv.status, pv.json?.preview?.contract?.contractNo], [200, 'YANGI-VATAN']);
  const pb = await so('POST', '/from-contract/preview', { contractNo: 'YANGI-BOG' }, C);
  eq('cheklangan preview begona obyekt — 404', [pb.status, pb.json?.error?.code], [404, 'NOT_FOUND']);
  eq('cheklangan preview bazadagi begona mijoz shartnomasi — 404',
    (await so('POST', '/from-contract/preview', { contractNo: 'BEGONA-1' }, C)).status, 404);
  eq('cheklangan preview bazadagi o\'z mijozi — 200',
    (await so('POST', '/from-contract/preview', { contractNo: 'VATAN-1' }, C)).status, 200);
  eq('cheklanmagan preview begona obyekt — 200',
    (await so('POST', '/from-contract/preview', { contractNo: 'YANGI-BOG' })).status, 200);

  upsertlar.length = 0;
  yaratilganlar.length = 0;
  const xb = await so('POST', '/from-contract', { contractNo: 'YANGI-BOG' }, C);
  eq('cheklangan from-contract begona obyekt — 404, hech narsa yozilmadi',
    [xb.status, upsertlar, yaratilganlar], [404, [], []]);
  const xe = await so('POST', '/from-contract', { contractNo: 'BEGONA-1' }, C);
  eq('cheklangan from-contract bazadagi begona — 404 (clientId oshkor emas)',
    [xe.status, xe.json?.result], [404, undefined]);
  const xv = await so('POST', '/from-contract', { contractNo: 'YANGI-VATAN' }, C);
  eq('cheklangan from-contract qamrovdagi — 200 created', [xv.status, xv.json?.result?.outcome, upsertlar], [200, 'created', ['YANGI-VATAN']]);
  const xo = await so('POST', '/from-contract', { contractNo: 'BEGONA-1' });
  eq('cheklanmagan from-contract bazadagi — already_exists', [xo.status, xo.json?.result], [200, { outcome: 'already_exists', clientId: BEGONA }]);
  upsertlar.length = 0;
  const xu = await so('POST', '/from-contract', { contractNo: 'YANGI-BOG' });
  eq('cheklanmagan from-contract begona obyekt — created', [xu.status, xu.json?.result?.outcome], [200, 'created']);

  // ── Ommaviy amallar: kesish va `chiqarildi` ──
  const ikki = [VATAN, BEGONA];
  const lk = await so('POST', '/telegram-lookup-bulk', { clientIds: ikki }, C);
  eq('cheklangan lookup — begona tushdi, chiqarildi 1',
    [lk.status, bulkLookup.startlar.at(-1)?.ids, lk.json?.chiqarildi], [200, [VATAN], 1]);
  eq('cheklangan lookup — boshlaganUserId', bulkLookup.startlar.at(-1)?.extra, CHEK_UID);
  const lkp = await so('POST', '/telegram-lookup-bulk/preview', { clientIds: ikki, accountIds: [ACC] }, C);
  eq('cheklangan lookup preview — total 1, rejaga faqat Vatan',
    [lkp.status, lkp.json?.total, planlar.at(-1), lkp.json?.chiqarildi], [200, 1, [VATAN], 1]);
  const sp = await so('POST', '/start-conversation-bulk/preview', { clientIds: ikki }, C);
  eq('cheklangan start preview — repo faqat Vatan',
    [sp.status, amallar.at(-1), sp.json?.chiqarildi], [200, `preview:${VATAN}`, 1]);
  const st = await so('POST', '/start-conversation-bulk', { clientIds: ikki, accountIds: [ACC] }, C);
  eq('cheklangan start — faqat Vatan, chiqarildi 1',
    [st.status, bulkStart.startlar.at(-1)?.ids, st.json?.chiqarildi], [200, [VATAN], 1]);
  eq('cheklangan start — options.boshlaganUserId',
    (bulkStart.startlar.at(-1)?.extra as { boshlaganUserId?: string })?.boshlaganUserId, CHEK_UID);

  const ul = await so('POST', '/telegram-lookup-bulk', { clientIds: ikki });
  eq('cheklanmagan lookup — hammasi, chiqarildi yo\'q',
    [ul.status, bulkLookup.startlar.at(-1)?.ids, 'chiqarildi' in (ul.json ?? {})], [200, ikki, false]);
  const us = await so('POST', '/start-conversation-bulk', { clientIds: ikki, accountIds: [ACC] });
  eq('cheklanmagan start — hammasi', [us.status, bulkStart.startlar.at(-1)?.ids], [200, ikki]);
  const usp = await so('POST', '/start-conversation-bulk/preview', { clientIds: ikki });
  eq('cheklanmagan start preview — hammasi, chiqarildi yo\'q',
    [amallar.at(-1), 'chiqarildi' in (usp.json ?? {})], [`preview:${ikki.join(',')}`, false]);

  // ── Vazifa holati: boshqaning vazifasi ismsiz ──
  bulkStart.holat = {
    id: 's1', total: 5, done: 2, status: 'running', currentName: 'Ali Valiyev', boshlaganUserId: BOSHQA_UID,
    skippedItems: [{ clientId: BEGONA, contractNo: 'B-1', fullName: 'Begona', reason: 'x' }], skippedItemsTruncated: 0,
    skipReasons: { x: 1 },
  };
  bulkLookup.holat = { id: 'l1', total: 3, done: 1, status: 'running', currentName: 'Vali', boshlaganUserId: BOSHQA_UID };
  const gs = await so('GET', '/start-conversation-bulk', undefined, C);
  eq('cheklangan: boshqaning start holati — ismsiz, ro\'yxatsiz, sonlar bor',
    [gs.json.job.currentName, gs.json.job.skippedItems, gs.json.job.done, gs.json.job.skipReasons], [null, [], 2, { x: 1 }]);
  const gl = await so('GET', '/telegram-lookup-bulk', undefined, C);
  eq('cheklangan: boshqaning lookup holati — ismsiz', [gl.json.job.currentName, gl.json.job.done], [null, 1]);

  const ug = await so('GET', '/start-conversation-bulk');
  eq('cheklanmagan: holat to\'liq', [ug.json.job.currentName, ug.json.job.skippedItems.length], ['Ali Valiyev', 1]);

  for (const [yol, fake] of [
    ['/start-conversation-bulk/stop', bulkStart], ['/telegram-lookup-bulk/stop', bulkLookup],
  ] as const) {
    const r = await so('POST', yol, undefined, C);
    eq(`cheklangan: boshqaning vazifasini to'xtatish ${yol} — 403`,
      [r.status, r.json?.error?.code, fake.toxtatildi], [403, 'OBYEKT_CHEKLOVI', 0]);
  }

  // O'z vazifasi — to'liq ko'rinadi va to'xtatiladi.
  bulkStart.holat = { ...bulkStart.holat, boshlaganUserId: CHEK_UID };
  const og = await so('GET', '/start-conversation-bulk', undefined, C);
  eq('cheklangan: o\'z vazifasi — to\'liq', og.json.job.currentName, 'Ali Valiyev');
  const os = await so('POST', '/start-conversation-bulk/stop', undefined, C);
  eq('cheklangan: o\'z vazifasini to\'xtatadi — 200', [os.status, bulkStart.toxtatildi], [200, 1]);

  // Egasi noma'lum (eski vazifa) — cheklanganga yopiq.
  bulkLookup.holat = { id: 'l2', total: 1, done: 0, status: 'running', currentName: 'Eski' };
  eq('cheklangan: egasiz vazifa — ismsiz', (await so('GET', '/telegram-lookup-bulk', undefined, C)).json.job.currentName, null);
  bulkLookup.holat = null;
  eq('vazifa yo\'q — null', (await so('GET', '/telegram-lookup-bulk', undefined, C)).json.job, null);
} finally {
  server.close();
}

if (failed) {
  console.log(`\n${failed} ta tekshiruv yiqildi`);
  process.exit(1);
}
console.log('\nHammasi o\'tdi');
