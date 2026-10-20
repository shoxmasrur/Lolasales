import { PaymentCheckService } from '@/application/services/PaymentCheckService';
import type { Conversation } from '@/domain/entities/Conversation';
import type { PaymentCheck } from '@/domain/entities/PaymentCheck';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IContractPaymentRepository } from '@/domain/repositories/IContractPaymentRepository';
import type { IPaymentCheckRepository } from '@/domain/repositories/IPaymentCheckRepository';
import type { IPaymentPromiseRepository } from '@/domain/repositories/IPaymentPromiseRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IClock, IEventBus } from '@/domain/services/support';
import type { AgentRunner } from '@/application/services/AgentRunner';
import type { ContractSyncService } from '@/application/services/ContractSyncService';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';

/**
 * Qo'lda ishga tushiriladi: npm run test:payment-check --workspace=server
 *
 * Bazaga ham, CRM'ga ham chiqmaydi.
 *
 * Eng qimmat ikki xato:
 *   1. To'lov kelmaganda "keldi" deb rahmat aytish — mijoz keyin
 *      to'lamaydi va biz uni butunlay yo'qotamiz.
 *   2. Bir to'lov uchun IKKI marta rahmat aytish — ochiq va'da bo'lsa
 *      `PromiseWatcher` ham rahmat aytadi.
 */
const NOW = new Date('2026-08-10T09:00:00Z');

let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  ${izoh}`}`);
};

interface Muhit {
  service: PaymentCheckService;
  yopilgan: Array<{ status: string; amount: number | null }>;
  rahmatlar: number;
  eskalatsiya: string[];
  /** `cancel()`, `open()` va `confirmByOperator()` chaqiruvlari soni. */
  bekorlar: number;
  ochilganlar: number;
  tasdiqlar: number;
}

function build(opts: {
  /** Tekshiruvdan keyingi yig'indi (baseline = 1 000 000). */
  paidNow: number;
  /** Kuzatuv muddati tugaganmi. */
  expired?: boolean;
  /** Ochiq va'da bormi — bo'lsa rahmatni PromiseWatcher aytadi. */
  hasPromise?: boolean;
  agentReplies?: boolean;
  /** Suhbatda shu `created_at` bilan ochiq `tolov` chek tekshiruvi turibdi. */
  chekYaratilgan?: Date;
}): Muhit {
  const yopilgan: Array<{ status: string; amount: number | null }> = [];
  const eskalatsiya: string[] = [];
  let rahmatlar = 0;

  const open: PaymentCheck = {
    id: 'pc1',
    conversationId: 'cv1',
    clientId: 'c1',
    contractId: 'ct1',
    messageId: 'm1',
    kind: 'crm_watch',
    status: 'watching',
    receiptSource: null,
    sinceIso: '2026-08-03',
    baselinePaid: 1_000_000,
    foundAmount: null,
    foundType: null,
    watchUntil: opts.expired
      ? new Date('2026-08-10T08:00:00Z')
      : new Date('2026-08-11T09:00:00Z'),
    checkedAt: null,
    acknowledgedAt: null,
    thanksSentAt: null,
    confirmedBy: null,
    confirmedAt: null,
    createdAt: new Date('2026-08-10T08:00:00Z'),
  };

  const chek: PaymentCheck | null = opts.chekYaratilgan
    ? {
        ...open,
        id: 'pc0',
        kind: 'receipt_review',
        status: 'reviewing',
        receiptSource: 'tolov',
        baselinePaid: 0,
        watchUntil: null,
        createdAt: opts.chekYaratilgan,
      }
    : null;
  let ochiq: PaymentCheck | null = chek ?? open;
  let bekorlar = 0;
  let ochilganlar = 0;
  let tasdiqlar = 0;

  const checks = {
    findOpenByConversation: async () => ochiq,
    open: async () => {
      ochilganlar += 1;
      ochiq = open;
      return open;
    },
    confirmByOperator: async () => {
      tasdiqlar += 1;
      return false;
    },
    findDue: async () => [open],
    touch: async () => undefined,
    close: async (_id: string, r: { status: string; foundAmount: number | null }) => {
      yopilgan.push({ status: r.status, amount: r.foundAmount });
    },
    cancel: async () => {
      bekorlar += 1;
      ochiq = null;
    },
    findOperatorConfirmedSince: async () => null,
    markThanksSent: async () => undefined,
  } as unknown as IPaymentCheckRepository;

  const conversations = {
    findById: async () =>
      ({
        id: 'cv1',
        clientId: 'c1',
        agentEnabled: opts.agentReplies !== false,
        needsHuman: false,
        state: 'negotiating',
      }) as unknown as Conversation,
    update: async (_id: string, patch: { humanReason?: string | null }) => {
      if (patch.humanReason) eskalatsiya.push(patch.humanReason);
      return {} as Conversation;
    },
  } as unknown as IConversationRepository;

  const contracts = {
    findByClientId: async () => [
      { id: 'ct1', virtualStatus: 'sold', debtFirst: 0, debtMonthly: 5_000_000 },
    ],
    findById: async () => ({ id: 'ct1', debtFirst: 0, debtMonthly: 5_000_000 }),
  } as unknown as IContractRepository;

  const payments = {
    sumPaidSince: async () => opts.paidNow,
    listRecentPayments: async () => [
      { dateIso: '2026-08-10', amount: 3_000_000, paymentType: 'xonpay' },
    ],
  } as unknown as IContractPaymentRepository;

  const promises = {
    findActiveByConversation: async () => (opts.hasPromise ? { id: 'p1' } : null),
  } as unknown as IPaymentPromiseRepository;

  const agent = {
    paymentThanks: async () => {
      rahmatlar += 1;
      return { sent: true, reply: 'rahmat', escalated: false, cardSent: false };
    },
  } as unknown as AgentRunner;

  const service = new PaymentCheckService(
    checks,
    conversations,
    contracts,
    payments,
    promises,
    { syncOne: async () => ({ outcome: 'ok' }) } as unknown as ContractSyncService,
    agent,
    { record: async () => undefined } as unknown as IAuditRepository,
    { publish: () => undefined } as unknown as IEventBus,
    { now: () => NOW, todayIso: () => '2026-08-10' } as unknown as IClock,
    { get: async () => ({ killSwitch: false }) } as unknown as RuntimeSettings,
  );

  const muhit: Muhit = { service, yopilgan, rahmatlar: 0, eskalatsiya, bekorlar: 0, ochilganlar: 0, tasdiqlar: 0 };
  Object.defineProperty(muhit, 'rahmatlar', { get: () => rahmatlar });
  Object.defineProperty(muhit, 'bekorlar', { get: () => bekorlar });
  Object.defineProperty(muhit, 'ochilganlar', { get: () => ochilganlar });
  Object.defineProperty(muhit, 'tasdiqlar', { get: () => tasdiqlar });
  return muhit;
}

