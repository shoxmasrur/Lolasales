export type ConversationState =
  | 'new'
  | 'contacted'
  | 'negotiating'
  | 'promised'
  | 'agreed'
  | 'refused'
  | 'unreachable'
  | 'escalated'
  | 'closed';

/** Playbook 8-bo'lim: Soft (0-60 kun) → Hard (60-180) → Legal (180+). */
export type EscalationStage = 'soft' | 'hard' | 'legal';

/**
 * To'xtash turi.
 *
 *   • `'agent_error'` — agent chaqiruvi texnik sababdan yiqilgan, ya'ni
 *     qayta urinish mantiqiy.
 *   • `'broken_promise'` — mijoz sana aytgan, sana o'tgan, pul kelmagan.
 *     Operator ro'yxatida turishi kerak, LEKIN agent ham jim qolmasligi
 *     kerak: bosimni davom ettirish aynan shu holatning mohiyati
 *     (`canAgentNudge` ga qarang).
 *   • `'crm_xato'` — shartnomalar bazasi (CRM) javob bermagani uchun
 *     mijozga aytiladigan summani tasdiqlab bo'lmadi. Bu yerda agent
 *     `agent_error` dagidek TO'LIQ jim turadi: qayta urinishlar
 *     allaqachon sarflangan va bizdagi eski nusxa bilan yozish mijozga
 *     xato raqam aytish demak (2026-09-10, Boyirov Boyxon — 500 000
 *     so'mlik farq). Raqamsiz "esdan chiqmasin" xabari ham yaramaydi:
 *     mijoz darhol "qancha?" deb so'raydi va agent yana o'sha
 *     to'siqqa uriladi.
 *   • `'chek_tekshiruvi'` — mijoz chek yoki aniqlanmagan rasm/fayl
 *     yubordi, menejer "Tasdiqlash" yoki "Rad etish" ni bosishi kutilyapti
 *     (105-migratsiya). Agent javob ham, sukut xabari ham yozmaydi.
 *   • NULL — qolgan hammasi (agent eskalatsiyasi, operator).
 *
 * `human_kind` — CHECK cheklovisiz oddiy TEXT ustun (059-migratsiya),
 * shuning uchun yangi qiymat qo'shish migratsiya talab qilmaydi.
 */
export type HumanKind = 'agent_error' | 'broken_promise' | 'crm_xato' | 'chek_tekshiruvi';

export interface Conversation {
  readonly id: string;
  readonly clientId: string;
  readonly telegramAccountId: string | null;
  readonly peerId: string | null;
  readonly peerAccessHash: string | null;
  readonly state: ConversationState;
  readonly stage: EscalationStage;
  readonly agentEnabled: boolean;
  readonly needsHuman: boolean;
  readonly humanReason: string | null;
  readonly humanKind: HumanKind | null;
  readonly agentSessionId: string | null;
  readonly lastMessageAt: Date | null;
  readonly lastInboundAt: Date | null;
  readonly lastOutboundAt: Date | null;
  readonly unreadCount: number;
  /** Shu sukut zanjirida nechta qayta murojaat ketgani; javob kelsa nolga qaytadi. */
  readonly nudgeCount: number;
  readonly summary: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Yakunlangan suhbatga agent qayta yozmaydi. */
const TERMINAL_STATES: ReadonlySet<ConversationState> = new Set(['closed', 'escalated']);

export function isTerminal(state: ConversationState): boolean {
  return TERMINAL_STATES.has(state);
}

/**
 * Agent mijozning xabariga JAVOB yozishi mumkinmi.
 *
 * `needsHuman` ning barcha turini birdek to'sadi — `agent_error` ni ham,
 * `crm_xato` ni ham: ikkalasida ham suhbat operator qo'liga o'tgan va
 * agentning aralashuvi faqat ziyon qiladi. Istisno FAQAT sukutdan
 * keyingi murojaatda bor (`canAgentNudge`).
 */
export function canAgentReply(conversation: Conversation): boolean {
  return conversation.agentEnabled && !conversation.needsHuman && !isTerminal(conversation.state);
}

/**
 * Agent SUKUTDAN KEYIN o'zi yozishi mumkinmi.
 *
 * NEGA `canAgentReply` DAN ALOHIDA: ikkisi ikki xil savolga javob beradi.
 *
 *   • `canAgentReply` — mijozning yangi xabariga JAVOB yozish. Operator
 *     suhbatni qo'lga olgan bo'lsa (`needsHuman`), agent aralashmaydi:
 *     odam allaqachon o'zi yozyapti va ikkita muallif bir suhbatda
 *     bir-birini bosib ketadi.
 *   • `canAgentNudge` — mijoz JIM QOLGANDA qayta murojaat. Buzilgan
 *     va'da aynan agent bosim qilishi kerak bo'lgan holat: mijoz sana
 *     aytgan, sana o'tgan, pul kelmagan va endi javob ham bermayapti.
 *     Uni `needsHuman` deb chetlab o'tsak, "va'da berib to'lamadi"
 *     ssenariysi umuman ishlamaydi — u faqat shu yo'l bilan mijozga
 *     yetib boradi.
 *
 * `needs_human` bayrog'i TUSHIRILMAYDI: operator suhbatni baribir o'z
 * ro'yxatida ko'rishi kerak.
 *
 * Ro'yxat AYNAN bitta turdan iborat — shuning uchun `crm_xato` bu yerga
 * o'z-o'zidan tushmaydi va agent unda jim qoladi. Bu to'g'ri: CRM javob
 * bermaganda qayta murojaatda ham aytadigan raqamimiz yo'q.
 */
export function canAgentNudge(conversation: Conversation): boolean {
  if (!conversation.agentEnabled || isTerminal(conversation.state)) return false;
  return !conversation.needsHuman || conversation.humanKind === 'broken_promise';
}
