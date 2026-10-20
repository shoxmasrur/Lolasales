import type {
  XonzodaTranscript,
  Message,
  MessageStatus,
  NewMessage,
  TranscriptStatus,
} from '@/domain/entities/Message';
import type { Page, Pagination } from '@/domain/repositories/types';

export interface IMessageRepository {
  findById(id: string): Promise<Message | null>;
  listByConversation(conversationId: string, pagination?: Pagination): Promise<Page<Message>>;
  /** Agentga kontekst berish uchun oxirgi N ta xabar (eskidan yangiga). */
  recentByConversation(conversationId: string, limit: number): Promise<Message[]>;
  create(data: NewMessage): Promise<Message>;
  updateStatus(
    id: string,
    status: MessageStatus,
    extra?: { telegramMsgId?: number | null; error?: string | null; sentAt?: Date | null },
  ): Promise<Message>;
  setTranscript(id: string, status: TranscriptStatus, transcript?: string | null): Promise<Message>;
  /** XonzodaAI solishtirish natijasini yozadi; asosiy `transcript` ga tegmaydi. */
  setXonzodaTranscript(id: string, natija: XonzodaTranscript): Promise<void>;

  /**
   * Tahrirni yozadi. `original_body` faqat birinchi marta to'ldiriladi —
   * keyingi tahrirlar mijoz dastlab ko'rgan matnni o'chirmasligi kerak.
   */
  markEdited(id: string, body: string, editedAt: Date): Promise<Message>;

  /** Operator xabarni Telegramdan olib tashladi. */
  markRevoked(id: string, revokedAt: Date): Promise<Message>;
  /**
   * Mijoz o'qigan chiquvchi xabarlarni belgilaydi.
   *
   * Telegram "shu id gacha hammasi o'qildi" deb xabar beradi, shuning
   * uchun belgilash bittalab emas, `telegram_msg_id <= maxTelegramMsgId`
   * bo'yicha ketadi. Allaqachon belgilanganlar qayta yozilmaydi —
   * birinchi o'qilgan vaqt aniq qolishi kerak.
   *
   * @returns nechta xabar belgilandi
   */
  markReadUpTo(conversationId: string, maxTelegramMsgId: number, readAt: Date): Promise<number>;

  existsTelegramMessage(conversationId: string, telegramMsgId: number): Promise<boolean>;
  countByStatus(status: MessageStatus): Promise<number>;

  /**
   * Suhbatda haqiqatan ketgan chiquvchi xabar bormi.
   *
   * Qoralama hisobga olinmaydi — u hech qayerga ketmagan. Shu belgi
   * bo'yicha operatorning birinchi xabari "notanish odamga murojaat"
   * deb sanaladi.
   */
  hasOutbound(conversationId: string): Promise<boolean>;

  /**
   * Suhbatda mijozga YETIB BORGAN BO'LISHI MUMKIN chiquvchi xabar bormi.
   *
   * `draft` (hech qayerga ketmagan) va `failed` (Telegram rad etgan)
   * hisobga olinmaydi; qolgan hammasi — `queued`, `sending`, `sent`,
   * `delivered`, `read` — hisoblanadi. `sending` ATAYLAB kiradi: jarayon
   * Telegram yetkazgandan keyin, holat yangilanishidan oldin o'lsa yozuv
   * shu holatda qoladi, xabar esa mijozning telefonida turibdi.
   * Birinchi xabarni takrorlashdan himoya (`StartConversationUseCase`).
   */
  hasPossiblyDeliveredOutbound(conversationId: string): Promise<boolean>;
}
