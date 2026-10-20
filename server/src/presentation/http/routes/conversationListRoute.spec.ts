import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Container } from '@/composition/container';
import type { Permission } from '@/domain/entities/Permission';
import type { User } from '@/domain/entities/User';
import { errorHandler } from '@/presentation/http/middleware/errorHandler';
import { conversationRoutes } from '@/presentation/http/routes/conversationRoutes';

/**
 * Qo'lda ishga tushiriladi: npm run test:conversation-list-route --workspace=server
 * (CI'da soxta DATABASE_URL/JWT_SECRET/ENCRYPTION_KEY bilan — route
 * `shared/config` ni tortadi; bazaga chiqmaydi).
 *
 * `GET /conversations?clientId=` — «Talabnomalar» → «Batafsil» oynasi mijozning
 * BARCHA suhbatlarini (turli akkauntlar) shu filtr bilan oladi:
 *   • UUID — repoga boradi; UUID emas — 422 (zod; SQL'ga yetmaydi);
 *   • berilmasa — filtrsiz (avvalgi xatti-harakat).
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

const MIJOZ = '0b9a3c1e-2f4d-4a5b-8c6d-7e8f9a0b1c2d';
const soroqlar: Array<Record<string, unknown>> = [];

const container = {
  repositories: {
    conversations: {
      list: async (q: Record<string, unknown>) => {
        soroqlar.push(q);
        return { items: [], total: 0, limit: 50, offset: 0 };
      },
    },
    messages: {},
    clients: {},
    contracts: {},
    promises: {},
    audit: {},
    paymentChecks: {},
    nomalumSuhbatlar: {},
  },
  events: { publish: () => undefined },
  services: {},
  useCases: {},
} as unknown as Container;

function foydalanuvchi(permissions: Permission[]): User {
  return {
    id: '11111111-1111-4111-8111-111111111111', email: 'operator@xonsaroy.uz', passwordHash: '',
    fullName: 'Test', roleId: 'r',
    role: {
      id: 'r', key: 'r', name: 'r', description: null, permissions,
      isSystem: false, createdAt: new Date(), updatedAt: new Date(),
    },
    isActive: true, failedLoginAttempts: 0, lockedAt: null, objects: [], createdAt: new Date(), updatedAt: new Date(),
  };
}

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.user = foydalanuvchi(['conversations.view']);
  next();
});
app.use('/api/conversations', conversationRoutes(container));
app.use(errorHandler);

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/conversations`;
const so = async (path: string) => (await fetch(`${base}${path}`)).status;

try {
  eq('clientId bilan — 200', await so(`/?clientId=${MIJOZ}&limit=20`), 200);
  eq('clientId repoga boradi', [soroqlar[0]?.clientId, soroqlar[0]?.limit], [MIJOZ, 20]);
  eq('clientId siz — filtrsiz', await so('/'), 200);
  eq('… repoga clientId bormaydi', soroqlar[1]?.clientId, undefined);
  eq('clientId UUID emas — 422 (zod, boshqa filtrlar kabi)', await so('/?clientId=abc'), 422);
  eq('422 da repo chaqirilmadi', soroqlar.length, 2);
} finally {
  server.close();
}

if (failed > 0) {
  console.log(`\n${failed} ta tekshiruv muvaffaqiyatsiz`);
  process.exit(1);
}
console.log('\nHammasi o\'tdi');
