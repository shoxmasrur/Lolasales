import type { AddressInfo } from 'node:net';
import express, { type RequestHandler } from 'express';
import type { Container } from '@/composition/container';
import { QamrovTekshiruvchi } from '@/application/services/QamrovTekshiruvchi';
import type { MijozQamrovi } from '@/domain/entities/MijozQamrovi';
import { PERMISSIONS, type Permission } from '@/domain/entities/Permission';
import type { User } from '@/domain/entities/User';
import type { IQamrovRepository } from '@/domain/repositories/IQamrovRepository';
import { errorHandler } from '@/presentation/http/middleware/errorHandler';
import { agentRoutes } from '@/presentation/http/routes/agentRoutes';
import { conversationRoutes } from '@/presentation/http/routes/conversationRoutes';
import { mediaRoutes } from '@/presentation/http/routes/mediaRoutes';

/**
 * Qo'lda ishga tushiriladi: npm run test:suhbat-qamrov --workspace=server
 * (CI'da soxta DATABASE_URL/JWT_SECRET/ENCRYPTION_KEY bilan — route
 * `shared/config` ni tortadi; bazaga chiqmaydi).
 *
 * Obyekt cheklovi — suhbatlar, media, noma'lum, agent profili:
 *   • `GET /conversations` va `/filters` repoga so'rovchining qamrovini beradi;
 *   • begona `/:id` va `/:id/*` — 404, repo/use case chaqirilmaydi;
 *     o'ziniki va cheklanmagan — avvalgidek;
 *   • `POST /reset` va `/:id/nomalum/*` — cheklanganga 403 `OBYEKT_CHEKLOVI`;
 *   • `GET /media/:messageId` — begona xabar 404;
 *   • `/agent/client-profile/:clientId` — begona mijoz 404;
 *     `POST /agent/lessons` begona `conversationId` bilan — 404.
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

const VATAN_CL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BEGONA_CL = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VATAN_CV = 'a1a1a1a1-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BEGONA_CV = 'b1b1b1b1-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const VATAN_MSG = 'a2a2a2a2-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BEGONA_MSG = 'b2b2b2b2-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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

// ── Soxta qamrov: faqat VATAN_* yozuvlari `Vatan` obyektida. ──
const tekshiruvlar: string[] = [];
const qamrovRepo: IQamrovRepository = {
  mijozQamrovdaMi: async (_q, id) => { tekshiruvlar.push(`mijoz:${id}`); return id === VATAN_CL; },
  suhbatQamrovdaMi: async (_q, id) => { tekshiruvlar.push(`suhbat:${id}`); return id === VATAN_CV; },
  xabarQamrovdaMi: async (_q, id) => { tekshiruvlar.push(`xabar:${id}`); return id === VATAN_MSG; },
  shartnomaQamrovdaMi: async () => false,
  shartnomaRaqamiQamrovdaMi: async () => false,
  talabnomaQamrovdaMi: async () => false,
  qamrovdagiMijozlar: async () => [],
  qamrovdagiSuhbatlar: async () => [],
};

/** Repo/use case amallari — begona yozuvda bo'sh qolishi kerak. */
const amallar: string[] = [];
const qamrovlar = new Map<string, MijozQamrovi | undefined>();

function suhbat(id: string) {
  return {
    id, clientId: id === VATAN_CV ? VATAN_CL : BEGONA_CL, telegramAccountId: null, needsHuman: false,
    state: 'contacted', agentEnabled: true,
  };
}
function xabar(id: string) {
  return {
    id, conversationId: id === VATAN_MSG ? VATAN_CV : BEGONA_CV, direction: 'in',
    media: { kind: 'photo', path: `media/${id}.jpg`, fileName: 'chek.jpg', mimeType: 'image/jpeg' },
  };
}

