import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Container } from '@/composition/container';
import type { Permission } from '@/domain/entities/Permission';
import type { TelegramAccount } from '@/domain/entities/TelegramAccount';
import type { User } from '@/domain/entities/User';
import { errorHandler } from '@/presentation/http/middleware/errorHandler';
import { telegramRoutes } from '@/presentation/http/routes/telegramRoutes';

/**
 * Qo'lda ishga tushiriladi: npm run test:premium-marshruti --workspace=server
 *
 * Soxta foydalanuvchi usuli — `telegramUslubRoute.spec.ts` dagidek.
 */

let failed = 0;
function eq(nom: string, actual: unknown, kutilgan: unknown): void {
  const a = JSON.stringify(actual);
  const k = JSON.stringify(kutilgan);
  if (a === k) console.log(`✓ ${nom}`);
  else { failed += 1; console.log(`✗ ${nom}: ${a}  (kutilgan: ${k})`); }
}

const NOW = new Date('2026-10-09T09:00:00Z');
const account: TelegramAccount = {
  id: 'a1', label: 'Sinov', personaName: null, phone: '+998901112233', apiId: 1, apiHash: '',
  session: null, status: 'connected', statusMessage: null, tgUserId: null, tgUsername: null,
  dailyLimit: 40, sentToday: 0, lookupLimit: 50, lookupsToday: 0, counterDate: null,
  floodWaitUntil: null, floodWaitSince: null, peerFloodSince: null,
  spamStatus: 'clean', spamCheckedAt: null, spamMessage: null, spamUntil: null,
  proxy: null, isEnabled: true, styleVersion: 'v1', llmModelId: null,
  premiumUntil: null, premiumEslatildi: null, createdAt: NOW, updatedAt: NOW,
};

const yozilgan: Array<string | null> = [];
const auditYozuvlari: unknown[] = [];
const container = {
  repositories: {
    telegramAccounts: {
      findById: async (id: string) => (id === 'a1' ? account : null),
      setPremium: async (_id: string, until: string | null) => {
        yozilgan.push(until);
        return { ...account, premiumUntil: until };
      },
    },
    audit: { record: async (entry: unknown) => { auditYozuvlari.push(entry); } },
  },
  services: { telegram: { isConnected: () => true } },
  settings: { get: async () => ({ personaName: 'Madina' }) },
  clock: { todayIso: () => '2026-10-09' },
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
app.use((req, _res, next) => {
  req.user = foydalanuvchi(req.headers['x-rol'] === 'admin' ? ['telegram.manage'] : []);
  next();
});
app.use('/api/telegram', telegramRoutes(container));
app.use(errorHandler);

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/telegram`;

async function so(path: string, body: unknown, rol = 'admin'): Promise<{ status: number; json: any }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = await fetch(`${base}${path}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-rol': rol },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

try {
  const muddat = await so('/accounts/a1/premium', { boshlanish: '2026-10-09', oy: 12 });
  eq('sana + muddat qabul qilinadi', muddat.status, 200);
  eq('tugash sanasi hisoblandi', yozilgan, ['2027-10-09']);
  eq('javobda sana', muddat.json?.account?.premiumUntil, '2027-10-09');
  eq('javobda qolgan kun', muddat.json?.account?.premiumKunQoldi, 365);

  const sana = await so('/accounts/a1/premium', { until: '2027-03-01' });
  eq('aniq sana qabul qilinadi', sana.status, 200);
  eq('aniq sana yozildi', yozilgan[1], '2027-03-01');

  const yoq = await so('/accounts/a1/premium', { until: null });
  eq('null — premium olib tashlanadi', yoq.status, 200);
  eq('null yozildi', yozilgan[2], null);

  eq('mavjud bo\'lmagan sana rad etiladi', (await so('/accounts/a1/premium', { until: '2027-02-30' })).status, 422);
  eq('noto\'g\'ri format rad etiladi', (await so('/accounts/a1/premium', { until: '01.03.2027' })).status, 422);
  eq('ro\'yxatda yo\'q muddat rad etiladi', (await so('/accounts/a1/premium', { boshlanish: '2026-10-09', oy: 5 })).status, 422);
  eq('bo\'sh so\'rov rad etiladi', (await so('/accounts/a1/premium', {})).status, 422);
  eq('xato so\'rovlar bazaga yetmadi', yozilgan.length, 3);

  eq('ruxsatsiz — 403', (await so('/accounts/a1/premium', { until: null }, 'operator')).status, 403);
  eq('akkaunt yo\'q — 404', (await so('/accounts/yoq/premium', { until: null })).status, 404);

  eq('auditga yozildi', auditYozuvlari[0], {
    actor: 'admin@test',
    action: 'telegram.premium_changed',
    entity: 'telegram_account',
    entityId: 'a1',
    payload: { before: null, after: '2027-10-09' },
  });
} finally {
  server.close();
}

console.log(failed ? `${failed} ta xato` : 'Hammasi o\'tdi');
process.exit(failed ? 1 : 0);
