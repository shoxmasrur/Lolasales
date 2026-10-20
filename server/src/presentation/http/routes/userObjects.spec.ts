import type { AddressInfo } from 'node:net';
import express, { type RequestHandler } from 'express';
import type { Container } from '@/composition/container';
import type { Permission } from '@/domain/entities/Permission';
import type { User } from '@/domain/entities/User';
import type { NewUser, UserPatch } from '@/domain/repositories/IUserRepository';
import { errorHandler } from '@/presentation/http/middleware/errorHandler';
import { authRoutes } from '@/presentation/http/routes/authRoutes';
import { userRoutes } from '@/presentation/http/routes/userRoutes';
import { mapUser } from '@/infrastructure/db/mappers';

/**
 * Qo'lda ishga tushiriladi: npm run test:user-objects --workspace=server
 * (CI'da soxta DATABASE_URL/JWT_SECRET/ENCRYPTION_KEY bilan — errorHandler
 * `shared/config` ni tortadi; bazaga chiqmaydi).
 *
 *   • yaratish/tahrirlashda `objects` repoga boradi (qirqilgan, takrorsiz);
 *   • `GET /users` va `/auth/me` javobida `objects` bor;
 *   • tahrirdan keyin auth keshi tozalanadi;
 *   • noto'g'ri `objects` — 422 (zod);
 *   • `GET /users/obyektlar` — `users.manage` siz 403, bilan repo ro'yxati;
 *   • obyekt bilan cheklangan aktorga barcha foydalanuvchi/rol/API kalit
 *     yozish yo'llari 403 `OBYEKT_CHEKLOVI` (GET ochiq); cheklanmagan — o'zgarishsiz.
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

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const ROLE_ID = '33333333-3333-4333-8333-333333333333';

function rol(permissions: Permission[]) {
  return {
    id: ROLE_ID, key: 'operator', name: 'Operator', description: null, permissions,
    isSystem: false, createdAt: new Date(), updatedAt: new Date(),
  };
}

function yangiUser(id: string, email: string, objects: string[], permissions: Permission[] = []): User {
  return {
    id, email, passwordHash: 'h', fullName: 'Test Xodim', roleId: ROLE_ID, role: rol(permissions),
    isActive: true, failedLoginAttempts: 0, lockedAt: null, objects,
    createdAt: new Date(), updatedAt: new Date(),
  };
}

const CHEKLANGAN_ID = '55555555-5555-4555-8555-555555555555';
const baza = new Map<string, User>();
baza.set(ADMIN_ID, yangiUser(ADMIN_ID, 'admin@xonsaroy.uz', [], ['users.view', 'users.manage']));
// `users.manage` li, lekin obyekt bilan cheklangan menejer.
baza.set(CHEKLANGAN_ID, yangiUser(CHEKLANGAN_ID, 'menejer@xonsaroy.uz', ['Vatan'], ['users.view', 'users.manage', 'roles.manage']));
const ochirilganlar: string[] = [];
const rolYozuvlari: string[] = [];
const yaratishlar: NewUser[] = [];
const tahrirlar: UserPatch[] = [];
const tozalanganlar: (string | undefined)[] = [];
let n = 0;

const container = {
  repositories: {
    users: {
      findById: async (id: string) => baza.get(id) ?? null,
      findByEmail: async (email: string) => [...baza.values()].find((u) => u.email === email) ?? null,
      list: async () => [...baza.values()],
      create: async (data: NewUser) => {
        yaratishlar.push(data);
        n += 1;
        const id = `44444444-4444-4444-8444-00000000000${n}`;
        const u = yangiUser(id, data.email, data.objects ?? []);
        baza.set(id, u);
        return u;
      },
      update: async (id: string, patch: UserPatch) => {
        tahrirlar.push(patch);
        const old = baza.get(id)!;
        const u = { ...old, ...(patch.objects !== undefined ? { objects: patch.objects } : {}) };
        baza.set(id, u);
        return u;
      },
      countActiveWithPermission: async () => 2,
      remove: async (id: string) => { ochirilganlar.push(id); baza.delete(id); },
    },
    roles: {
      findById: async (id: string) => (id === ROLE_ID ? rol([]) : null),
      update: async (id: string) => { rolYozuvlari.push(`update:${id}`); return rol([]); },
      create: async () => { rolYozuvlari.push('create'); return rol([]); },
      remove: async (id: string) => { rolYozuvlari.push(`remove:${id}`); },
      countUsers: async () => 0,
    },
    apiTokens: {},
    audit: { record: async () => undefined },
    contracts: { obyektNomlari: async () => ['MUHABBAT SHAHRI', 'Vatan'] },
  },
  hasher: { hash: async (p: string) => `h:${p}` },
  auth: { invalidate: (id?: string) => { tozalanganlar.push(id); } },
} as unknown as Container;

const app = express();
app.use(express.json());
// `x-rol`: `admin` — users.view + users.manage; `korish` — faqat users.view;
// `x-uid` — qaysi foydalanuvchi sifatida (/auth/me uchun).
const authenticate: RequestHandler = (req, _res, next) => {
  const uid = req.headers['x-uid'];
  if (typeof uid === 'string' && baza.has(uid)) {
    req.user = baza.get(uid);
  } else {
    const huquq: Permission[] =
      req.headers['x-rol'] === 'korish' ? ['users.view'] : ['users.view', 'users.manage', 'roles.manage'];
    req.user = { ...baza.get(ADMIN_ID)!, role: rol(huquq) };
  }
  next();
};
app.use('/api/auth', authRoutes(container, authenticate));
app.use('/api/users', authenticate, userRoutes(container));
app.use(errorHandler);

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

async function so(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const tur = res.headers.get('content-type') ?? '';
  const json = (tur.includes('json') ? await res.json() : null) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  return { status: res.status, json };
}

try {
  // ── Yaratish ──
  const c = await so('POST', '/users', {
    email: 'op@xonsaroy.uz', fullName: 'Operator', password: '12345678', roleId: ROLE_ID,
    objects: [' Vatan ', 'MUHABBAT SHAHRI', 'Vatan'],
  });
  eq('yaratish — 201', c.status, 201);
  eq('yaratishda objects repoga qirqilgan va takrorsiz', yaratishlar[0]?.objects, ['Vatan', 'MUHABBAT SHAHRI']);
  eq('yaratish javobida objects', c.json.user?.objects, ['Vatan', 'MUHABBAT SHAHRI']);
  const uid = c.json.user?.id as string;

  const c2 = await so('POST', '/users', {
    email: 'op2@xonsaroy.uz', fullName: 'Operator2', password: '12345678', roleId: ROLE_ID,
  });
  eq('objects siz yaratish — 201, bo\'sh ro\'yxat', [c2.status, c2.json.user?.objects], [201, []]);

  // ── Ro'yxat va /auth/me ──
  const l = await so('GET', '/users');
  eq('GET /users da objects', l.json.items.find((u: { id: string }) => u.id === uid)?.objects, ['Vatan', 'MUHABBAT SHAHRI']);
  const me = await so('GET', '/auth/me', undefined, { 'x-uid': uid });
  eq('/auth/me da objects', me.json.user?.objects, ['Vatan', 'MUHABBAT SHAHRI']);

  // ── Tahrirlash ──
  tozalanganlar.length = 0;
  const p = await so('PATCH', `/users/${uid}`, { objects: ['A', 'A', ' B'] });
  eq('patch — 200 va takrorsiz', [p.status, p.json.user?.objects], [200, ['A', 'B']]);
  eq('patch objects repoga boradi', tahrirlar.at(-1)?.objects, ['A', 'B']);
  eq('patchdan keyin kesh tozalandi', tozalanganlar, [uid]);
  const p2 = await so('PATCH', `/users/${uid}`, { fullName: 'Yangi Ism' });
  eq('objects siz patch — objects tegilmaydi', [p2.status, tahrirlar.at(-1)?.objects], [200, undefined]);
  const p3 = await so('PATCH', `/users/${uid}`, { objects: [] });
  eq('bo\'sh ro\'yxat — cheklov olib tashlanadi', [p3.status, p3.json.user?.objects], [200, []]);

  // ── Validatsiya ──
  eq('bo\'sh nom — 422', (await so('PATCH', `/users/${uid}`, { objects: ['  '] })).status, 422);
  eq('201 belgili nom — 422', (await so('PATCH', `/users/${uid}`, { objects: ['a'.repeat(201)] })).status, 422);
  eq('101 ta obyekt — 422',
    (await so('PATCH', `/users/${uid}`, { objects: Array.from({ length: 101 }, (_, i) => `O${i}`) })).status, 422);

  // ── Obyektlar katalogi ──
  eq('users.manage siz /obyektlar — 403', (await so('GET', '/users/obyektlar', undefined, { 'x-rol': 'korish' })).status, 403);
  const o = await so('GET', '/users/obyektlar');
  eq('/obyektlar — repo ro\'yxati', [o.status, o.json], [200, { items: ['MUHABBAT SHAHRI', 'Vatan'] }]);

  // ── Cheklangan foydalanuvchiga foydalanuvchi/rol boshqaruvi yopiq ──
  const M = { 'x-uid': CHEKLANGAN_ID };
  const yopiq = async (nom: string, method: string, path: string, body?: unknown) => {
    const r = await so(method, path, body, M);
    eq(`cheklangan: ${nom} — 403 OBYEKT_CHEKLOVI`, [r.status, r.json?.error?.code], [403, 'OBYEKT_CHEKLOVI']);
  };
  const oldin = { t: tahrirlar.length, y: yaratishlar.length, o: ochirilganlar.length, r: rolYozuvlari.length };
  await yopiq('o\'z cheklovini olib tashlash', 'PATCH', `/users/${CHEKLANGAN_ID}`, { objects: [] });
  await yopiq('boshqaning obyektlari', 'PATCH', `/users/${uid}`, { objects: ['Vatan'] });
  await yopiq('objects siz tahrir (rol/ism)', 'PATCH', `/users/${uid}`, { fullName: 'Boshqa Ism', roleId: ROLE_ID });
  await yopiq('yaratish (objects bilan)', 'POST', '/users', {
    email: 'op3@xonsaroy.uz', fullName: 'Operator3', password: '12345678', roleId: ROLE_ID, objects: ['Vatan'],
  });
  await yopiq('yaratish (objects siz)', 'POST', '/users', {
    email: 'op4@xonsaroy.uz', fullName: 'Operator4', password: '12345678', roleId: ROLE_ID,
  });
  await yopiq('o\'chirish', 'DELETE', `/users/${uid}`);
  await yopiq('blokdan chiqarish', 'POST', `/users/${uid}/unlock`);
  await yopiq('rol yaratish', 'POST', '/users/roles', { key: 'yangi', name: 'Yangi', permissions: [] });
  await yopiq('rol tahrirlash', 'PATCH', `/users/roles/${ROLE_ID}`, { name: 'Boshqa' });
  await yopiq('rol o\'chirish', 'DELETE', `/users/roles/${ROLE_ID}`);
  await yopiq('API kalit yaratish', 'POST', '/users/tokens', { name: 'Kalit', userId: ADMIN_ID });
  await yopiq('API kalit bekor qilish', 'DELETE', '/users/tokens/t1');
  eq('403 larda repo tegilmadi',
    [tahrirlar.length, yaratishlar.length, ochirilganlar.length, rolYozuvlari.length],
    [oldin.t, oldin.y, oldin.o, oldin.r]);
  eq('cheklangan menejer obyektlari joyida', baza.get(CHEKLANGAN_ID)?.objects, ['Vatan']);
  eq('cheklangan: GET /users ochiq — 200', (await so('GET', '/users', undefined, M)).status, 200);

  // ── Cheklanmagan — o'zgarishsiz ──
  const ochiq = await so('PATCH', `/users/${CHEKLANGAN_ID}`, { objects: ['Vatan', 'MUHABBAT SHAHRI'] });
  eq('cheklanmagan menejer obyektlarni o\'zgartira oladi — 200', [ochiq.status, ochiq.json.user?.objects], [200, ['Vatan', 'MUHABBAT SHAHRI']]);
  eq('cheklanmagan rol tahrirlay oladi — 200', (await so('PATCH', `/users/roles/${ROLE_ID}`, { name: 'Boshqa' })).status, 200);
  eq('cheklanmagan o\'chira oladi — 200', [(await so('DELETE', `/users/${c2.json.user?.id}`)).status, ochirilganlar.length], [200, oldin.o + 1]);

  // ── mapUser: ustun yo'q bo'lsa jimgina cheklovsiz bo'lib qolmaydi ──
  const qator = {
    id: 'u', email: 'e', password_hash: 'h', full_name: 'F', role_id: 'r', r_id: 'r', r_key: 'operator', r_name: 'O',
    r_permissions: [], r_is_system: false, r_created_at: new Date(), r_updated_at: new Date(),
    is_active: true, failed_login_attempts: 0, locked_at: null, created_at: new Date(), updated_at: new Date(),
  };
  let tashladi = false;
  try { mapUser(qator); } catch { tashladi = true; }
  eq('mapUser: objects ustuni yo\'q — xato', tashladi, true);
  eq('mapUser: objects null — []', mapUser({ ...qator, objects: null }).objects, []);
  eq('mapUser: objects massiv', mapUser({ ...qator, objects: ['A'] }).objects, ['A']);
} finally {
  server.close();
}

if (failed > 0) {
  console.log(`\n${failed} ta tekshiruv muvaffaqiyatsiz`);
  process.exit(1);
}
console.log('\nHammasi o\'tdi');