const container = {
  repositories: {
    conversations: {
      findById: async (id: string) => { amallar.push(`findById:${id}`); return suhbat(id); },
      list: async (_f: unknown, q?: MijozQamrovi) => { qamrovlar.set('list', q); return { items: [], total: 0, limit: 50, offset: 0 }; },
      filterOptions: async (q?: MijozQamrovi) => { qamrovlar.set('filterOptions', q); return { objects: [], accounts: [] }; },
      update: async (id: string) => { amallar.push(`update:${id}`); return suhbat(id); },
      markRead: async (id: string) => { amallar.push(`markRead:${id}`); },
      resetAll: async () => { amallar.push('resetAll'); return { conversations: 0 }; },
    },
    messages: {
      listByConversation: async (id: string) => { amallar.push(`messages:${id}`); return { items: [], total: 0, limit: 100, offset: 0 }; },
      findById: async (id: string) => { amallar.push(`message:${id}`); return xabar(id); },
    },
    clients: { findById: async (id: string) => ({ id, fullName: 'Mijoz', nomalum: false }) },
    contracts: { findByClientId: async () => [] },
    promises: { findActiveByConversation: async () => null },
    audit: { record: async () => undefined },
    paymentChecks: { findOpenByConversation: async () => null },
    nomalumSuhbatlar: { find: async (id: string) => { amallar.push(`nomalum:${id}`); return null; } },
    telegramAccounts: { list: async () => [], findById: async () => null },
    agentRules: {},
    lessons: {
      recordProposal: async (p: { lesson: string }) => { amallar.push('lesson'); return { id: 'l1', lesson: p.lesson }; },
    },
    clientProfiles: {
      find: async (id: string) => { amallar.push(`profile:${id}`); return { clientId: id }; },
      upsert: async (id: string) => { amallar.push(`upsert:${id}`); return { clientId: id }; },
    },
  },
  services: {
    qamrovTekshiruvchi: new QamrovTekshiruvchi(qamrovRepo),
    paymentCheckService: {
      checkNow: async (id: string) => { amallar.push(`checkNow:${id}`); return { kind: 'checked' }; },
      confirmReceipt: async (id: string) => { amallar.push(`confirm:${id}`); return { kind: 'confirmed' }; },
      cancel: async () => undefined,
    },
    dispatcher: {
      sendMedia: async () => { amallar.push('sendMedia'); return { id: 'm' }; },
      markReadInTelegram: async () => undefined,
    },
    javobYonaltiruvchi: { abort: () => undefined },
    mediaStorage: { exists: async () => true, read: async () => Buffer.from('rasm') },
    promptComposer: { invalidate: () => undefined },
  },
  useCases: {
    sendManual: { execute: async (i: { conversationId: string }) => { amallar.push(`send:${i.conversationId}`); return { id: 'm' }; } },
    editMessage: { execute: async (i: { conversationId: string }) => { amallar.push(`edit:${i.conversationId}`); return { id: 'm' }; } },
    deleteMessage: { execute: async (i: { conversationId: string }) => { amallar.push(`delete:${i.conversationId}`); return { id: 'm' }; } },
    retryAgentTurn: { execute: async (i: { conversationId: string }) => { amallar.push(`retry:${i.conversationId}`); return { ok: true }; } },
    instructAgent: { execute: async (i: { conversationId: string }) => { amallar.push(`instruct:${i.conversationId}`); return { ok: true }; } },
  },
  clock: { now: () => new Date('2026-10-20T06:00:00Z') },
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
app.use('/api', authenticate);
app.use('/api/conversations', conversationRoutes(container));
app.use('/api/media', mediaRoutes(container));
app.use('/api/agent', agentRoutes(container));
app.use(errorHandler);

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

async function so(method: string, path: string, body?: unknown, uid = ADMIN_UID) {
  const forma = body instanceof FormData;
  const res = await fetch(`${base}${path}`, {
    method,
    headers: forma ? { 'x-uid': uid } : { 'content-type': 'application/json', 'x-uid': uid },
    body: body === undefined ? undefined : forma ? body : JSON.stringify(body),
  });
  const tur = res.headers.get('content-type') ?? '';
  const json = (tur.includes('json') ? await res.json() : null) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  return { status: res.status, json };
}
const C = CHEK_UID;
const qisqa = (q: MijozQamrovi | undefined) => (q ? { cheklangan: q.cheklangan, obyektlar: q.obyektlar } : q);
const nomi = (yol: string) =>
  yol.replace(VATAN_CV, 'VATAN').replace(BEGONA_CV, 'BEGONA').replace(VATAN_MSG, 'MSG').replace(BEGONA_MSG, 'MSG');
function fayl(): FormData {
  const f = new FormData();
  f.append('file', new Blob(['rasm'], { type: 'image/jpeg' }), 'chek.jpg');
  return f;
}

try {
  // ── Ro'yxat va filtrlar: SQL'ga qamrov boradi ──
  for (const [yol, metod] of [['/conversations', 'list'], ['/conversations/filters', 'filterOptions']] as const) {
    qamrovlar.clear();
    const r = await so('GET', yol, undefined, C);
    eq(`cheklangan GET ${yol} — 200, repo qamrovi Vatan`, [r.status, qisqa(qamrovlar.get(metod))],
      [200, { cheklangan: true, obyektlar: ['Vatan'] }]);
    qamrovlar.clear();
    const u = await so('GET', yol);
    eq(`cheklanmagan GET ${yol} — cheklovsiz`, [u.status, qamrovlar.get(metod)?.cheklangan], [200, false]);
  }

  // ── `/:id` va `/:id/*` ──
  const yollar = (id: string, msg: string): Array<[string, string, unknown?, number?]> => [
    ['GET', `/conversations/${id}`],
    ['GET', `/conversations/${id}/messages`],
    ['POST', `/conversations/${id}/messages`, { body: 'Salom' }, 201],
    ['PATCH', `/conversations/${id}/messages/${msg}`, { body: 'Tuzatildi' }],
    ['DELETE', `/conversations/${id}/messages/${msg}`],
    ['POST', `/conversations/${id}/media`, 'fayl', 201],
    ['POST', `/conversations/${id}/read`],
    ['PATCH', `/conversations/${id}`, { needsHuman: false }],
    ['POST', `/conversations/${id}/agent-retry`],
    ['POST', `/conversations/${id}/agent-instruction`, { instruction: 'To\'lovni so\'ra' }],
    ['POST', `/conversations/${id}/check-payment`],
    ['POST', `/conversations/${id}/receipt-confirm`],
  ];
  const tana = (b: unknown) => (b === 'fayl' ? fayl() : b);

  amallar.length = 0;
  tekshiruvlar.length = 0;
  for (const [m, yol, body] of yollar(BEGONA_CV, BEGONA_MSG)) {
    const r = await so(m, yol, tana(body), C);
    eq(`cheklangan ${m} ${nomi(yol)} — 404 NOT_FOUND`, [r.status, r.json?.error?.code], [404, 'NOT_FOUND']);
  }
  eq('begona suhbatda repo/use case chaqirilmadi', amallar, []);
  eq('har bir begona yo\'lda suhbat tekshirildi', tekshiruvlar.length, yollar(BEGONA_CV, BEGONA_MSG).length);
  eq('cheklangan yaroqsiz suhbat id — 404', (await so('GET', '/conversations/xyz', undefined, C)).status, 404);

  for (const [m, yol, body, kod] of yollar(VATAN_CV, VATAN_MSG)) {
    eq(`cheklangan ${m} ${nomi(yol)} o'ziniki — ${kod ?? 200}`, (await so(m, yol, tana(body), C)).status, kod ?? 200);
  }
  tekshiruvlar.length = 0;
  for (const [m, yol, body, kod] of yollar(BEGONA_CV, BEGONA_MSG)) {
    eq(`cheklanmagan ${m} ${nomi(yol)} — ${kod ?? 200}`, (await so(m, yol, tana(body))).status, kod ?? 200);
  }
  eq('cheklanmaganda qamrov bazasiga so\'rov yo\'q', tekshiruvlar, []);

  // ── Yopiq: reset va noma'lum amallari ──
  amallar.length = 0;
  const rs = await so('POST', '/conversations/reset', {}, C);
  eq('cheklangan POST /reset — 403 OBYEKT_CHEKLOVI, tozalanmadi',
    [rs.status, rs.json?.error?.code, amallar], [403, 'OBYEKT_CHEKLOVI', []]);
  eq('cheklanmagan POST /reset — 200', [(await so('POST', '/conversations/reset', {})).status, amallar], [200, ['resetAll']]);

  for (const amal of ['boglash', 'tasdiqlash', 'rad-etish', 'mijoz-emas']) {
    const body = amal === 'boglash' ? { shartnomaRaqami: 'VATAN-1' } : {};
    amallar.length = 0;
    const r = await so('POST', `/conversations/${VATAN_CV}/nomalum/${amal}`, body, C);
    eq(`cheklangan nomalum/${amal} (o'z suhbati ham) — 403 OBYEKT_CHEKLOVI`,
      [r.status, r.json?.error?.code, amallar], [403, 'OBYEKT_CHEKLOVI', []]);
    const u = await so('POST', `/conversations/${BEGONA_CV}/nomalum/${amal}`, body);
    // Soxta repoda noma'lum holati yo'q — avvalgidek 409.
    eq(`cheklanmagan nomalum/${amal} — avvalgidek 409`, u.status, 409);
  }

  // ── Media ──
  amallar.length = 0;
  const mb = await so('GET', `/media/${BEGONA_MSG}`, undefined, C);
  eq('cheklangan GET /media begona — 404, xabar o\'qilmadi', [mb.status, amallar], [404, []]);
  eq('cheklangan GET /media yaroqsiz id — 404', (await so('GET', '/media/xyz', undefined, C)).status, 404);
  eq('cheklangan GET /media o\'ziniki — 200', (await so('GET', `/media/${VATAN_MSG}`, undefined, C)).status, 200);
  tekshiruvlar.length = 0;
  eq('cheklanmagan GET /media begona — 200, qamrov so\'rovisiz',
    [(await so('GET', `/media/${BEGONA_MSG}`)).status, tekshiruvlar], [200, []]);

  // ── Agent: mijoz xotirasi va saboq taklifi ──
  const profil = (id: string): Array<[string, string, unknown?]> => [
    ['GET', `/agent/client-profile/${id}`],
    ['PATCH', `/agent/client-profile/${id}`, { summary: 'x' }],
    ['DELETE', `/agent/client-profile/${id}`],
  ];
  amallar.length = 0;
  for (const [m, yol, body] of profil(BEGONA_CL)) {
    eq(`cheklangan ${m} client-profile begona — 404`, (await so(m, yol, body, C)).status, 404);
  }
  eq('begona profilda repo chaqirilmadi', amallar, []);
  for (const [m, yol, body] of profil(VATAN_CL)) {
    eq(`cheklangan ${m} client-profile o'ziniki — 200`, (await so(m, yol, body, C)).status, 200);
  }
  for (const [m, yol, body] of profil(BEGONA_CL)) {
    eq(`cheklanmagan ${m} client-profile begona — 200`, (await so(m, yol, body)).status, 200);
  }

  const saboq = { lesson: 'Mijozga ertalab yozish yaxshi ishlaydi' };
  amallar.length = 0;
  eq('cheklangan saboq begona suhbat bilan — 404, yozilmadi',
    [(await so('POST', '/agent/lessons', { ...saboq, conversationId: BEGONA_CV }, C)).status, amallar], [404, []]);
  eq('cheklangan saboq o\'z suhbati bilan — 201',
    (await so('POST', '/agent/lessons', { ...saboq, conversationId: VATAN_CV }, C)).status, 201);
  eq('cheklangan saboq suhbatsiz — 201', (await so('POST', '/agent/lessons', saboq, C)).status, 201);
  eq('cheklanmagan saboq begona suhbat bilan — 201',
    (await so('POST', '/agent/lessons', { ...saboq, conversationId: BEGONA_CV })).status, 201);
} finally {
  server.close();
}

if (failed) {
  console.log(`\n${failed} ta tekshiruv yiqildi`);
  process.exit(1);
}
console.log('\nHammasi o\'tdi');