// ─── To'lov topildi ──────────────────────────────────────────────────────
{
  const m = build({ paidNow: 4_000_000 });
  const out = await m.service.checkNow('cv1');
  check('yangi to\'lov topildi', out.kind === 'confirmed', out.kind);
  check(
    'yangi pul = hozirgi − boshlang\'ich',
    out.kind === 'confirmed' && out.amount === 3_000_000,
    JSON.stringify(out),
  );
  check('kanal aniqlandi', out.kind === 'confirmed' && out.paymentType === 'xonpay');
  check('tekshiruv yopildi', m.yopilgan[0]?.status === 'confirmed');
  // Sotuv agentida to'lov faqat menejer tasdig'i bilan qabul qilinadi —
  // CRM kuzatuvi rahmat YOZMAYDI (`crm_watch` 10-vazifada o'chiriladi).
  check('CRM kuzatuvi rahmat yozmadi', m.rahmatlar === 0 && out.kind === 'confirmed' && !out.thanked, String(m.rahmatlar));
}

// ─── Ochiq va'da bor — rahmatni PromiseWatcher aytadi ────────────────────
{
  const m = build({ paidNow: 4_000_000, hasPromise: true });
  const out = await m.service.checkNow('cv1');
  check('to\'lov baribir tasdiqlandi', out.kind === 'confirmed');
  check(
    'va\'da bor — bu yerdan rahmat YUBORILMADI',
    m.rahmatlar === 0 && out.kind === 'confirmed' && !out.thanked,
    String(m.rahmatlar),
  );
}

// ─── Hali ko'rinmadi ─────────────────────────────────────────────────────
{
  const m = build({ paidNow: 1_000_000 });
  const out = await m.service.checkNow('cv1');
  check('o\'zgarish yo\'q — kuzatuv davom etadi', out.kind === 'watching', out.kind);
  check('tekshiruv yopilmadi', m.yopilgan.length === 0);
  check('rahmat aytilmadi', m.rahmatlar === 0);
  check('operator chaqirilmadi', m.eskalatsiya.length === 0);
}

