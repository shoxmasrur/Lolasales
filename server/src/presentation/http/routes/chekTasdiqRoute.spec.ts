import type { AddressInfo } from 'node:net';
import express from 'express';
import type { ReceiptConfirmOutcome, ReceiptDismissOutcome, ReceiptRejectOutcome, SendLinkOutcome } from '@/application/services/PaymentCheckService';
import type { KartaNatijasi } from '@/application/services/KartaYuboruvchi';
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
 * `POST /conversations/:id/receipt-confirm` (body `{ amount }`, > 0) va
 * `POST /conversations/:id/receipt-reject` (body `{ reason }`, 1–300):
 *   • `receipts.confirm` huquqisiz — 403, servis chaqirilmaydi;
 *   • noto'g'ri body — 422, servis chaqirilmaydi;
 *   • operator emaili servisga `actor` bo'lib boradi, summa/sabab bilan;
 *   • ochiq tekshiruv yo'q — 409 `{ kind: 'no_review' }`.
 * `GET /conversations/:id` — `receiptReview` (kutilgan summa bilan) faqat
 * ochiq tekshiruvda va u 7 kundan eski bo'lmasa.
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
const chaqiruvlar: Array<{ id: string; actor: string; amount: number }> = [];
const radlar: Array<{ id: string; actor: string; reason: string }> = [];
const bekorlar: string[] = [];
let natija: ReceiptConfirmOutcome = { kind: 'confirmed', stage: 'qisman_toladi', linkSent: true };
let radNatija: ReceiptRejectOutcome = { kind: 'rejected' };
let havolaNatija: SendLinkOutcome = { kind: 'sent' };
const havolalar: string[] = [];
let ochiqTekshiruv: Partial<PaymentCheck> | null = null;
const chekEmaslar: Array<{ id: string; actor: string }> = [];
let chekEmasNatija: ReceiptDismissOutcome = { kind: 'dismissed', restoredStage: 'karta_yuborildi' };
const kartalar: Array<{ id: string; clientId: string }> = [];
let kartaNatija: KartaNatijasi | Error = { sent: true };
let suhbatQoshimcha: Record<string, unknown> = {};
let joriyXarid: Record<string, unknown> | null = null;

const container = {
  clock: { now: () => NOW },
  repositories: {
    conversations: {
      findById: async (id: string) => (id === 'yoq' ? null : { id, clientId: 'c1', ...suhbatQoshimcha }),
      update: async (id: string) => ({ id, clientId: 'c1' }),
    },
    messages: {},
    clients: { findById: async () => ({ id: 'c1' }) },
    audit: { record: async () => undefined },
    telegramAccounts: { list: async () => [] },
    paymentChecks: { findOpenByConversation: async () => ochiqTekshiruv },
    purchases: {
      findById: async (id: string) =>
        id === 'p1' ? { id: 'p1', courseId: 'k1', totalAmount: 1_500_000, paidAmount: 500_000, installment: true } : null,
      findActiveByClient: async () => joriyXarid,
      findLatestByClient: async () => null,
    },
    courses: { findById: async () => ({ id: 'k1', price: 1_500_000, installmentFirstMin: 500_000 }) },
  },
  events: { publish: () => undefined },
  services: {
    agent: { abort: () => undefined },
    kartaYuboruvchi: {
      yubor: async (id: string, clientId: string) => {
        kartalar.push({ id, clientId });
        if (kartaNatija instanceof Error) throw kartaNatija;
        return kartaNatija;
      },
    },
    javobYonaltiruvchi: { abort: () => 0 },
    paymentCheckService: {
      havolaKutyaptimi: async () => true,
      sendLink: async (id: string) => {
        havolalar.push(id);
        return havolaNatija;
      },
      cancel: async (id: string) => void bekorlar.push(id),
      confirmReceipt: async (id: string, actor: string, amount: number) => {
        chaqiruvlar.push({ id, actor, amount });
        return natija;
      },
      dismissReceipt: async (id: string, actor: string) => {
        chekEmaslar.push({ id, actor });
        return chekEmasNatija;
      },
      rejectReceipt: async (id: string, actor: string, reason: string) => {
        radlar.push({ id, actor, reason });
        return radNatija;
      },
    },
  },
} as unknown as Container;

