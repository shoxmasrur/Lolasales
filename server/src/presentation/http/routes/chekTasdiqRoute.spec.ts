import type { AddressInfo } from 'node:net';
import express from 'express';
import type { ReceiptConfirmOutcome } from '@/application/services/PaymentCheckService';
import type { Container } from '@/composition/container';
import type { Permission } from '@/domain/entities/Permission';
import type { PaymentCheck } from '@/domain/entities/PaymentCheck';
import type { User } from '@/domain/entities/User';
import { errorHandler } from '@/presentation/http/middleware/errorHandler';
import { conversationRoutes } from '@/presentation/http/routes/conversationRoutes';

/**
 * Qo'lda ishga tushiriladi: npm run test:chek-tasdiq-route --workspace=server
 * (CI'da soxta DATABASE_URL/JWT_SECRET/ENCRYPTION_KEY bilan — route
 * `shared/config` ni tortadi; bazaga chiqmaydi).
 *
 * `POST /conversations/:id/receipt-confirm`:
 *   • `conversations.send` huquqisiz — 403, servis chaqirilmaydi;
 *   • operator emaili servisga `actor` bo'lib boradi;
 *   • ochiq tekshiruv yo'q — 409 `{ kind: 'no_review' }`.
 * `GET /conversations/:id` — `receiptReview` faqat chek tekshiruvida va
 * u 7 kundan eski bo'lmasa.
 * `PATCH /conversations/:id` — suhbat yopilsa ochiq tekshiruv bekor qilinadi.
 */

let failed = 0;
function eq(nom: string, actual: unknown, kutilgan: unknown): void {
  const a = JSON.stringify(actual);
  const k = JSON.stringify(kutilgan);
  if (a === k) {
    console.log(`✓ ${nom}`);
  } else {
    failed += 1;
    console.log(`✗ ${nom}: ${a}  (kutilgan: ${k})`);
  }
}

const NOW = new Date('2026-09-17T06:00:00Z');
const chaqiruvlar: Array<{ id: string; actor: string }> = [];
const bekorlar: string[] = [];
let natija: ReceiptConfirmOutcome = { kind: 'thanked' };
let ochiqTekshiruv: Partial<PaymentCheck> | null = null;

const container = {
  clock: { now: () => NOW },
  repositories: {
    conversations: {
      findById: async (id: string) => ({ id, clientId: 'c1' }),
      update: async (id: string) => ({ id, clientId: 'c1' }),
    },
    messages: {},
    clients: { findById: async () => ({ id: 'c1' }) },
    contracts: { findByClientId: async () => [] },
    promises: { findActiveByConversation: async () => null },
    audit: { record: async () => undefined },
    telegramAccounts: { list: async () => [] },
    paymentChecks: { findOpenByConversation: async () => ochiqTekshiruv },
    nomalumSuhbatlar: { find: async () => null },
  },
  events: { publish: () => undefined },
  services: {
    agent: { abort: () => undefined },
    javobYonaltiruvchi: { abort: () => 0 },
    paymentCheckService: {
      cancel: async (id: string) => void bekorlar.push(id),
      confirmReceipt: async (id: string, actor: string) => {
        chaqiruvlar.push({ id, actor });
        return natija;
      },
    },
  },
} as unknown as Container;

function foydalanuvchi(permissions: Permission[]): User {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'operator@xonsaroy.uz',
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
// `x-rol: operator` — conversations.send bor; aks holda faqat ko'rish.
app.use((req, _res, next) => {
  req.user = foydalanuvchi(
    req.headers['x-rol'] === 'operator' ? ['conversations.view', 'conversations.send', 'conversations.manage'] : ['conversations.view'],
  );
  next();
});
app.use('/api/conversations', conversationRoutes(container));
app.use(errorHandler);

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/conversations`;

async function so(method: string, path: string, operator = true): Promise<{ status: number; json: any }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(operator ? { 'x-rol': 'operator' } : {}) },
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

try {
  const ruxsatsiz = await so('POST', '/cv1/receipt-confirm', false);
  eq('huquqsiz — 403', ruxsatsiz.status, 403);
  eq('huquqsiz — servis chaqirilmadi', chaqiruvlar.length, 0);

  const ok = await so('POST', '/cv1/receipt-confirm');
  eq('tasdiq — 200 va natija', [ok.status, ok.json], [200, { kind: 'thanked' }]);
  eq('operator emaili actor bo\'lib bordi', chaqiruvlar[0], { id: 'cv1', actor: 'operator@xonsaroy.uz' });

  natija = { kind: 'not_sent', reason: 'agent_error' };
  const yozilmadi = await so('POST', '/cv1/receipt-confirm');
  eq('rahmat ketmadi — 200, sabab bilan', [yozilmadi.status, yozilmadi.json], [200, { kind: 'not_sent', reason: 'agent_error' }]);

  natija = { kind: 'no_review' };
  const yoq = await so('POST', '/cv1/receipt-confirm');
  eq('ochiq tekshiruv yo\'q — 409', [yoq.status, yoq.json], [409, { kind: 'no_review' }]);

  ochiqTekshiruv = { id: 'pc1', kind: 'receipt_review', messageId: 'm1', createdAt: NOW };
  const bor = await so('GET', '/cv1', false);
  eq('GET: receiptReview', bor.json?.receiptReview, { id: 'pc1', messageId: 'm1', createdAt: NOW.toISOString() });

  ochiqTekshiruv = { id: 'pc2', kind: 'crm_watch', messageId: null, createdAt: NOW };
  const davo = await so('GET', '/cv1', false);
  eq('GET: da\'vo kuzatuvida receiptReview null', davo.json?.receiptReview, null);

  ochiqTekshiruv = null;
  const hech = await so('GET', '/cv1', false);
  eq('GET: tekshiruv yo\'q — null', hech.json?.receiptReview, null);

  const olti = new Date(NOW.getTime() - 6 * 24 * 60 * 60 * 1000);
  ochiqTekshiruv = { id: 'pc3', kind: 'receipt_review', status: 'reviewing', messageId: 'm3', createdAt: olti };
  const yosh = await so('GET', '/cv1', false);
  eq('GET: 6 kunlik tekshiruv — tugma bor', yosh.json?.receiptReview?.id, 'pc3');

  ochiqTekshiruv = {
    id: 'pc4',
    kind: 'receipt_review',
    status: 'reviewing',
    messageId: 'm4',
    createdAt: new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000),
  };
  const eski = await so('GET', '/cv1', false);
  eq('GET: 7 kundan eski tekshiruv — tugma yo\'q', eski.json?.receiptReview, null);

  async function patch(body: unknown): Promise<number> {
    const res = await fetch(`${base}/cv1`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-rol': 'operator' },
      body: JSON.stringify(body),
    });
    return res.status;
  }

  eq('PATCH: holat o\'zgardi — 200', await patch({ state: 'negotiating' }), 200);
  eq('PATCH: yopilmagan suhbatda tekshiruv bekor qilinmaydi', bekorlar, []);
  eq('PATCH: suhbat yopildi — 200', await patch({ state: 'closed' }), 200);
  eq('PATCH: yopilgan suhbatda tekshiruv bekor qilindi', bekorlar, ['cv1']);
} finally {
  server.close();
}

console.log(failed === 0 ? '\nHammasi o\'tdi' : `\n${failed} ta test yiqildi`);
process.exit(failed === 0 ? 0 : 1);
