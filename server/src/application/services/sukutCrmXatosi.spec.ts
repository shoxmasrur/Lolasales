import { SilenceWatcher } from '@/application/services/SilenceWatcher';
import type { IHolidayRepository } from '@/domain/repositories/IHolidayRepository';
import type { Conversation } from '@/domain/entities/Conversation';
import type {
  ConversationPatch,
  IConversationRepository,
} from '@/domain/repositories/IConversationRepository';
import type { IPaymentPromiseRepository } from '@/domain/repositories/IPaymentPromiseRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { AuditEntry, IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IClock } from '@/domain/services/support';
import type { AgentRunner, AgentTurnResult } from '@/application/services/AgentRunner';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import { CrmUnavailableError } from '@/shared/errors';

/**
 * Qo'lda ishga tushiriladi: npm run test:sukut-crm --workspace=server
 *
 * Bazaga ham, Telegramga ham chiqmaydi — hamma port soxta.
 *
 * Ikki tartibni qo'riqlaydi:
 *
 *   1. URINISH YO'QOLMAYDI. Hisoblagich agent chaqiruvidan OLDIN
 *      oshiriladi (bu ataylab: model "yozmayman" desa ham urinish
 *      sarflanadi). CRM yiqilganda esa model umuman chaqirilmaydi —
 *      urinish behuda ketardi va mijoz uchta emas, ikkita murojaat olib
 *      ro'yxatdan chiqib ketardi.
 *
 *   2. OPERATORGA CHIQARILMAYDI. CRM chorak soat ishlamasa, kuzatuvchi
 *      har tsiklda 20 tagacha suhbatni odam ro'yxatiga tashlardi.
 *      Ularning birortasi ham odam qaroriga muhtoj emas.
 */
const t = (isoLocal: string): Date => new Date(`${isoLocal}+05:00`);
const HOZIR = t('2026-08-18T09:00:00'); // seshanba, 09:00 — ish oynasi ichida

const conv = (over: Partial<Conversation> = {}): Conversation => ({
  id: 'cv1',
  clientId: 'cl1',
  telegramAccountId: null,
  peerId: null,
  peerAccessHash: null,
  state: 'contacted',
  stage: 'soft',
  agentEnabled: true,
  needsHuman: false,
  humanReason: null,
  humanKind: null,
  agentSessionId: null,
  lastMessageAt: null,
  lastInboundAt: null,
  // Dushanba 10:00 — HOZIR (seshanba 09:00) gacha 1 ish kuni sukut.
  lastOutboundAt: t('2026-08-17T10:00:00'),
  unreadCount: 0,
  nudgeCount: 0,
  summary: null,
  createdAt: t('2026-08-17T10:00:00'),
  updatedAt: t('2026-08-17T10:00:00'),
  ...over,
});

class FakeConversations {
  bumped: string[] = [];
  unbumped: string[] = [];
  updates: Array<{ id: string; patch: ConversationPatch }> = [];

  constructor(private readonly suhbatlar: Record<string, Conversation>) {}

  async findSilent(): Promise<Conversation[]> {
    return Object.values(this.suhbatlar);
  }

  async findById(id: string): Promise<Conversation | null> {
    return this.suhbatlar[id] ?? null;
  }

  async bumpNudgeCount(id: string): Promise<void> {
    this.bumped.push(id);
  }

  async unbumpNudgeCount(id: string): Promise<void> {
    this.unbumped.push(id);
  }

  async update(id: string, patch: ConversationPatch): Promise<Conversation> {
    this.updates.push({ id, patch });
    return this.suhbatlar[id] as Conversation;
  }
}

/** cv1 — CRM yiqiladi, cv2 — odatdagidek javob yoziladi. */
class FakeAgent {
  calls: string[] = [];
  async silenceNudge(conversationId: string): Promise<AgentTurnResult> {
    this.calls.push(conversationId);
    if (conversationId === 'cv1') throw new CrmUnavailableError();
    return { sent: true, reply: 'qayta murojaat matni', escalated: false, promiseRecorded: false };
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
      // Pauza nolga tenglashtirilgan — test soniyalab kutmasin.
      minDelaySec: 0,
      maxDelaySec: 0,
      windowStart: '00:00',
      windowEnd: '23:59',
      weekdays: [1, 2, 3, 4, 5, 6],
      killSwitch: false,
      agentAutoReply: true,
      personaName: 'Test',
      promiseReminder: true,
      promiseReminderUntil: '12:00',
      promiseThanksUntil: '18:00',
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

const clock: IClock = {
  now: () => HOZIR,
  todayIso: () => '2026-08-18',
};

const asConversations = (c: FakeConversations): IConversationRepository =>
  c as unknown as IConversationRepository;
const asAgent = (a: FakeAgent): AgentRunner => a as unknown as AgentRunner;
const asAudit = (a: FakeAudit): IAuditRepository => a as unknown as IAuditRepository;
const asSettings = (s: FakeSettings): RuntimeSettings => s as unknown as RuntimeSettings;
const promises = {
  findActiveByConversation: async () => null,
} as unknown as IPaymentPromiseRepository;
const contracts = { findByClientId: async () => [] } as unknown as IContractRepository;
const holidays = { list: async () => [] } as unknown as IHolidayRepository;

let failed = 0;
const check = (name: string, ok: boolean, hint = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${hint}`}`);
};

const conversations = new FakeConversations({
  cv1: conv({ id: 'cv1' }),
  cv2: conv({ id: 'cv2', clientId: 'cl2' }),
});
const agent = new FakeAgent();
const audit = new FakeAudit();
const watcher = new SilenceWatcher(
  asConversations(conversations),
  promises,
  contracts,
  asAgent(agent),
  asSettings(new FakeSettings()),
  asAudit(audit),
  clock,
  holidays,
  { sukutdami: async () => false },
);

const sent = await watcher.nudge();

check("cv1 uchun urinish bo'ldi", conversations.bumped.includes('cv1'));
check(
  "cv1 hisoblagichi ORQAGA QAYTARILDI",
  conversations.unbumped.filter((id) => id === 'cv1').length === 1,
  JSON.stringify(conversations.unbumped),
);
check(
  "cv1 operatorga CHIQARILMADI",
  !conversations.updates.some((u) => u.id === 'cv1'),
  JSON.stringify(conversations.updates),
);
check(
  'hech bir suhbat needs_human ga o\'tmadi',
  !conversations.updates.some((u) => u.patch.needsHuman),
  JSON.stringify(conversations.updates),
);
check(
  "tsikl to'xtamadi — cv2 ga murojaat qilindi",
  agent.calls.includes('cv2'),
  JSON.stringify(agent.calls),
);
check(
  "cv2 hisoblagichi qaytarilmadi (uning chaqiruvi o'tdi)",
  conversations.bumped.includes('cv2') && !conversations.unbumped.includes('cv2'),
  JSON.stringify({ bumped: conversations.bumped, unbumped: conversations.unbumped }),
);
check('faqat cv2 ga xabar ketdi', sent === 1, String(sent));

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
