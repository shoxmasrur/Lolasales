/**
 * Suhbat holati (xarid bosqichidan alohida — bosqich `purchases.stage` da).
 *
 *   • `new` — suhbat ochilgan, hali xabar ketmagan;
 *   • `contacted` — birinchi xabar yuborilgan;
 *   • `active` — mijoz javob bergan, yozishma davom etyapti;
 *   • `closed` — yopilgan: agent yozmaydi.
 */
export type ConversationState = 'new' | 'contacted' | 'active' | 'closed';

export const CONVERSATION_STATES: readonly ConversationState[] = ['new', 'contacted', 'active', 'closed'];

/**
 * To'xtash turi.
 *
 *   • `'agent_error'` — agent chaqiruvi texnik sababdan yiqilgan, ya'ni
 *     qayta urinish mantiqiy.
 *   • `'chek_tekshiruvi'` — mijoz chek yoki aniqlanmagan rasm/fayl
 *     yubordi, menejer "Tasdiqlash" yoki "Rad etish" ni bosishi kutilyapti.
 *     Agent javob ham, eslatma ham yozmaydi.
 *   • NULL — qolgan hammasi (agent operatorga o'tkazgan, operator).
 *
 * `human_kind` — CHECK cheklovisiz oddiy TEXT ustun.
 */
export type HumanKind = 'agent_error' | 'chek_tekshiruvi';

export interface Conversation {
  readonly id: string;
  readonly clientId: string;
  readonly telegramAccountId: string | null;
  readonly peerId: string | null;
  readonly peerAccessHash: string | null;
  readonly state: ConversationState;
  readonly agentEnabled: boolean;
  readonly needsHuman: boolean;
  readonly humanReason: string | null;
  readonly humanKind: HumanKind | null;
  readonly agentSessionId: string | null;
  readonly lastMessageAt: Date | null;
  readonly lastInboundAt: Date | null;
  readonly lastOutboundAt: Date | null;
  readonly unreadCount: number;
  readonly summary: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Yopilgan suhbatga agent qayta yozmaydi. */
export function isTerminal(state: ConversationState): boolean {
  return state === 'closed';
}

/**
 * Agent mijozning xabariga JAVOB yozishi (yoki eslatma yuborishi) mumkinmi.
 *
 * `needsHuman` ning barcha turini birdek to'sadi: suhbat operator qo'liga
 * o'tgan va agentning aralashuvi faqat ziyon qiladi.
 */
export function canAgentReply(conversation: Conversation): boolean {
  return conversation.agentEnabled && !conversation.needsHuman && !isTerminal(conversation.state);
}
