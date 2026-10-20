import { PromiseWatcher } from '@/application/services/PromiseWatcher';
import type { Conversation } from '@/domain/entities/Conversation';
import type { PaymentPromise } from '@/domain/entities/PaymentPromise';
import type {
  ConversationPatch,
  IConversationRepository,
} from '@/domain/repositories/IConversationRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IContractPaymentRepository } from '@/domain/repositories/IContractPaymentRepository';
import type { IPaymentPromiseRepository } from '@/domain/repositories/IPaymentPromiseRepository';
import type { AuditEntry, IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IHolidayRepository } from '@/domain/repositories/IHolidayRepository';
import type { IPaymentCheckRepository } from '@/domain/repositories/IPaymentCheckRepository';
import type { IClock, IEventBus } from '@/domain/services/support';
import type { AgentRunner, AgentTurnResult } from '@/application/services/AgentRunner';
import type { ContractSyncService } from '@/application/services/ContractSyncService';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { AccountLabels } from '@/application/services/AccountLabels';
import { CrmUnavailableError } from '@/shared/errors';

/**
 * Qo'lda ishga tushiriladi: npm run test:vada-crm --workspace=server
 *
 * Bazaga ham, Telegramga ham chiqmaydi — hamma port soxta.
 *
 * `remind()` yo'li bo'yicha uchta tartib qotib qoladi:
 *
 *   1. CRM yiqilganda MIJOZGA XABAR KETMAYDI — aytiladigan summaning
 *      yagona manbai CRM, eskirgan nusxani aytishdan ko'ra jim turish
 *      arzon (2026-09-10, Boyirov Boyxon: 500 000 so'm farq).
 *   2. `reminded_at` QO'YILMAYDI — keyingi tsikl (15 daqiqa) qayta
 *      uriniladi. Qo'yilsa, eslatma o'sha va'da uchun butunlay yo'qolardi.
 *   3. OPERATORGA CHIQARILMAYDI va tsikl to'xtamaydi — qolgan va'dalar
 *      o'z eslatmasini oladi.
 */
const HOZIR = new Date('2026-08-18T09:00:00+05:00'); // seshanba, ish oynasi ichida
const BUGUN = '2026-08-18';

const conv = (over: Partial<Conversation> = {}): Conversation => ({
  id: 'cv1',
  clientId: 'cl1',
  telegramAccountId: null,
  peerId: null,
  peerAccessHash: null,
  state: 'negotiating',
  stage: 'soft',
  agentEnabled: true,
  needsHuman: false,
  humanReason: null,
  humanKind: null,
  agentSessionId: null,
  lastMessageAt: null,
  lastInboundAt: null,
  lastOutboundAt: null,
  unreadCount: 0,
  nudgeCount: 0,
  summary: null,
  createdAt: HOZIR,
  updatedAt: HOZIR,
  ...over,
});

const vada = (over: Partial<PaymentPromise> = {}): PaymentPromise => ({
  id: 'p1',
  conversationId: 'cv1',
  clientId: 'cl1',
  contractId: null,
  amount: 5_000_000,
  promisedDate: new Date(`${BUGUN}T00:00:00+05:00`),
  quote: null,
  status: 'pending',
  sourceMessageId: null,
  createdAt: new Date('2026-08-15T10:00:00+05:00'),
  resolvedAt: null,
  remindedAt: null,
  paidAmount: 0,
  thankedAmount: 0,
  checkedAt: null,
  watchUntil: new Date('2026-08-25T00:00:00+05:00'),
  ...over,
});

class FakePromises {
  reminded: string[] = [];

  constructor(private readonly vadalar: PaymentPromise[]) {}

  async findDueToday(): Promise<PaymentPromise[]> {
    return this.vadalar;
  }

  async findById(id: string): Promise<PaymentPromise | null> {
    return this.vadalar.find((v) => v.id === id) ?? null;
  }

  async markReminded(id: string): Promise<void> {
    this.reminded.push(id);
  }
}

class FakeConversations {
  updates: Array<{ id: string; patch: ConversationPatch }> = [];

  constructor(private readonly suhbatlar: Record<string, Conversation>) {}

