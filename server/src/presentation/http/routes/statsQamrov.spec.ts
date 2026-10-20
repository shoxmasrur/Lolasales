import type { AddressInfo } from 'node:net';
import express, { type RequestHandler } from 'express';
import type { Container } from '@/composition/container';
import { BulkRecontact, type BulkRecontactInput, type RecontactJob } from '@/application/services/BulkRecontact';
import { QamrovTekshiruvchi } from '@/application/services/QamrovTekshiruvchi';
import type { InstructAgentUseCase } from '@/application/usecases/messaging/InstructAgentUseCase';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { MijozQamrovi } from '@/domain/entities/MijozQamrovi';
import { PERMISSIONS, type Permission } from '@/domain/entities/Permission';
import type { User } from '@/domain/entities/User';
import type { IQamrovRepository } from '@/domain/repositories/IQamrovRepository';
import type { IRecontactRepository } from '@/domain/repositories/IRecontactRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IHolidayRepository } from '@/domain/repositories/IHolidayRepository';
import type { IClock, IEventBus } from '@/domain/services/support';
import { errorHandler } from '@/presentation/http/middleware/errorHandler';
import { recontactBulkRoutes } from '@/presentation/http/routes/recontactBulkRoutes';
import { recontactListRoutes } from '@/presentation/http/routes/recontactListRoutes';
import { statsRoutes } from '@/presentation/http/routes/statsRoutes';

