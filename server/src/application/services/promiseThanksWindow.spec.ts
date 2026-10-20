import { PromiseWatcher } from '@/application/services/PromiseWatcher';
import type { AgentRunner } from '@/application/services/AgentRunner';
import type { ContractSyncService } from '@/application/services/ContractSyncService';
import type { OutreachSettings, RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { Conversation } from '@/domain/entities/Conversation';
import type { PaymentPromise } from '@/domain/entities/PaymentPromise';
import type { IContractPaymentRepository } from '@/domain/repositories/IContractPaymentRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IPaymentPromiseRepository } from '@/domain/repositories/IPaymentPromiseRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IClock, IEventBus } from '@/domain/services/support';
import type { AccountLabels } from '@/application/services/AccountLabels';
import type { IHolidayRepository } from '@/domain/repositories/IHolidayRepository';
import type { IPaymentCheckRepository } from '@/domain/repositories/IPaymentCheckRepository';

/**
 * Qo'lda: npm run test:thanks-window --workspace=server
 *
 * "Pul tushdi" xabari faqat ish vaqtida ketishini tekshiradi.
 *
 * NEGA KERAK: ilgari `verify()` oynani umuman tekshirmasdi va to'lov
 * tunda ko'rinsa, mijozga 00:00 da xabar ketardi. Oyna faqat
 * `remind()` da bor edi.
 *
 * Tarmoqqa ham, bazaga ham chiqmaydi — hamma port soxta.
 */

// 2026-08-12 — chorshanba, 2026-08-16 — yakshanba (Asia/Tashkent).
const settings = {
  windowStart: '09:00',
  windowEnd: '19:00',
  promiseThanksUntil: '18:00',
  weekdays: [1, 2, 3, 4, 5, 6],
  killSwitch: false,
  promiseReminder: false,
  promiseReminderUntil: '12:00',
  // Chegara 0 — bu testlar chegarani emas, va'da oqimini tekshiradi.
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
  createdAt: new Date('2026-08-10T00:00:00+05:00'),
  checkedAt: null,
  remindedAt: null,
} as unknown as PaymentPromise;

const conversation = {
  id: 'cv1',
  agentEnabled: true,
  needsHuman: false,
  state: 'negotiating',
} as unknown as Conversation;

/** Har ssenariy uchun yangi kuzatuvchi — hisoblagichlar aralashmasin. */
const build = (nowIso: string, todayIso: string) => {
  const calls = { thanks: 0, recordedCheckedAt: undefined as Date | null | undefined };

  const clock = {
    now: () => new Date(nowIso),
    todayIso: () => todayIso,
  } as IClock;

  const watcher = new PromiseWatcher(
    {
      findWatched: async () => [promise],
      listOpenByConversation: async () => [promise],
      findDueToday: async () => [],
      recordCheck: async (_id: string, _paid: number, checkedAt: Date | null) => {
        calls.recordedCheckedAt = checkedAt;
      },
      markThanked: async () => undefined,
    } as unknown as IPaymentPromiseRepository,
    { findById: async () => conversation } as unknown as IConversationRepository,
    {
      paymentThanks: async () => {
        calls.thanks += 1;
        return { sent: true };
      },
    } as unknown as AgentRunner,
    { get: async () => settings } as unknown as RuntimeSettings,
    { record: async () => undefined } as unknown as IAuditRepository,
    { publish: () => undefined } as unknown as IEventBus,
    clock,
    {
      findById: async () => ({ debtFirst: 0, debtMonthly: 0 }),
      // "Kechikkan to'lovingiz yo'q" qarori endi MIJOZNING barcha
      // shartnomasi bo'yicha chiqadi (`kechikishYopildi`).
      findByClientId: async () => [
        { id: 's1', virtualStatus: 'sold', debtFirst: 0, debtMonthly: 0, daysOverdue: 0 },
      ],
    } as unknown as IContractRepository,
    // Va'dadan keyin yangi pul kelgan — `evaluatePromise` "thank" qaytaradi.
    {
      listPaidSince: async () => [
        {
          datePaidIso: '2026-08-11',
          amount: 5_000_000,
          discoveredAt: new Date('2026-08-12T00:00:00Z'),
        },
      ],
    } as unknown as IContractPaymentRepository,
    { syncIfStale: async () => null } as unknown as ContractSyncService,
    // Jurnal uchun akkaunt nomi — bu testda ahamiyatsiz.
    { labelOf: () => null } as unknown as AccountLabels,
    { list: async () => [] } as unknown as IHolidayRepository,
    { findOperatorConfirmedSince: async () => null, markThanksSent: async () => undefined } as unknown as IPaymentCheckRepository,
    { sukutdami: async () => false },
  );

  return { watcher, calls };
};

let failed = 0;
const check = (name: string, ok: boolean, extra = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${extra}`}`);
};

// ── 1. Tunda — xabar ketmaydi, keyingi tsiklga qoldiriladi ──────────────
{
  const { watcher, calls } = build('2026-08-12T00:30:00+05:00', '2026-08-12');
  await watcher.verify();

  check('00:30 da rahmat yuborilmadi', calls.thanks === 0, String(calls.thanks));
  check(
    'qayta urinish uchun belgilanmadi (checkedAt=null)',
    calls.recordedCheckedAt === null,
    String(calls.recordedCheckedAt),
  );
}

// ── 2. Ish vaqtida — xabar ketadi ───────────────────────────────────────
{
  const { watcher, calls } = build('2026-08-12T10:00:00+05:00', '2026-08-12');
  await watcher.verify();

  check('10:00 da rahmat yuborildi', calls.thanks === 1, String(calls.thanks));
  check('tekshirilgan deb belgilandi', calls.recordedCheckedAt instanceof Date);
}

// ── 3. 18:00 dan keyin — xabar ketmaydi ─────────────────────────────────
{
  const { watcher, calls } = build('2026-08-12T18:30:00+05:00', '2026-08-12');
  await watcher.verify();

  check('18:30 da rahmat yuborilmadi', calls.thanks === 0, String(calls.thanks));
}

// ── 4. Chegara: 17:59 ichkarida, 18:00 tashqarida ───────────────────────
{
  const inside = build('2026-08-12T17:59:00+05:00', '2026-08-12');
  await inside.watcher.verify();
  check('17:59 — ichkarida', inside.calls.thanks === 1, String(inside.calls.thanks));

  const edge = build('2026-08-12T18:00:00+05:00', '2026-08-12');
  await edge.watcher.verify();
  check('18:00 — tashqarida', edge.calls.thanks === 0, String(edge.calls.thanks));
}

// ── 5. Yakshanba — xabar ketmaydi ───────────────────────────────────────
{
  const { watcher, calls } = build('2026-08-16T10:00:00+05:00', '2026-08-16');
  await watcher.verify();

  check('yakshanba 10:00 da yuborilmadi', calls.thanks === 0, String(calls.thanks));
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
