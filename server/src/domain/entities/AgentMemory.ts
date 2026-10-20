export type LessonStatus = 'proposed' | 'approved' | 'rejected';

/**
 * Agent suhbatdan olgan umumiy xulosa.
 * Faqat operator tasdiqlaganidan keyin promptga qo'shiladi — aks holda
 * agent o'zining tasodifiy xulosasini "qoida" qilib olib ketardi.
 */
export interface AgentLesson {
  readonly id: string;
  readonly lesson: string;
  readonly conversationId: string | null;
  readonly evidence: string | null;
  readonly status: LessonStatus;
  readonly timesSeen: number;
  readonly reviewedBy: string | null;
  readonly reviewedAt: Date | null;
  readonly createdAt: Date;
}

export interface NewAgentLesson {
  lesson: string;
  conversationId?: string | null;
  evidence?: string | null;
}

/**
 * Sotuvdagi mijoz turi. `client_profiles.client_type` CHECK'i aynan shu
 * qiymatlarni qabul qiladi (003-migratsiya); agent ularni `clientMemory`
 * da qaytaradi.
 */
export const CLIENT_TYPES_LIST = ['tez_qaror', 'oylaydigan', 'narxga_sezgir', 'shubhali'] as const;

export type ClientType = (typeof CLIENT_TYPES_LIST)[number];

export const CLIENT_TYPE_LABEL: Record<ClientType, string> = {
  tez_qaror: 'Tez qaror qiladi — aniq savol beradi, ortiqcha taqdimot kerak emas',
  oylaydigan: 'O\'ylaydigan — ikkilanadi, shoshirmaslik kerak',
  narxga_sezgir: 'Narxga sezgir — avval narxni so\'raydi, "qimmat" deydi',
  shubhali: 'Shubhali — ishonmaydi, aniq fakt kerak',
};

/** Bazaga yozsa bo'ladigan tur — boshqa qiymat CHECK'da yiqiladi. */
export function isClientType(value: string | null | undefined): value is ClientType {
  return Boolean(value && (CLIENT_TYPES_LIST as readonly string[]).includes(value));
}

/**
 * Telegramda shartnoma egasining O'RNIGA yozayotgan odam — masalan o'g'li.
 *
 * To'ldirilgan bo'lsa agent murojaatni shartnoma egasining ismidan emas,
 * shu odamning ismi va jinsidan tuzadi (103-migratsiya).
 */
export interface Interlocutor {
  /**
   * O'zi aytgan ismi. NULL bo'lishi mumkin — "o'g'li yozadi" ma'lum, ismi
   * esa aytilmagan. Ism ham, `relation` ham bo'lmasa suhbatdosh saqlanmaydi.
   */
  readonly name: string | null;
  /** NULL — aniqlanmadi: "aka/opa" ishlatilmaydi. */
  readonly gender: 'male' | 'female' | null;
  /** Shartnoma egasiga kimligi: "o'g'li", "turmush o'rtog'i". */
  readonly relation: string | null;
}

/** Mijoz haqida agent eslab qolgan narsalar — suhbatlar orasida saqlanadi. */
export interface ClientProfile {
  readonly clientId: string;
  readonly clientType: ClientType | null;
  readonly summary: string | null;
  readonly whatWorks: string | null;
  readonly bestContactTime: string | null;
  readonly interlocutor: Interlocutor | null;
  readonly updatedAt: Date;
}

export interface ClientProfilePatch {
  clientType?: ClientType | null;
  summary?: string | null;
  whatWorks?: string | null;
  bestContactTime?: string | null;
  interlocutor?: Interlocutor | null;
}
