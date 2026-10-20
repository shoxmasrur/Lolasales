import { PromiseWatcher } from '@/application/services/PromiseWatcher';
import { KECHIKISH_KUNI, type TolovHodisasi } from '@/domain/services/vadaTolovi';
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
 * Qo'lda: npm run test:vada-orqaga-sana --workspace=server
 *
 * REAL HODISA (18-avgust, produksiya): mijoz 20 100 000 so'm to'ladi,
 * CRM to'lovga 16-avgust sanasini qo'ydi, bizga u 18-avgustdagi
 * sinxronda ko'rindi. Va'da 17-avgustda yozilgani uchun kuzatuvchi
 * "hech narsa kelmadi" deb hisobladi va odam pul to'lab turib rahmat
 * eshitmadi.
 *
 * Bu yerda kuzatuvchining O'ZI tekshiriladi: u to'lovlarni qanday
 * so'raydi va orqaga sanalgan to'lovni yangi pul deb tan oladimi.
 * Tarmoqqa ham, bazaga ham chiqilmaydi.
 */

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

/** Va'da 17-avgust kuni yozilgan. */
const promise = {
  id: 'p1',
  clientId: 'cl1',
  contractId: 'c1',
  conversationId: 'cv1',
  amount: 30_364_402,
  thankedAmount: 0,
  paidAmount: 0,
  status: 'pending',
  promisedDate: new Date('2026-08-17T00:00:00+05:00'),
  watchUntil: new Date('2026-08-24T00:00:00+05:00'),
  createdAt: new Date('2026-08-17T10:00:00+05:00'),
  checkedAt: null,
  remindedAt: null,
} as unknown as PaymentPromise;

const conversation = {
  id: 'cv1',
  agentEnabled: true,
  needsHuman: false,
  state: 'negotiating',
} as unknown as Conversation;

const build = (events: TolovHodisasi[]) => {
  const calls = {
    thanks: 0,
    newMoney: 0,
    recordedPaid: -1,
    sinceIso: '',
  };

  const watcher = new PromiseWatcher(
    {
      findWatched: async () => [promise],
      listOpenByConversation: async () => [promise],
      findDueToday: async () => [],
      recordCheck: async (_id: string, paid: number) => {
        calls.recordedPaid = paid;
      },
      markThanked: async () => undefined,
    } as unknown as IPaymentPromiseRepository,
    { findById: async () => conversation } as unknown as IConversationRepository,
    {
      paymentThanks: async (_cv: string, _p: PaymentPromise, facts: { newMoney: number }) => {
        calls.thanks += 1;
        calls.newMoney = facts.newMoney;
        return { sent: true };
      },
    } as unknown as AgentRunner,
    { get: async () => settings } as unknown as RuntimeSettings,
    { record: async () => undefined } as unknown as IAuditRepository,
    { publish: () => undefined } as unknown as IEventBus,
    {
      now: () => new Date('2026-08-18T10:00:00+05:00'),
      todayIso: () => '2026-08-18',
    } as IClock,
    {
      findById: async () => ({ debtFirst: 0, debtMonthly: 10_000_000 }),
      // "Kechikkan to'lovingiz yo'q" qarori MIJOZNING barcha shartnomasi
      // bo'yicha chiqadi (`kechikishYopildi`) — stub ham shuni beradi.
      findByClientId: async () => [
        { id: 's1', virtualStatus: 'sold', debtFirst: 0, debtMonthly: 10_000_000, daysOverdue: 30 },
      ],
    } as unknown as IContractRepository,
    {
      // Eski, sana bo'yicha kesadigan yo'l: va'dadan oldingi sanadagi
      // to'lovni ko'rmaydi — aynan shu xatoning o'zi.
      sumPaidSince: async () => 0,
      listPaidSince: async ({ sinceIso }: { sinceIso: string }) => {
        calls.sinceIso = sinceIso;
        return events;
      },
    } as unknown as IContractPaymentRepository,
    { syncIfStale: async () => null } as unknown as ContractSyncService,
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

// ── 1. Orqaga sanalgan, kech topilgan to'lov — rahmat aytiladi ──────────
{
  const { watcher, calls } = build([
    {
      datePaidIso: '2026-08-16',
      amount: 20_100_000,
      discoveredAt: new Date('2026-08-18T04:02:00Z'),
    },
  ]);
  await watcher.verify();

  check('rahmat yuborildi', calls.thanks === 1, String(calls.thanks));
  check('yangi pul 20 100 000 deb aytildi', calls.newMoney === 20_100_000, String(calls.newMoney));
  check("va'daga to'lov yozildi", calls.recordedPaid === 20_100_000, String(calls.recordedPaid));
  check(
    `to'lovlar ${KECHIKISH_KUNI} kun kengroq so'raldi (2026-08-10)`,
    calls.sinceIso === '2026-08-10',
    calls.sinceIso,
  );
}

// ── 2. Birinchi sinxronda chiqqan eski tarix — rahmat yo'q ─────────────
// Shartnoma birinchi marta sinxronlansa butun tarixi "bugun topildi"
// bo'lib yoziladi; unga rahmat aytish mijoz uchun bema'nilik bo'lardi.
{
  const { watcher, calls } = build([
    {
      datePaidIso: '2024-08-16',
      amount: 162_300_000,
      discoveredAt: new Date('2026-08-18T04:02:00Z'),
    },
  ]);
  await watcher.verify();

  check('eski tarixga rahmat aytilmadi', calls.thanks === 0, String(calls.thanks));
  check('yangi pul nol deb yozildi', calls.recordedPaid === 0, String(calls.recordedPaid));
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
