import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Container } from '@/composition/container';
import type { Permission } from '@/domain/entities/Permission';
import type { TelegramAccount } from '@/domain/entities/TelegramAccount';
import type { User } from '@/domain/entities/User';
import { errorHandler } from '@/presentation/http/middleware/errorHandler';
import { telegramRoutes } from '@/presentation/http/routes/telegramRoutes';

/**
 * Qo'lda ishga tushiriladi: npm run test:uslub-marshruti --workspace=server
 *
 * NEGA BU TEST KERAK: uslub maydoni mijozga ko'rinadigan ohangni
 * almashtiradi. Noto'g'ri qiymat bazaga tushsa, akkaunt qaysi qoidalar
 * bilan yozishi noaniq bo'lib qoladi.
 *
 * NEGA soxta foydalanuvchi shunday tuzilgan: `telegramRoutes` PATCH
 * yo'lini `requirePermission('telegram.manage')` bilan himoya qiladi —
 * u `req.user` dan o'qiydi (`AuthContext.require`, token yoki API
 * kalitdan mustaqil). Shuning uchun `recontactTopicRoutes.spec.ts` dagi
 * kabi haqiqiy avtorizatsiyani aylanib o'tib, `x-rol: admin`
 * sarlavhasini o'qiydigan soxta middleware bilan `req.user` to'g'ridan
 * to'g'ri o'rnatiladi.
 */

let failed = 0;
function eq(nom: string, actual: unknown, kutilgan: unknown): void {
  const a = JSON.stringify(actual);
  const k = JSON.stringify(kutilgan);
  if (a === k) console.log(`✓ ${nom}`);
  else { failed += 1; console.log(`✗ ${nom}: ${a}  (kutilgan: ${k})`); }
}

const NOW = new Date('2026-09-28T09:00:00Z');
const account: TelegramAccount = {
  id: 'a1', label: 'Sinov', personaName: null, phone: '+998901112233', apiId: 1, apiHash: '',
  session: null, status: 'connected', statusMessage: null, tgUserId: null, tgUsername: null,
  dailyLimit: 40, sentToday: 0, lookupLimit: 50, lookupsToday: 0, counterDate: null,
  floodWaitUntil: null, floodWaitSince: null, peerFloodSince: null,
  spamStatus: 'clean', spamCheckedAt: null, spamMessage: null, spamUntil: null,
  proxy: null, isEnabled: true, styleVersion: 'v1', llmModelId: null, premiumUntil: null, premiumEslatildi: null, createdAt: NOW, updatedAt: NOW,
};

const yozilgan: unknown[] = [];
const auditYozuvlari: unknown[] = [];
const container = {
  repositories: {
    telegramAccounts: {
      list: async () => [account],
      findById: async () => account,
      update: async (_id: string, patch: unknown) => {
        yozilgan.push(patch);
        return { ...account, ...(patch as object) } as TelegramAccount;
      },
    },
    audit: { record: async (entry: unknown) => { auditYozuvlari.push(entry); } },
    clients: { countConversationClientsByAccount: async () => [{ accountId: 'a1', count: 7 }] },
  },
  services: { telegram: { isConnected: () => true } },
  settings: { get: async () => ({ personaName: 'Madina' }) },
  clock: { todayIso: () => '2026-09-28' },
} as unknown as Container;

function foydalanuvchi(permissions: Permission[]): User {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: permissions.length ? 'admin@test' : 'operator@test',
    passwordHash: '',
    fullName: 'Test',
    roleId: 'r',
    role: {
      id: 'r', key: 'r', name: 'r', description: null, permissions,
      isSystem: false, createdAt: new Date(), updatedAt: new Date(),
    },
    isActive: true,
    failedLoginAttempts: 0,
    lockedAt: null, objects: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const app = express();
app.use(express.json());
// `x-rol: admin` — telegram.manage bor; aks holda oddiy operator
// (recontactTopicRoutes.spec.ts dagi usul).
app.use((req, _res, next) => {
  req.user = foydalanuvchi(req.headers['x-rol'] === 'admin' ? ['telegram.manage'] : []);
  next();
});
app.use('/api/telegram', telegramRoutes(container));
app.use(errorHandler);

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/telegram`;

async function so(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-rol': 'admin' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

try {
  const ok = await so('PATCH', '/accounts/a1', { styleVersion: 'v2' });
  eq('v2 qabul qilinadi', ok.status, 200);
  eq('repozitoriyga v2 yetib bordi', yozilgan, [{ styleVersion: 'v2' }]);

  const yomon = await so('PATCH', '/accounts/a1', { styleVersion: 'v3' });
  eq('v3 rad etiladi', yomon.status, 422);
  eq('xato qiymat bazaga yetmadi', yozilgan.length, 1);

  const royxat = await so('GET', '/accounts');
  eq('javobda styleVersion bor', royxat.json?.items?.[0]?.styleVersion, 'v1');
  // «Suhbatni boshlash» oynasi har akkaunt oldida shu sonni ko'rsatadi.
  eq('javobda suhbatdagi mijozlar soni', royxat.json?.items?.[0]?.conversationClients, 7);

  // Topilma 5: uslub almashtirish audit jurnaliga tushishi kerak — bu
  // akkauntdagi HAMMA mijozga yuboriladigan ohangni o'zgartiradi.
  eq('uslub almashtirish auditga yozildi', auditYozuvlari, [
    {
      actor: 'admin@test',
      action: 'telegram.style_changed',
      entity: 'telegram_account',
      entityId: 'a1',
      payload: { before: 'v1', after: 'v2' },
    },
  ]);

  // findById har doim statik `account` (styleVersion 'v1') qaytaradi, shuning
  // uchun 'v1' bilan qayta PATCH qilish "o'zgarish yo'q" holatini taqlid
  // qiladi — audit qo'shimcha yozuv qo'shmasligi kerak.
  await so('PATCH', '/accounts/a1', { styleVersion: 'v1' });
  eq('o\'zgarmagan uslub audit yozmaydi', auditYozuvlari.length, 1);
} finally {
  server.close();
}

console.log(failed ? `${failed} ta xato` : 'Hammasi o\'tdi');
process.exit(failed ? 1 : 0);