function foydalanuvchi(permissions: Permission[]): User {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'operator@lolasales.uz',
    passwordHash: '',
    fullName: 'Test',
    roleId: 'r',
    role: {
      id: 'r', key: 'r', name: 'r', description: null, permissions,
      isSystem: false, createdAt: new Date(), updatedAt: new Date(),
    },
    isActive: true,
    failedLoginAttempts: 0,
    lockedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const app = express();
app.use(express.json());
// `x-rol: operator` — conversations.send bor; aks holda faqat ko'rish.
app.use((req, _res, next) => {
  req.user = foydalanuvchi(
    req.headers['x-rol'] === 'operator'
      ? ['conversations.view', 'conversations.send', 'conversations.manage', 'receipts.confirm']
      : ['conversations.view', 'conversations.send'],
  );
  next();
});
app.use('/api/conversations', conversationRoutes(container));
app.use(errorHandler);

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/conversations`;

async function so(method: string, path: string, operator = true, body?: unknown): Promise<{ status: number; json: any }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(operator ? { 'x-rol': 'operator' } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

try {
  const ruxsatsiz = await so('POST', '/cv1/receipt-confirm', false, { amount: 500000 });
  eq('huquqsiz (conversations.send bor, receipts.confirm yo\'q) — 403', ruxsatsiz.status, 403);
  eq('huquqsiz — servis chaqirilmadi', chaqiruvlar.length, 0);

  for (const body of [{}, { amount: 0 }, { amount: -5 }, { amount: '500000' }, { amount: 1.5 }]) {
    const yomon = await so('POST', '/cv1/receipt-confirm', true, body);
    eq(`noto'g'ri summa ${JSON.stringify(body)} — 422`, yomon.status, 422);
  }
  eq('noto\'g\'ri summa — servis chaqirilmadi', chaqiruvlar.length, 0);

  const ok = await so('POST', '/cv1/receipt-confirm', true, { amount: 500000 });
  eq('tasdiq — 200 va natija', [ok.status, ok.json], [200, { kind: 'confirmed', stage: 'qisman_toladi', linkSent: true }]);
  eq('operator emaili va summa servisga bordi', chaqiruvlar[0], { id: 'cv1', actor: 'operator@lolasales.uz', amount: 500000 });

  natija = { kind: 'not_sent', reason: 'agent_error', stage: 'qisman_toladi', linkSent: false };
  const yozilmadi = await so('POST', '/cv1/receipt-confirm', true, { amount: 500000 });
  eq('rahmat ketmadi — 200, sabab bilan', [yozilmadi.status, yozilmadi.json], [200, { kind: 'not_sent', reason: 'agent_error', stage: 'qisman_toladi', linkSent: false }]);

  natija = { kind: 'needs_human', reason: 'yakunlangan_xarid', stage: 'toladi' };
  const qolda = await so('POST', '/cv1/receipt-confirm', true, { amount: 500000 });
  eq('yakunlangan xarid — 200 needs_human', [qolda.status, qolda.json?.kind], [200, 'needs_human']);

  natija = { kind: 'no_review' };
  const yoq = await so('POST', '/cv1/receipt-confirm', true, { amount: 500000 });
  eq('ochiq tekshiruv yo\'q — 409', [yoq.status, yoq.json], [409, { kind: 'no_review' }]);

  // ── Rad etish ──
  eq('rad: huquqsiz — 403', (await so('POST', '/cv1/receipt-reject', false, { reason: 'xira' })).status, 403);
  eq('rad: bo\'sh sabab — 422', (await so('POST', '/cv1/receipt-reject', true, { reason: '   ' })).status, 422);
  eq('rad: 301 belgi — 422', (await so('POST', '/cv1/receipt-reject', true, { reason: 'x'.repeat(301) })).status, 422);
  eq('rad: servis chaqirilmadi', radlar.length, 0);
  const rad = await so('POST', '/cv1/receipt-reject', true, { reason: '  Chek xira  ' });
  eq('rad: 200', [rad.status, rad.json], [200, { kind: 'rejected' }]);
  eq('rad: sabab qirqilib bordi', radlar[0], { id: 'cv1', actor: 'operator@lolasales.uz', reason: 'Chek xira' });
  radNatija = { kind: 'no_review' };
  eq('rad: tekshiruv yo\'q — 409', (await so('POST', '/cv1/receipt-reject', true, { reason: 'x' })).status, 409);

  // ── Havolani qayta yuborish ──
  eq('havola: huquqsiz — 403', (await so('POST', '/cv1/send-link', false)).status, 403);
  eq('havola: servis chaqirilmadi', havolalar.length, 0);
  const hv = await so('POST', '/cv1/send-link');
  eq('havola: 200 sent', [hv.status, hv.json], [200, { kind: 'sent' }]);
  havolaNatija = { kind: 'already_sent' };
  const hv2 = await so('POST', '/cv1/send-link');
  eq('havola: allaqachon — 200, natija tanada', [hv2.status, hv2.json], [200, { kind: 'already_sent' }]);

  // ── Chek emas ──
  eq('chek emas: huquqsiz — 403', (await so('POST', '/cv1/receipt-dismiss', false)).status, 403);
  eq('chek emas: servis chaqirilmadi', chekEmaslar.length, 0);
  const ce = await so('POST', '/cv1/receipt-dismiss');
  eq('chek emas: 200 va natija', [ce.status, ce.json], [200, { kind: 'dismissed', restoredStage: 'karta_yuborildi' }]);
  eq('chek emas: operator emaili servisga', chekEmaslar[0], { id: 'cv1', actor: 'operator@lolasales.uz' });
  chekEmasNatija = { kind: 'no_review' };
  eq('chek emas: tekshiruv yo\'q — 409', (await so('POST', '/cv1/receipt-dismiss')).status, 409);

  // ── Kartani yuborish ──
  eq('karta: huquqsiz — 403', (await so('POST', '/cv1/send-card', false)).status, 403);
  eq('karta: servis chaqirilmadi', kartalar.length, 0);
  const k1 = await so('POST', '/cv1/send-card');
  eq('karta: 200 sent', [k1.status, k1.json], [200, { kind: 'sent' }]);
  eq('karta: suhbat va mijoz servisga', kartalar[0], { id: 'cv1', clientId: 'c1' });
  kartaNatija = { sent: false, reason: 'kurs_yoq' };
  const k2 = await so('POST', '/cv1/send-card');
  eq('karta: kurs yo\'q — 200, sabab tanada', [k2.status, k2.json], [200, { kind: 'not_sent', reason: 'kurs_yoq' }]);
  kartaNatija = new Error('Kill switch yoqilgan');
  const k3 = await so('POST', '/cv1/send-card');
  eq('karta: yuborishda xato — 200 failed', [k3.status, k3.json?.kind], [200, 'failed']);
  eq('karta: suhbat yo\'q — 404', (await so('POST', '/yoq/send-card')).status, 404);

  eq('GET: cardPending — oddiy holatda false', (await so('GET', '/cv1', false)).json?.cardPending, false);
  suhbatQoshimcha = { needsHuman: true, humanReason: "Mijoz to'lashga rozi — kartani yuboring" };
  eq('GET: cardPending — "kartani yuboring" sababi', (await so('GET', '/cv1', false)).json?.cardPending, true);
  suhbatQoshimcha = {};
  joriyXarid = { id: 'p1', stage: 'qiziqdi' };
  eq('GET: cardPending — qiziqdi bosqichi', (await so('GET', '/cv1', false)).json?.cardPending, true);
  joriyXarid = null;

  eq('check-payment endi yo\'q — 404', (await so('POST', '/cv1/check-payment')).status, 404);

  ochiqTekshiruv = { id: 'pc1', kind: 'receipt_review', clientId: 'c1', purchaseId: 'p1', messageId: 'm1', createdAt: NOW };
  const bor = await so('GET', '/cv1', false);
  eq('GET: linkPending servisdan', bor.json?.linkPending, true);
  eq('GET: receiptReview kutilgan summa bilan', bor.json?.receiptReview, {
    id: 'pc1', messageId: 'm1', createdAt: NOW.toISOString(), expectedAmount: 1_000_000,
  });

  ochiqTekshiruv = null;
  const hech = await so('GET', '/cv1', false);
  eq('GET: tekshiruv yo\'q — null', hech.json?.receiptReview, null);

  const olti = new Date(NOW.getTime() - 6 * 24 * 60 * 60 * 1000);
  ochiqTekshiruv = { id: 'pc3', kind: 'receipt_review', status: 'reviewing', clientId: 'c1', purchaseId: null, messageId: 'm3', createdAt: olti };
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

  eq('PATCH: holat o\'zgardi — 200', await patch({ state: 'active' }), 200);
  eq('PATCH: yopilmagan suhbatda tekshiruv bekor qilinmaydi', bekorlar, []);
  eq('PATCH: suhbat yopildi — 200', await patch({ state: 'closed' }), 200);
  eq('PATCH: yopilgan suhbatda tekshiruv bekor qilindi', bekorlar, ['cv1']);
} finally {
  server.close();
}

console.log(failed === 0 ? '\nHammasi o\'tdi' : `\n${failed} ta test yiqildi`);
process.exit(failed === 0 ? 0 : 1);
