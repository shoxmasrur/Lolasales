import type { XaridBosqichi } from '@/domain/entities/Purchase';
import type { Conversation, ConversationState, EscalationStage, HumanKind } from '@/domain/entities/Conversation';
import type { Page, Pagination } from '@/domain/repositories/types';
import type { MijozQamrovi } from '@/domain/entities/MijozQamrovi';

export interface ConversationQuery extends Pagination {
  search?: string;
  state?: ConversationState;
  needsHuman?: boolean;
  unreadOnly?: boolean;
  stage?: EscalationStage;
  /** Turar-joy majmuasi nomi — mijozning SHU obyektdagi shartnomasi bo'yicha. */
  objectName?: string;
  /** Suhbat qaysi Telegram akkauntdan olib borilyapti. */
  telegramAccountId?: string;
  /**
   * Faqat bizni bloklagan mijozlar.
   *
   * Telegramda "Report spam and delete chat" bloklashni ham bajaradi, ya'ni
   * spamga chiqarganlar ham shu ro'yxatga tushadi.
   */
  blocked?: boolean;
  /** true — faqat noma'lum mijozlar (Telegramda o'zi yozganlar, shartnomasiz). */
  nomalum?: boolean;
  /**
   * "Chek keldi" filtri: menejer tasdig'ini kutayotgan ochiq chek
   * tekshiruvi (`reviewing`, muddat ichida) bor suhbatlar.
   */
  receiptPending?: boolean;
  /**
   * Faqat shu mijozning suhbatlari («Talabnomalar» → «Batafsil» oynasi).
   * Mijozda turli akkauntlarda bir nechta suhbat bo'lishi mumkin — mijoz
   * kartasidagi `conversation` esa faqat eng yangisini beradi.
   */
  clientId?: string;
}

/**
 * Filtr ro'yxatlari uchun variantlar.
 *
 * Faqat suhbatlarda HAQIQATAN uchraydiganlari qaytariladi: aks holda
 * operator ro'yxatdan tanlaydi va bo'sh natija oladi, keyin buni xato deb
 * o'ylaydi.
 */
export interface ConversationFilterOptions {
  readonly objects: string[];
  readonly accounts: Array<{ id: string; label: string }>;
}

/** Dashboard ro'yxati uchun — suhbat + mijoz + oxirgi xabar bir so'rovda. */
export interface ConversationListItem {
  readonly conversation: Conversation;
  readonly clientName: string;
  readonly clientPhone: string | null;
  /** Oyma-oy to'lovdagi kechikish — agent mijozga shu summani aytadi. */
  readonly debtMonthly: number;
  readonly debtTotal: number;
  readonly daysOverdue: number;
  readonly lastMessageBody: string | null;
  readonly lastMessageDirection: 'in' | 'out' | null;
  /** Noma'lum mijoz — ro'yxatda belgi ko'rsatish uchun. */
  readonly nomalum: boolean;
}

export interface ConversationPatch {
  state?: ConversationState;
  stage?: EscalationStage;
  agentEnabled?: boolean;
  needsHuman?: boolean;
  humanReason?: string | null;
  humanKind?: HumanKind | null;
  agentSessionId?: string | null;
  summary?: string | null;
  telegramAccountId?: string | null;
  peerId?: string | null;
  peerAccessHash?: string | null;
}

/** `resetAll` nimani tozalaganini bildiradi (audit va UI uchun). */
export interface ResetSummary {
  readonly conversations: number;
  readonly messages: number;
  readonly promises: number;
  readonly profiles: number;
  /** Qayta "pending" holatiga qaytarilgan kampaniya nishonlari. */
  readonly campaignTargets: number;
}

export interface IConversationRepository {
  findById(id: string): Promise<Conversation | null>;
  findByClientId(clientId: string): Promise<Conversation | null>;
  /**
   * Mijozning SHU akkauntdagi tirik suhbati. `findByClientId` faqat eng
   * yangisini qaytaradi — boshqa akkauntdagisi bo'lsa, shu akkauntdagi
   * ko'rinmay qolib `reassignClient` UNIQUE xatosiga urilardi.
   */
  findLiveByClientAndAccount(clientId: string, telegramAccountId: string | null): Promise<Conversation | null>;
  /** Suhbatni boshqa mijozga biriktiradi (noma'lum mijoz haqiqiy mijoz deb topilganda). */
  reassignClient(conversationId: string, clientId: string): Promise<void>;
  /** Suhbatni yopadi (yumshoq): noma'lum suhbat haqiqiy mijozning mavjud suhbatiga qo'shilganda ishlatiladi. */
  yopish(conversationId: string): Promise<void>;
  findByPeer(telegramAccountId: string, peerId: string): Promise<Conversation | null>;
  /**
   * Akkauntsiz qolgan suhbatlarni mijozning HOZIRGI akkauntiga qaytaradi.
   *
   * Telegram akkaunt o'chirilganda uning suhbatlaridagi `telegram_account_id`
   * bo'shatiladi — aks holda o'chirilgan akkauntga havola qolardi. Lekin
   * shundan keyin suhbat butunlay ishlamay qoladi: agent ham, operator ham
   * yoza olmaydi. Mijoz boshqa akkauntga biriktirilgach, uning ochiq
   * suhbati ham o'sha akkauntga o'tishi kerak.
   *
   * @returns nechta suhbat tiklangani
   */
  restoreOrphanedAccounts(): Promise<number>;
  /** `qamrov` — obyekt cheklovi; sukut `HAMMASI` (SQL o'zgarmaydi). */
  list(query: ConversationQuery, qamrov?: MijozQamrovi): Promise<Page<ConversationListItem>>;
  /**
   * Filtr ro'yxatlari uchun: suhbatlarda uchraydigan obyektlar va akkauntlar.
   * Cheklangan qamrovda — faqat ko'rinadigan mijozlar suhbatlaridan.
   */
  filterOptions(qamrov?: MijozQamrovi): Promise<ConversationFilterOptions>;
  create(data: { clientId: string; telegramAccountId?: string | null; stage: EscalationStage }): Promise<Conversation>;
  update(id: string, patch: ConversationPatch): Promise<Conversation>;
  touchInbound(id: string, at: Date): Promise<void>;
  touchOutbound(id: string, at: Date): Promise<void>;
  /**
   * Eslatma nomzodlari: faol xarid bosqichi `qiziqdi`/`karta_yuborildi`, oxirgi xabar
   * BIZDAN va javob yo'q. Agent yoqilgan, odam kerak emas, mijoz bloklamagan, ochiq chek yo'q.
   * Soat va "bir bosqichga bitta" qoidasi `eslatmaKerakmi` da tekshiriladi.
   */
  findEslatmaNomzodlari(limit: number): Promise<EslatmaNomzodi[]>;
  markRead(id: string): Promise<void>;
  /** Barcha yozishmalarni o'chiradi. Mijozlar, qoidalar va saboqlar qoladi. */
  resetAll(options: { resetCampaigns: boolean }): Promise<ResetSummary>;
}

export interface EslatmaNomzodi {
  conversationId: string;
  clientId: string;
  purchaseId: string;
  stage: XaridBosqichi;
  remindedStages: XaridBosqichi[];
  lastOutboundAt: Date;
  lastInboundAt: Date | null;
}
