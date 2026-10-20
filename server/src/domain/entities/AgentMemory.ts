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

/** Playbook 8-bo'limidagi mijoz tasnifi. */
export type ClientType = 'qochoq' | 'tajovuzkor' | 'qiynalayotgan' | 'yaxshi_niyatli';

export const CLIENT_TYPE_LABEL: Record<ClientType, string> = {
  qochoq: 'Qochoq — javob bermaydi, mavzuni chalg\'itadi',
  tajovuzkor: 'Tajovuzkor — asabiy, ayblaydi',
  qiynalayotgan: 'Chin qiynalayotgan — real moliyaviy muammo',
  yaxshi_niyatli: 'Yaxshi niyatli — to\'lashga tayyor, lekin sekin',
};

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
