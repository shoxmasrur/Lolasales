import type { PublicUser } from '@/domain/entities/User';
import type { AppLogItem } from '@/domain/repositories/IAppLogRepository';

export interface IClock {
  now(): Date;
  /** Loyihaviy vaqt mintaqasidagi bugungi sana, YYYY-MM-DD. */
  todayIso(): string;
}

export interface IPasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}

/**
 * Token faqat "kim" ekanini aytadi. Huquqlar tokenga yozilmaydi —
 * aks holda rol o'zgartirilganda eski token eski huquqlar bilan ishlayverardi.
 */
export interface TokenPayload {
  sub: string;
  email: string;
}

export interface ITokenService {
  sign(user: PublicUser): string;
  verify(token: string): TokenPayload;
}

/** Real-time hodisalar — dashboard socket orqali eshitadi. */
export type DomainEvent =
  | { type: 'message.created'; conversationId: string; messageId: string }
  | { type: 'message.updated'; conversationId: string; messageId: string }
  | { type: 'conversation.updated'; conversationId: string }
  /** Mijoz chiquvchi xabarlarni Telegramda o'qidi. */
  | { type: 'conversation.messages_read'; conversationId: string }
  | { type: 'conversation.created'; conversationId: string }
  | { type: 'campaign.updated'; campaignId: string }
  | { type: 'telegram.status'; accountId: string; status: string }
  /**
   * Akkaunt sessiyasi BIZDAN TASHQARI uzildi (Telegram bekor qildi) —
   * administratorga shoshilinch xabar ketadi. O'zimiz chiqarganimizda
   * (operator "Chiqish" bosdi) bu hodisa CHIQMAYDI.
   */
  | { type: 'telegram.session_lost'; accountId: string; label: string; phone: string; kod: string }
  /** QR login: yangi QR havolasi (token ~30 soniyada eskiradi). */
  | { type: 'telegram.qr'; accountId: string; url: string; expiresAt: string }
  /** Telegram qutisi ekranini jonli yangilash uchun xom xabar. */
  | {
      type: 'telegram.raw_message';
      accountId: string;
      peerId: string;
      messageId: number;
      text: string;
      out: boolean;
      date: string;
      senderName: string | null;
      mediaLabel: string | null;
    }
  | { type: 'agent.thinking'; conversationId: string; on: boolean }
  /** Ommaviy Telegram tekshiruvining progressi. */
  | { type: 'telegram.lookup_progress'; job: unknown }
  /** Ommaviy suhbat boshlash progressi. */
  | { type: 'conversation.bulk_progress'; job: unknown }
  /** Qayta aloqa ro'yxatidan ommaviy yuborish progressi. */
  | { type: 'recontact.bulk_progress'; job: unknown }
  /** Tanlangan mijozlarni CRM'dan ommaviy yangilash progressi. */
  | { type: 'contracts.sync_progress'; job: unknown }
  | { type: 'stats.invalidate' }
  /** Bazaga yangi jurnal qatori yozildi — jurnal sahifasi uchun. */
  | { type: 'log.appended'; item: AppLogItem };

export interface IEventBus {
  publish(event: DomainEvent): void;
  subscribe(handler: (event: DomainEvent) => void): () => void;
}