/**
 * Qo'lda ishga tushiriladi: npm run test:stats-qamrov --workspace=server
 * (CI'da soxta DATABASE_URL/JWT_SECRET/ENCRYPTION_KEY bilan — route
 * `shared/config` ni tortadi; bazaga chiqmaydi).
 *
 * Obyekt cheklovi — qayta aloqa va statistika:
 *   • `/stats/dashboard`, `/stats/period`, `/stats/promises`, `GET /recontact`
 *     repoga so'rovchining qamrovini beradi (SQL docker'da alohida tekshirildi);
 *   • `POST /recontact/bulk` — begona suhbatlar tushadi, javobda `chiqarildi`;
 *     hammasi begona — 422; navbatga qamrov va egasi yoziladi;
 *   • boshqaning navbati cheklanganga ismsiz (`results`, `current` yo'q),
 *     uni to'xtata olmaydi (403 `OBYEKT_CHEKLOVI`);
 *   • `BulkRecontact`: egasi va qamrov holatga/kirishga yoziladi, tiklashda
 *     saqlanadi, `findOne` qamrov bilan chaqiriladi;
 *   • cheklanmagan: hammasi avvalgidek.
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
const BOSHQA_CHEK_UID = '66666666-6666-4666-8666-666666666666';

const VATAN_CV = 'a1a1a1a1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BEGONA_CV = 'b1b1b1b1-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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

const kesishlar: string[][] = [];
const qamrovRepo: IQamrovRepository = {
  mijozQamrovdaMi: async () => false,
  suhbatQamrovdaMi: async () => false,
  xabarQamrovdaMi: async () => false,
  shartnomaQamrovdaMi: async () => false,
  shartnomaRaqamiQamrovdaMi: async () => false,
  talabnomaQamrovdaMi: async () => false,
  qamrovdagiMijozlar: async () => [],
  qamrovdagiSuhbatlar: async (_q, ids) => { kesishlar.push(ids); return ids.filter((id) => id === VATAN_CV); },
};

const qamrovlar = new Map<string, MijozQamrovi | undefined>();
const startlar: BulkRecontactInput[] = [];
let toxtatildi = 0;
let navbat: RecontactJob | null = null;

function job(boshlaganUserId?: string): RecontactJob {
  return {
    id: 'j1', status: 'running', total: 2, sent: 1, skipped: 0, failed: 0,
    current: VATAN_CV,
    results: [{ conversationId: VATAN_CV, clientName: 'Aliyev Vali', outcome: 'sent' }],
    startedAt: '2026-10-20T06:00:00.000Z', finishedAt: null, startedBy: 'op@xonsaroy.uz', stopReason: null,
    ...(boshlaganUserId ? { boshlaganUserId } : {}),
  };
}

const container = {
  repositories: {
    stats: {
      dashboard: async (_today: string, q?: MijozQamrovi) => { qamrovlar.set('dashboard', q); return { clientsTotal: 1 }; },
      period: async (from: string, to: string, q?: MijozQamrovi) => { qamrovlar.set('period', q); return { from, to }; },
    },
    promises: {
      list: async (_f: unknown, q?: MijozQamrovi) => { qamrovlar.set('promises', q); return { items: [], total: 0, limit: 50, offset: 0 }; },
    },
    recontactList: {
      list: async (_r: unknown, q?: MijozQamrovi) => { qamrovlar.set('recontact', q); return []; },
    },
    recontactTopics: { findById: async () => null },
    audit: { record: async () => undefined },
  },
  services: {
    qamrovTekshiruvchi: new QamrovTekshiruvchi(qamrovRepo),
    bulkJobStore: { assertFree: async () => undefined },
    bulkRecontact: {
      start: async (input: BulkRecontactInput) => {
        startlar.push(input);
        navbat = { ...job(input.userId), total: input.conversationIds.length };
        return navbat;
      },
      current: () => navbat,
      isRunning: () => navbat?.status === 'running',
      stop: async () => { toxtatildi += 1; },
    },
  },
  settings: { get: async () => ({ minDebt: 100_000, silenceNudgeMax: 2 }) },
  clock: { now: () => new Date('2026-10-20T06:00:00Z'), todayIso: () => '2026-10-20' },
  events: { publish: () => undefined },
} as unknown as Container;

const users = new Map<string, User>([
  [ADMIN_UID, user(ADMIN_UID, [])],
  [CHEK_UID, user(CHEK_UID, ['Vatan'])],
  [BOSHQA_CHEK_UID, user(BOSHQA_CHEK_UID, ['Bog\''])],
]);
const app = express();
app.use(express.json());
const authenticate: RequestHandler = (req, _res, next) => {
  req.user = users.get(String(req.headers['x-uid'] ?? ADMIN_UID));
  next();
};
app.use('/api', authenticate);
app.use('/api/stats', statsRoutes(container));
app.use('/api/recontact', recontactListRoutes(container), recontactBulkRoutes(container));
app.use(errorHandler);

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

async function so(method: string, path: string, body?: unknown, uid = ADMIN_UID) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-uid': uid },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  return { status: res.status, json };
}
const C = CHEK_UID;
const qisqa = (q: MijozQamrovi | undefined) => (q ? { cheklangan: q.cheklangan, obyektlar: q.obyektlar } : q);
const VATAN_Q = { cheklangan: true, obyektlar: ['Vatan'] };

try {
  // ── Statistika va qayta aloqa ro'yxati: repoga qamrov boradi ──
  for (const [yol, kalit] of [
    ['/stats/dashboard', 'dashboard'],
    ['/stats/period?preset=this_month', 'period'],
    ['/stats/promises?status=pending', 'promises'],
    ['/recontact', 'recontact'],
  ] as const) {
    qamrovlar.clear();
    const r = await so('GET', yol, undefined, C);
    eq(`cheklangan GET ${yol} — 200, repo qamrovi Vatan`, [r.status, qisqa(qamrovlar.get(kalit))], [200, VATAN_Q]);
    qamrovlar.clear();
    const u = await so('GET', yol);
    eq(`cheklanmagan GET ${yol} — cheklovsiz`, [u.status, qamrovlar.get(kalit)?.cheklangan], [200, false]);
  }

  // ── Ommaviy yuborish: id'lar kesiladi ──
  const tana = { conversationIds: [VATAN_CV, BEGONA_CV], instruction: 'To\'lov haqida so\'ra' };
  startlar.length = 0;
  const b = await so('POST', '/recontact/bulk', tana, C);
  eq('cheklangan bulk — 200, chiqarildi 1', [b.status, b.json?.chiqarildi, b.json?.job?.total], [200, 1, 1]);
  eq('cheklangan bulk — navbatga faqat o\'ziniki va qamrov', [startlar[0]?.conversationIds, qisqa(startlar[0]?.qamrov)],
    [[VATAN_CV], VATAN_Q]);

  startlar.length = 0;
  const hammasiBegona = await so('POST', '/recontact/bulk', { ...tana, conversationIds: [BEGONA_CV] }, C);
  eq('cheklangan bulk hammasi begona — 422, navbat boshlanmadi',
    [hammasiBegona.status, hammasiBegona.json?.error?.code, startlar.length], [422, 'VALIDATION_ERROR', 0]);

  startlar.length = 0;
  kesishlar.length = 0;
  const u = await so('POST', '/recontact/bulk', tana);
  eq('cheklanmagan bulk — avvalgidek (chiqarildi yo\'q, hammasi)',
    [u.status, 'chiqarildi' in (u.json ?? {}), startlar[0]?.conversationIds, 'qamrov' in (startlar[0] ?? {})],
    [200, false, [VATAN_CV, BEGONA_CV], false]);
  eq('cheklanmaganda qamrov bazasiga so\'rov yo\'q', kesishlar, []);

  // ── Navbat holati: boshqaning navbati ismsiz ──
  navbat = job(ADMIN_UID);
  const g = await so('GET', '/recontact/bulk', undefined, C);
  eq('cheklangan GET boshqaning navbati — results/current yo\'q, sonlar bor',
    [g.json?.job?.results, g.json?.job?.current, g.json?.job?.sent, g.json?.job?.total], [[], null, 1, 2]);
  navbat = job(C);
  const o = await so('GET', '/recontact/bulk', undefined, C);
  eq('cheklangan GET o\'z navbati — to\'liq', [o.json?.job?.results?.length, o.json?.job?.current], [1, VATAN_CV]);
  navbat = job();
  const eski = await so('GET', '/recontact/bulk', undefined, C);
  eq('cheklangan GET egasi noma\'lum navbat — yashirilgan', eski.json?.job?.results, []);
  navbat = job(C);
  const a = await so('GET', '/recontact/bulk');
  eq('cheklanmagan GET boshqaning navbati — to\'liq', [a.json?.job?.results?.length, a.json?.job?.current], [1, VATAN_CV]);
  navbat = null;
  eq('navbat yo\'q — null', (await so('GET', '/recontact/bulk', undefined, C)).json, { job: null });

  // ── To'xtatish ──
  navbat = job(ADMIN_UID);
  toxtatildi = 0;
  const s = await so('POST', '/recontact/bulk/stop', {}, C);
  eq('cheklangan boshqaning navbatini to\'xtata olmaydi — 403', [s.status, s.json?.error?.code, toxtatildi],
    [403, 'OBYEKT_CHEKLOVI', 0]);
  navbat = job(BOSHQA_CHEK_UID);
  eq('cheklangan boshqa cheklanganning navbatini ham — 403', (await so('POST', '/recontact/bulk/stop', {}, C)).status, 403);
  navbat = job(C);
  eq('cheklangan o\'z navbatini to\'xtatadi — 200', [(await so('POST', '/recontact/bulk/stop', {}, C)).status, toxtatildi], [200, 1]);
  navbat = job(C);
  eq('cheklanmagan boshqaning navbatini to\'xtatadi — 200', [(await so('POST', '/recontact/bulk/stop', {})).status, toxtatildi], [200, 2]);
} finally {
  server.close();
}

// ── BulkRecontact: egasi va qamrov ──
{
  const findOneQamrovlar: Array<MijozQamrovi | undefined> = [];
  const recontactList = {
    findOne: async (id: string, _r: unknown, q?: MijozQamrovi) => {
      findOneQamrovlar.push(q);
      return {
        conversationId: id, clientId: `cl-${id}`, clientName: 'Mijoz', kind: 'javobsiz', overdue: 1,
        silentWorkDays: 4, lastMessageAt: '', lastMessageDirection: 'out', lastMessagePreview: '', lastPromise: null,
      };
    },
  } as unknown as IRecontactRepository;
  const settings = {
    get: async () => ({
      minDelaySec: 0, maxDelaySec: 0, windowStart: '00:00', windowEnd: '23:59', weekdays: [0, 1, 2, 3, 4, 5, 6],
      killSwitch: false, silenceNudgeMax: 2, minDebt: 1,
    }),
  } as unknown as RuntimeSettings;
  const agent = { execute: async () => ({ sent: true, reply: 'x', escalated: false, promiseRecorded: false }) } as unknown as InstructAgentUseCase;
  const clock: IClock = { now: () => new Date('2026-10-20T06:00:00Z'), todayIso: () => '2026-10-20' };
  const yangi = () => new BulkRecontact(
    agent, recontactList, settings, { list: async () => [] } as unknown as IHolidayRepository,
    { publish: () => undefined } as unknown as IEventBus, clock,
    { findById: async () => null } as unknown as IConversationRepository,
    { findById: async () => null } as unknown as IClientRepository,
    { sukutdami: async () => false },
    { sleep: async () => undefined, random: (min) => min, windowPollMs: 1 },
  );
  const kut = async (s: BulkRecontact) => {
    for (let i = 0; i < 1000 && s.isRunning(); i += 1) await new Promise((r) => setTimeout(r, 1));
  };
  const cheklangan: MijozQamrovi = { cheklangan: true, obyektlar: ['Vatan'] };

  const s1 = yangi();
  const j1 = await s1.start({ conversationIds: ['c1'], instruction: 'x', userId: 'u1', userEmail: 'op@x.uz', qamrov: cheklangan });
  eq('start — boshlaganUserId holatda', j1.boshlaganUserId, 'u1');
  await kut(s1);
  eq('findOne cheklangan qamrov bilan chaqirildi', findOneQamrovlar.map(qisqa), [VATAN_Q]);

  findOneQamrovlar.length = 0;
  const s2 = yangi();
  await s2.start({ conversationIds: ['c2'], instruction: 'x', userId: 'u2', userEmail: 'op@x.uz' });
  await kut(s2);
  eq('qamrovsiz kirish — findOne cheklovsiz', findOneQamrovlar.map((q) => q?.cheklangan ?? false), [false]);

  findOneQamrovlar.length = 0;
  const s3 = yangi();
  s3.resume({
    id: 'r1', kind: 'recontact', status: 'running',
    input: { conversationIds: ['c3'], instruction: 'x', userId: 'u3', userEmail: 'op@x.uz', qamrov: cheklangan },
    plan: null, snapshot: { total: 1, sent: 0, skipped: 0, failed: 0, results: [], startedBy: 'op@x.uz' },
    processedIds: [], cleanStop: true, crashResumes: 0, resumedCount: 0, startedDay: '2026-10-20',
  });
  eq('resume — egasi kirishdan tiklandi', s3.current()?.boshlaganUserId, 'u3');
  await kut(s3);
  eq('resume — findOne saqlangan qamrov bilan', findOneQamrovlar.map(qisqa), [VATAN_Q]);

  let xato: unknown = null;
  try {
    yangi().resume({
      id: 'r2', kind: 'recontact', status: 'running',
      input: { conversationIds: ['c4'], instruction: 'x', userId: 'u4', userEmail: 'op@x.uz', qamrov: { cheklangan: true } },
      plan: null, snapshot: { total: 1, sent: 0, skipped: 0, failed: 0, results: [] },
      processedIds: [], cleanStop: true, crashResumes: 0, resumedCount: 0, startedDay: '2026-10-20',
    });
  } catch (err) {
    xato = err;
  }
  eq('resume — buzuq qamrov rad etildi (yopiq holatda)', xato instanceof Error, true);

  const s5 = yangi();
  const yopilgan = s5.abandon({
    id: 'r5', kind: 'recontact', status: 'running',
    input: { conversationIds: ['c5'], instruction: 'x', userId: 'u5', userEmail: 'op@x.uz' },
    plan: null, snapshot: { total: 1, sent: 0, skipped: 0, failed: 0, results: [], boshlaganUserId: 'u5' },
    processedIds: [], cleanStop: false, crashResumes: 2, resumedCount: 0, startedDay: '2026-10-20',
  }, 'failed', 'sabab');
  eq('abandon — egasi saqlandi', yopilgan.boshlaganUserId, 'u5');
}

if (failed) {
  console.log(`\n${failed} ta tekshiruv yiqildi`);
  process.exit(1);
}
console.log('\nHammasi o\'tdi');
