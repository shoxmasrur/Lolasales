import type { Interlocutor } from '@/domain/entities/AgentMemory';
import type { ClientSource } from '@/domain/entities/Client';
import type { Course, CourseKnowledge } from '@/domain/entities/Course';
import type { XaridBosqichi } from '@/domain/entities/Purchase';

/**
 * Agentga beriladigan sotuv konteksti — u hech qanday narx, sana yoki
 * kartani o'zi o'ylab topmaydi: hammasi shu yerdan olinadi.
 */
export interface AgentSalesContext {
  readonly clientName: string;
  /** Aniq ism — murojaat shakli ("Malika opa") shundan tuziladi. NULL bo'lsa to'liq ismdan taxmin qilinadi. */
  readonly clientFirstName: string | null;
  /** Telegramda mijozning o'rniga yozayotgan odam (o'g'li va h.k.). */
  readonly interlocutor?: Interlocutor | null;
  readonly source: ClientSource;
  /** `guruh` manbasida — kanal/guruh nomi. */
  readonly sourceGroup: string | null;
  /** `guruh` manbasida — mijoz yozgan komment matni. */
  readonly sourceComment: string | null;
  /** Joriy (faol yoki oxirgi) xarid; mijozda umuman xarid bo'lmasa NULL. */
  readonly purchase: {
    readonly stage: XaridBosqichi;
    readonly courseId: string | null;
    readonly totalAmount: number | null;
    readonly paidAmount: number;
    readonly installment: boolean;
  } | null;
  /** Bugun sotuvda turgan kurslar va ularning bazasi. */
  readonly coursesOnSale: ReadonlyArray<{ readonly course: Course; readonly knowledge: readonly CourseKnowledge[] }>;
  /** Eng yaqin keyingi kurs — faqat `coursesOnSale` bo'sh bo'lsa to'ldiriladi. */
  readonly nextCourse: Course | null;
  /** Mijoz oldin to'liq to'lagan kurslarning nomlari. */
  readonly boughtCourses: readonly string[];
}

/** Agentning bir navbati qanday sababdan kelib chiqqani. */
export type TurnMode = 'first' | 'reply' | 'nudge' | 'operator' | 'receipt_confirmed' | 'receipt_rejected';

/**
 * Suhbat tarixining bitta qatori (eskidan yangiga).
 *
 * `operator` — operatorning agentga topshirig'i, mijoz uni ko'rmagan.
 * `holat` — operator xabarga tekkanini bildiradi (ichki qayd).
 */
export interface HistoryItem {
  role: 'client' | 'agent' | 'operator';
  text: string;
  at: Date;
  holat?: 'tuzatilgan' | 'ochirilgan';
}

/**
 * Agentning "miyasi" — bazadan yig'ilgan holda uzatiladi.
 * Engine bazani bilmaydi, faqat tayyor matnni oladi.
 */
export interface AgentKnowledgeBlocks {
  /** Qoidalar bo'limlari (uslub, taqiqlar, misollar). */
  readonly rules: string;
  /** Tasdiqlangan saboqlar. */
  readonly lessons: string;
  /** Shu mijoz haqida eslab qolinganlar. */
  readonly clientMemory: string;
  readonly personaName: string;
  /** Sozlamalardagi kompaniya nomi (`kompaniyaNomi`). Bo'sh bo'lsa prompt standart nomni oladi. */
  readonly companyName?: string;
}