// Yig'indi KAMAYSA ham "to'lov keldi" deb hisoblanmasligi kerak: CRM'da
// bahsli to'lov olib tashlangan bo'lishi mumkin.
{
  const m = build({ paidNow: 500_000 });
  const out = await m.service.checkNow('cv1');
  check('yig\'indi kamaydi — tasdiqlanmadi', out.kind === 'watching', out.kind);
  check('rahmat aytilmadi', m.rahmatlar === 0);
}

// ─── Muddat tugadi ───────────────────────────────────────────────────────
{
  const m = build({ paidNow: 1_000_000, expired: true });
  const out = await m.service.checkNow('cv1');
  check('bir kundan keyin — topilmadi', out.kind === 'not_found', out.kind);
  check('tekshiruv yopildi', m.yopilgan[0]?.status === 'not_found');
  check('operator chaqirildi', m.eskalatsiya.length === 1, m.eskalatsiya.join());
  check('rahmat aytilmadi', m.rahmatlar === 0);
}

// Muddat tugagan bo'lsa ham, to'lov kelgan bo'lsa RAHMAT ustun turadi.
{
  const m = build({ paidNow: 4_000_000, expired: true });
  const out = await m.service.checkNow('cv1');
  check('muddat tugadi, lekin pul keldi — tasdiqlandi', out.kind === 'confirmed', out.kind);
  check('operator chaqirilmadi', m.eskalatsiya.length === 0);
}

// ─── Agent o'chirilgan suhbat ────────────────────────────────────────────
{
  const m = build({ paidNow: 4_000_000, agentReplies: false });
  const out = await m.service.checkNow('cv1');
  check('to\'lov qayd etildi', out.kind === 'confirmed');
  check(
    'agent o\'chirilgan — xabar yozilmadi',
    m.rahmatlar === 0 && out.kind === 'confirmed' && !out.thanked,
  );
}

// ─── Chek tekshiruvi ochiq: 7 kunlik muddat ──────────────────────────────
// Muddati o'tgan tekshiruv tugmasiz qolgan (tugma yashirilgan) — u da'vo
// kuzatuvini ham, "To'lovni tekshirish" ni ham to'smasligi kerak.
const KUN = 24 * 60 * 60 * 1000;
const ESKI_CHEK = new Date(NOW.getTime() - 8 * KUN);
const YOSH_CHEK = new Date(NOW.getTime() - 6 * KUN);

{
  const m = build({ paidNow: 1_000_000, chekYaratilgan: ESKI_CHEK });
  const out = await m.service.open('cv1', null);
  check('eski chek + "to\'ladim": eski tekshiruv bekor qilindi', m.bekorlar === 1, String(m.bekorlar));
  check('eski chek + "to\'ladim": crm_watch ochildi', m.ochilganlar === 1 && out.kind === 'watching', JSON.stringify(out));
}

{
  const m = build({ paidNow: 1_000_000, chekYaratilgan: YOSH_CHEK });
  const out = await m.service.open('cv1', null);
  check(
    'yosh chek + "to\'ladim": kuzatuv ochilmaydi',
    out.kind === 'unavailable' && m.ochilganlar === 0 && m.bekorlar === 0,
    JSON.stringify(out),
  );
}

{
  const m = build({ paidNow: 4_000_000, chekYaratilgan: ESKI_CHEK });
  const out = await m.service.checkNow('cv1');
  check('eski chek + tugma: CRM tekshirildi', out.kind === 'confirmed', JSON.stringify(out));
  check('eski chek + tugma: eski tekshiruv bekor qilindi', m.bekorlar === 1, String(m.bekorlar));
}

{
  const m = build({ paidNow: 4_000_000, chekYaratilgan: YOSH_CHEK });
  const out = await m.service.checkNow('cv1');
  check(
    'yosh chek + tugma: "To\'lov qabul qilindi" ga yo\'naltiriladi',
    out.kind === 'unavailable' && out.reason.includes('To\'lov qabul qilindi') && m.bekorlar === 0,
    JSON.stringify(out),
  );
}

{
  const m = build({ paidNow: 1_000_000, chekYaratilgan: ESKI_CHEK });
  const out = await m.service.confirmReceipt('cv1', 'operator@xonsaroy.uz');
  check('eski chekni tasdiqlash: no_review', out.kind === 'no_review', JSON.stringify(out));
  check('eski chekni tasdiqlash: yozuvga tegilmadi', m.tasdiqlar === 0, String(m.tasdiqlar));
}

{
  const m = build({ paidNow: 1_000_000, chekYaratilgan: YOSH_CHEK });
  await m.service.confirmReceipt('cv1', 'operator@xonsaroy.uz');
  check('yosh chekni tasdiqlash: tasdiq urinildi', m.tasdiqlar === 1, String(m.tasdiqlar));
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