  async findById(id: string): Promise<Conversation | null> {
    return this.suhbatlar[id] ?? null;
  }

  async update(id: string, patch: ConversationPatch): Promise<Conversation> {
    this.updates.push({ id, patch });
    return this.suhbatlar[id] as Conversation;
  }
}

/** p1 — CRM yiqiladi, p2 — eslatma odatdagidek tayyorlanadi. */
class FakeAgent {
  calls: string[] = [];
  async promiseReminder(conversationId: string): Promise<AgentTurnResult> {
    this.calls.push(conversationId);
    if (conversationId === 'cv1') throw new CrmUnavailableError();
    return { sent: true, reply: 'eslatma matni', escalated: false, promiseRecorded: false };
  }
}

class FakeAudit {
  entries: AuditEntry[] = [];
  async record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}

class FakeSettings {
  async get() {
    return {
      dailyLimit: 100,
      minDelaySec: 0,
      maxDelaySec: 0,
      windowStart: '00:00',
      windowEnd: '23:59',
      weekdays: [1, 2, 3, 4, 5, 6],
      killSwitch: false,
      agentAutoReply: true,
      personaName: 'Test',
      promiseReminder: true,
      promiseReminderUntil: '23:59',
      promiseThanksUntil: '23:59',
      silenceNudge: true,
      silenceNudgeDays: 1,
      silenceNudgeMax: 2,
      gateMessageMinSec: 0,
      gateMessageMaxSec: 0,
      gateOtherMinSec: 0,
      gateOtherMaxSec: 0,
    };
  }
}

const clock: IClock = { now: () => HOZIR, todayIso: () => BUGUN };
const events = { publish: () => undefined } as unknown as IEventBus;
const contracts = {
  findById: async () => null,
  findByClientId: async () => [],
} as unknown as IContractRepository;
const payments = { listPaidSince: async () => [] } as unknown as IContractPaymentRepository;
const contractSync = { syncIfStale: async () => undefined } as unknown as ContractSyncService;
const accountLabels = { labelOf: () => 'test-akkaunt' } as unknown as AccountLabels;
const holidays = { list: async () => [] } as unknown as IHolidayRepository;

let failed = 0;
const check = (name: string, ok: boolean, hint = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${hint}`}`);
};

const promises = new FakePromises([
  vada({ id: 'p1', conversationId: 'cv1' }),
  vada({ id: 'p2', conversationId: 'cv2', clientId: 'cl2' }),
]);
const conversations = new FakeConversations({
  cv1: conv({ id: 'cv1' }),
  cv2: conv({ id: 'cv2', clientId: 'cl2' }),
});
const agent = new FakeAgent();
const audit = new FakeAudit();

const watcher = new PromiseWatcher(
  promises as unknown as IPaymentPromiseRepository,
  conversations as unknown as IConversationRepository,
  agent as unknown as AgentRunner,
  new FakeSettings() as unknown as RuntimeSettings,
  audit as unknown as IAuditRepository,
  events,
  clock,
  contracts,
  payments,
  contractSync,
  accountLabels,
  holidays,
  { findOperatorConfirmedSince: async () => null, markThanksSent: async () => undefined } as unknown as IPaymentCheckRepository,
  { sukutdami: async () => false },
);

const sent = await watcher.remind();

check(
  "CRM yiqilgan va'da uchun xabar yozilmadi",
  !audit.entries.some((e) => e.entityId === 'cv1'),
  JSON.stringify(audit.entries),
);
check(
  "p1 'eslatildi' deb belgilanmadi (keyingi tsiklda qayta uriniladi)",
  !promises.reminded.includes('p1'),
  JSON.stringify(promises.reminded),
);
check(
  'suhbat operatorga chiqarilmadi',
  conversations.updates.length === 0,
  JSON.stringify(conversations.updates),
);
check(
  "tsikl to'xtamadi — p2 eslatmasi tayyorlandi",
  agent.calls.includes('cv2'),
  JSON.stringify(agent.calls),
);
check(
  "p2 'eslatildi' deb belgilandi",
  promises.reminded.includes('p2'),
  JSON.stringify(promises.reminded),
);
check('faqat bitta eslatma ketdi', sent === 1, String(sent));

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