export interface AgentTurnInput {
  readonly conversationId: string;
  readonly clientId: string;
  readonly knowledge: AgentKnowledgeBlocks;
  readonly context: AgentSalesContext;
  readonly history: HistoryItem[];
  /** Yangi kiruvchi xabar. Tizim tashabbusidagi navbatlarda null. */
  readonly incoming: string | null;
  /** Oldingi Claude sessiyasini davom ettirish uchun. */
  readonly sessionId: string | null;
  /**
   * Model chaqiruvini yarim yo'lda uzish uchun. Signal kelganda engine
   * `AbortedError` tashlaydi — yarim yozilgan javob HECH QACHON yuborilmaydi.
   */
  readonly signal?: AbortSignal;
  /** Operator yozgan topshiriq — faqat `'operator'` rejimida. */
  readonly operatorInstruction?: string | null;
  /** Mijozning cheki menejer tekshiruvida (natija hali yo'q). */
  readonly receiptPending: boolean;
  /**
   * Ochiq chek tekshiruvi: `'new'` — agent hali javob bermagan (bir marta
   * "Chekni oldim, tekshirib chiqamiz"), `'acknowledged'` — javob berilgan.
   */
  readonly receiptReview?: 'new' | 'acknowledged' | null;
  /** Menejer chekni tasdiqladi — faqat `'receipt_confirmed'` rejimida. Raqamlar KODDA hisoblangan. */
  readonly receiptConfirmed?: {
    readonly paidAmount: number;
    readonly totalAmount: number;
    readonly remaining: number;
    readonly linkWillBeSent: boolean;
  } | null;
  /** Menejer chekni rad etdi — faqat `'receipt_rejected'` rejimida. */
  readonly receiptRejected?: { readonly reason: string } | null;
  /** Eslatma qaysi bosqich uchun — faqat `'nudge'` rejimida. */
  readonly nudgeStage?: XaridBosqichi | null;
}

/** Agent shu suhbatdan olgan umumiy xulosa (bo'lsa). */
export interface AgentLessonCapture {
  readonly lesson: string;
  readonly evidence: string | null;
}

/** Agent shu mijoz haqida eslab qolmoqchi bo'lgan narsa. */
export interface AgentClientMemoryCapture {
  readonly clientType: string | null;
  readonly summary: string | null;
  readonly whatWorks: string | null;
}

/**
 * Bitta model chaqiruvining hisobi — narx kuzatuvi uchun. Kesh tokenlari
 * alohida yuriladi: ular oddiy kiruvchi tokendan boshqacha narxlanadi.
 */
export interface AgentUsage {
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly costUsd: number;
  readonly durationMs: number;
}

export interface AgentTurnOutput {
  /** Mijozga yuboriladigan matn. Bo'sh bo'lsa — yuborishga hojat yo'q. */
  readonly reply: string | null;
  /** Ikkinchi xabar (uzun javob ikkiga bo'linadi). */
  readonly replySecond: string | null;
  readonly sessionId: string | null;
  /** Agent taklif qilgan yangi bosqich (`suhbatda` | `qiziqdi` | `rad_etdi`). */
  readonly stage: XaridBosqichi | null;
  /** Mijoz qiziqqan kurs — faqat sotuvdagi kurs bo'lsa qo'llanadi. */
  readonly courseId: string | null;
  /** Mijoz to'lashga rozi — tizim kartani aniq qiymatdan alohida xabar qilib yuboradi. */
  readonly sendCard: boolean;
  /** Mijoz bo'lib to'lashni tanladi. */
  readonly installment: boolean;
  /** Mijoz tanlagan narx varianti (qator) — kursning `priceOptions` idan biri; so'mda. */
  readonly selectedPrice?: number | null;
  readonly escalate: { reason: string } | null;
  readonly internalNote: string | null;
  readonly lesson: AgentLessonCapture | null;
  readonly clientMemory: AgentClientMemoryCapture | null;
  /** Suhbatdosh o'zini mijozdan BOSHQA odam deb tanishtirgan bo'lsa. */
  readonly interlocutor?: Interlocutor | null;
  readonly usage?: AgentUsage;
}

export interface IAgentEngine {
  /** Birinchi murojaat (guruh kommenti yoki raqam bo'yicha). */
  composeFirstContact(input: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput>;
  /** Mijozning javobiga reaksiya. */
  respond(input: AgentTurnInput): Promise<AgentTurnOutput>;
  /** Mijoz jim qolganda bitta yumshoq eslatma. */
  composeNudge(input: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput>;
  /** Operator topshirig'i bo'yicha xabar. */
  composeOperatorTurn(input: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput>;
  /** Menejer chekni tasdiqladi — rahmat. */
  composeReceiptConfirmed(input: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput>;
  /** Menejer chekni rad etdi — qayta chek so'rash. */
  composeReceiptRejected(input: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput>;
}
