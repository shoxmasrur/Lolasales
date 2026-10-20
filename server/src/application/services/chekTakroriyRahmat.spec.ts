import { PromiseWatcher } from '@/application/services/PromiseWatcher';
import { PaymentCheckService } from '@/application/services/PaymentCheckService';
import type { AccountLabels } from '@/application/services/AccountLabels';
import type { AgentRunner } from '@/application/services/AgentRunner';
import type { ContractSyncService } from '@/application/services/ContractSyncService';
import type { OutreachSettings, RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { Conversation } from '@/domain/entities/Conversation';
import type { PaymentCheck } from '@/domain/entities/PaymentCheck';
import type { PaymentPromise } from '@/domain/entities/PaymentPromise';
import type { IContractPaymentRepository } from '@/domain/repositories/IContractPaymentRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IHolidayRepository } from '@/domain/repositories/IHolidayRepository';
import type { IPaymentCheckRepository } from '@/domain/repositories/IPaymentCheckRepository';
import type { IPaymentPromiseRepository } from '@/domain/repositories/IPaymentPromiseRepository';
import type { AuditEntry, IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IClock, IEventBus } from '@/domain/services/support';

/**
 * Qo'lda ishga tushiriladi: npm run test:chek-takroriy-rahmat --workspace=server
 * (CI'da soxta DATABASE_URL/JWT_SECRET/ENCRYPTION_KEY bilan — bazaga ham,
 * CRM'ga ham chiqmaydi).
 *
 * Operator "To'lov qabul qilindi" ni bosdi va agent rahmat aytdi. O'sha
 * to'lov bir-ikki kundan keyin CRM'da ko'rinadi va ikki yo'l uni "yangi
 * pul" deb biladi: va'da kuzatuvchisi (`PromiseWatcher`) va "to'ladim"
 * da'vosi kuzatuvi. 7 kun ichida ikkalasi ham to'lovni YOZADI, lekin
 * rahmatni TAKRORLAMAYDI; 7 kundan keyin — odatdagidek.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

// 2026-08-12 — chorshanba, ish vaqti (Asia/Tashkent).
const NOW = new Date('2026-08-12T10:00:00+05:00');

const tasdiqlangan = (confirmedAt: Date): PaymentCheck => ({
  id: 'pc1',
  conversationId: 'cv1',
  clientId: 'cl1',
  contractId: null,
  messageId: 'm1',
  kind: 'receipt_review',
  status: 'confirmed_by_operator',
  receiptSource: 'tolov',
  sinceIso: '2026-08-05',
  baselinePaid: 0,
  foundAmount: null,
  foundType: null,
  watchUntil: null,
  checkedAt: null,
  acknowledgedAt: confirmedAt,
  thanksSentAt: null,
  confirmedBy: 'operator@xonsaroy.uz',
  confirmedAt,
  createdAt: confirmedAt,
});

/** `findOperatorConfirmedSince` — bazadagi `confirmed_at >= since` sharti. */
function tekshiruvlar(confirmedAt: Date | null) {
  const rahmatBelgilari: string[] = [];
  const repo = {
    findOperatorConfirmedSince: async (_id: string, since: Date) =>
      confirmedAt && confirmedAt.getTime() >= since.getTime() ? tasdiqlangan(confirmedAt) : null,
    markThanksSent: async (conversationId: string) => void rahmatBelgilari.push(conversationId),
  } as unknown as IPaymentCheckRepository;
  return { repo, rahmatBelgilari };
}

// ─── 1. PromiseWatcher ───────────────────────────────────────────────────
const settings = {
  windowStart: '09:00',
  windowEnd: '19:00',
  promiseThanksUntil: '18:00',
  weekdays: [1, 2, 3, 4, 5, 6],
  killSwitch: false,
  promiseReminder: false,
  promiseReminderUntil: '12:00',
  minDebt: 0,
} as OutreachSettings;

const promise = {
  id: 'p1',
  clientId: 'cl1',
  contractId: 'c1',
  conversationId: 'cv1',
  amount: 5_000_000,
  thankedAmount: 0,
  paidAmount: 0,
  status: 'pending',
  promisedDate: new Date('2026-08-11T00:00:00+05:00'),
  watchUntil: new Date('2026-08-14T00:00:00+05:00'),
  createdAt: new Date('2026-08-01T00:00:00+05:00'),
  checkedAt: null,
  remindedAt: null,
} as unknown as PaymentPromise;

/** Umumiy qurilma — faqat chek repozitoriysi almashadi. */
function buildWatcher(repo: IPaymentCheckRepository) {
  const calls = { thanks: 0, belgilangan: 0 };
  const jurnal: AuditEntry[] = [];

  const w = new PromiseWatcher(
    {
      findWatched: async () => [promise],
      listOpenByConversation: async () => [promise],
      findDueToday: async () => [],
      recordCheck: async () => undefined,
      markThanked: async () => {
        calls.belgilangan += 1;
      },
    } as unknown as IPaymentPromiseRepository,
    {
      findById: async () => ({ id: 'cv1', agentEnabled: true, needsHuman: false, state: 'negotiating' }) as unknown as Conversation,
    } as unknown as IConversationRepository,
    {
      paymentThanks: async () => {
        calls.thanks += 1;
        return { sent: true };
      },
    } as unknown as AgentRunner,
    { get: async () => settings } as unknown as RuntimeSettings,
    { record: async (e: AuditEntry) => void jurnal.push(e) } as unknown as IAuditRepository,
    { publish: () => undefined } as unknown as IEventBus,
    { now: () => NOW, todayIso: () => '2026-08-12' } as IClock,
    {
      findById: async () => ({ debtFirst: 0, debtMonthly: 0 }),
      findByClientId: async () => [{ id: 's1', virtualStatus: 'sold', debtFirst: 0, debtMonthly: 0, daysOverdue: 0 }],
    } as unknown as IContractRepository,
    {
      listPaidSince: async () => [
        { datePaidIso: '2026-08-09', amount: 5_000_000, discoveredAt: new Date('2026-08-12T04:00:00Z') },
      ],
    } as unknown as IContractPaymentRepository,
    { syncIfStale: async () => null } as unknown as ContractSyncService,
    { labelOf: () => null } as unknown as AccountLabels,
    { list: async () => [] } as unknown as IHolidayRepository,
    repo,
    { sukutdami: async () => false },
  );
  return { w, calls, jurnal };
}

function watcher(confirmedAt: Date | null) {
  const { repo, rahmatBelgilari } = tekshiruvlar(confirmedAt);
  const { w, calls, jurnal } = buildWatcher(repo);
  return { w, calls, jurnal, rahmatBelgilari };
}

{
  const m = watcher(new Date('2026-08-09T10:00:00+05:00')); // 3 kun oldin
  await m.w.verify();
  check('3 kun keyin: to\'lov va\'daga yozildi', m.calls.belgilangan === 1, String(m.calls.belgilangan));
  check('3 kun keyin: rahmat YUBORILMADI', m.calls.thanks === 0, String(m.calls.thanks));
  const yozuv = m.jurnal.find((e) => e.action === 'promise.payment_received');
  check(
    '3 kun keyin: audit sent=false, suppressedBy',
    (yozuv?.payload as { sent?: boolean; suppressedBy?: string } | undefined)?.sent === false &&
      (yozuv?.payload as { suppressedBy?: string }).suppressedBy === 'receipt_review',
    JSON.stringify(yozuv),
  );
}

{
  const m = watcher(new Date('2026-08-04T10:00:00+05:00')); // 8 kun oldin
  await m.w.verify();
  check('8 kun keyin: rahmat ketdi', m.calls.thanks === 1, String(m.calls.thanks));
  check('8 kun keyin: thanks_sent_at belgisi qo\'yildi', m.rahmatBelgilari.includes('cv1'), JSON.stringify(m.rahmatBelgilari));
}

{
  const m = watcher(null);
  await m.w.verify();
  check('tasdiq yo\'q: odatdagidek rahmat', m.calls.thanks === 1, String(m.calls.thanks));
  check('rahmatdan keyin ochiq chekka belgi', m.rahmatBelgilari.length === 1, JSON.stringify(m.rahmatBelgilari));
}

// ─── 2. "To'ladim" da'vosi kuzatuvi ──────────────────────────────────────
/**
 * `opts.markThanksSent` — chek repozitoriysidagi shu metodni almashtiradi
 * (masalan, baza yozuvi yiqilishini taqlid qilish uchun).
 * `opts.activePromise` — ochiq va'da mavjudligini taqlid qilish uchun.
 */
function davo(
  confirmedAt: Date | null,
  opts: { markThanksSent?: IPaymentCheckRepository['markThanksSent']; activePromise?: unknown } = {},
) {
  let rahmatlar = 0;
  const jurnal: AuditEntry[] = [];
  const { repo } = tekshiruvlar(confirmedAt);
  const crm: PaymentCheck = {
    ...tasdiqlangan(NOW),
    id: 'pc2',
    kind: 'crm_watch',
    status: 'watching',
    receiptSource: null,
    baselinePaid: 1_000_000,
    watchUntil: new Date('2026-08-13T10:00:00+05:00'),
    acknowledgedAt: null,
    confirmedBy: null,
    confirmedAt: null,
  };
  const checks = {
    ...repo,
    findOpenByConversation: async () => crm,
    close: async () => undefined,
    ...(opts.markThanksSent ? { markThanksSent: opts.markThanksSent } : {}),
  } as unknown as IPaymentCheckRepository;

  const service = new PaymentCheckService(
    checks,
    {
      findById: async () => ({ id: 'cv1', clientId: 'cl1', agentEnabled: true, needsHuman: false, state: 'negotiating' }) as unknown as Conversation,
      update: async () => ({}) as Conversation,
    } as unknown as IConversationRepository,
    { findByClientId: async () => [{ id: 'ct1', virtualStatus: 'sold', debtFirst: 0, debtMonthly: 0 }] } as unknown as IContractRepository,
    {
      sumPaidSince: async () => 6_000_000,
      listRecentPayments: async () => [{ dateIso: '2026-08-11', amount: 5_000_000, paymentType: 'transfer' }],
    } as unknown as IContractPaymentRepository,
    { findActiveByConversation: async () => opts.activePromise ?? null } as unknown as IPaymentPromiseRepository,
    { syncOne: async () => ({ outcome: 'ok' }) } as unknown as ContractSyncService,
    {
      paymentThanks: async () => {
        rahmatlar += 1;
        return { sent: true, reply: 'rahmat', escalated: false, promiseRecorded: false };
      },
    } as unknown as AgentRunner,
    { record: async (e: AuditEntry) => void jurnal.push(e) } as unknown as IAuditRepository,
    { publish: () => undefined } as unknown as IEventBus,
    { now: () => NOW, todayIso: () => '2026-08-12' } as unknown as IClock,
    { get: async () => ({ killSwitch: false }) } as unknown as RuntimeSettings,
  );
  return { service, jurnal, rahmatlar: () => rahmatlar };
}

{
  const m = davo(new Date('2026-08-09T10:00:00+05:00'));
  const out = await m.service.checkNow('cv1');
  check('da\'vo, 3 kun keyin: to\'lov tasdiqlandi', out.kind === 'confirmed', JSON.stringify(out));
  check('da\'vo, 3 kun keyin: rahmat yuborilmadi', m.rahmatlar() === 0 && out.kind === 'confirmed' && !out.thanked);
  check(
    'da\'vo, 3 kun keyin: audit suppressedBy',
    (m.jurnal[0]?.payload as { suppressedBy?: string } | undefined)?.suppressedBy === 'receipt_review',
    JSON.stringify(m.jurnal[0]),
  );
}

{
  const m = davo(new Date('2026-08-04T10:00:00+05:00'));
  const out = await m.service.checkNow('cv1');
  check('da\'vo, 8 kun keyin: rahmat ketdi', m.rahmatlar() === 1 && out.kind === 'confirmed' && out.thanked, JSON.stringify(out));
}

// ─── 3. thanks_sent_at yozuvi yiqilsa ham rahmat/audit yo'qolmaydi ───────
// `markThanksSent` MUVAFFAQIYATLI rahmatdan KEYIN chaqiriladi — yiqilsa
// ham rahmat allaqachon yuborilgan, shuning uchun xato yutilishi kerak
// (aks holda audit va hodisalar yozilmay, `confirm()`/`thank()` yarim
// yo'lda uzilib qolardi).
{
  const throwingRepo = {
    findOperatorConfirmedSince: async () => null,
    markThanksSent: async () => {
      throw new Error('baza vaqtincha ishlamadi');
    },
  } as unknown as IPaymentCheckRepository;
  const { w, calls, jurnal } = buildWatcher(throwingRepo);
  const acted = await w.verify();
  check(
    'PromiseWatcher: thanks_sent_at yozilmasa ham rahmat ketadi',
    calls.thanks === 1 && calls.belgilangan === 1,
    `thanks=${calls.thanks} belgilangan=${calls.belgilangan}`,
  );
  check(
    'PromiseWatcher: audit sent=true saqlanadi',
    jurnal.some(
      (e) => e.action === 'promise.payment_received' && (e.payload as { sent?: boolean })?.sent === true,
    ),
    JSON.stringify(jurnal),
  );
  check('PromiseWatcher: verify natijani rahmat sifatida sanadi', acted === 1, String(acted));
}

{
  const m = davo(null, {
    markThanksSent: async () => {
      throw new Error('baza vaqtincha ishlamadi');
    },
  });
  const out = await m.service.checkNow('cv1');
  check(
    'PaymentCheckService: thanks_sent_at yozilmasa ham rahmat va tasdiq saqlanadi',
    out.kind === 'confirmed' && out.thanked === true,
    JSON.stringify(out),
  );
  check(
    'PaymentCheckService: audit va hodisalar yozib ulgurdi',
    m.jurnal.length === 1 && m.jurnal[0]?.action === 'payment_check.confirmed',
    JSON.stringify(m.jurnal),
  );
}

// ─── 4. suppressedBy faqat operator tasdig'i sababli qo'yiladi ──────────
// Ochiq va'da YOLG'IZ o'zi ham rahmatni to'xtatadi (`PromiseWatcher` uni
// aytadi), lekin sabab OPERATOR TASDIG'I emas — audit shu farqni
// ko'rsatishi kerak.
{
  const m = davo(null, { activePromise: { id: 'p9' } });
  const out = await m.service.checkNow('cv1');
  check('faqat va\'da bo\'lsa rahmat yuborilmadi', out.kind === 'confirmed' && !out.thanked, JSON.stringify(out));
  check(
    'faqat va\'da bo\'lsa suppressedBy YO\'Q (operator aloqasi yo\'q)',
    (m.jurnal[0]?.payload as { suppressedBy?: string } | undefined)?.suppressedBy === undefined,
    JSON.stringify(m.jurnal[0]),
  );
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
