import type { ImageKind } from '@/domain/services/IImageClassifier';

/**
 * `note` — mijozga KETMAYDIGAN ichki qayd: operatorning agentga topshirig'i.
 *
 * Alohida yo'nalish ATAYLAB, `out` + maxsus holat emas: eslatma, hisobot,
 * "javobsiz xabar" va o'qilganlik hisoblari `direction = 'out'` bo'yicha
 * sanaydi. Qayd `out` bo'lsa, ularning har biri uni yuborilgan xabar deb
 * hisoblardi va har birini alohida tuzatish kerak bo'lardi.
 */
export type MessageDirection = 'in' | 'out' | 'note';
export type MessageAuthor = 'agent' | 'human' | 'client' | 'system';
export type MessageStatus = 'draft' | 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export type MediaKind =
  | 'photo'
  | 'voice'
  | 'audio'
  | 'video'
  | 'video_note'
  | 'document'
  | 'sticker'
  | 'other';

export type TranscriptStatus = 'none' | 'pending' | 'done' | 'failed';

/** Rasm tasnifining holati — `TranscriptStatus` bilan bir xil shakl. */
export type ImageStatus = 'none' | 'pending' | 'done' | 'failed';

export interface MessageMedia {
  readonly kind: MediaKind;
  readonly path: string | null;
  readonly mimeType: string | null;
  readonly sizeBytes: number | null;
  readonly durationSec: number | null;
  readonly fileName: string | null;
}

/** Ovozli xabar — agent uchun matnga o'girilishi kerak. */
export const VOICE_KINDS: ReadonlySet<MediaKind> = new Set(['voice', 'audio', 'video_note']);

/**
 * Chek bo'lishi mumkin bo'lgan media — rasm va fayl. Ular chek tekshiruvini
 * (`receipt_review`) ochadi: pulni operator tasdiqlaydi.
 *
 * VIDEO ATAYLAB YO'Q: Telegram video-stiker va GIF'larni `video` deb
 * yuboradi, kvitansiya esa video bo'lib kelmaydi (2026-09-17).
 */
export const REVIEW_KINDS: ReadonlySet<MediaKind> = new Set(['photo', 'document']);

/** Ovozli xabarning XonzodaAI bo'yicha natijasi (solishtirish uchun). */
export interface XonzodaTranscript {
  readonly status: 'done' | 'failed';
  readonly text: string | null;
  /** Xato sababi — faqat `failed` da. */
  readonly error: string | null;
  /** So'rov yuborilgandan javobgacha, ms. */
  readonly ms: number | null;
}

export interface Message {
  readonly id: string;
  readonly conversationId: string;
  readonly direction: MessageDirection;
  readonly author: MessageAuthor;
  readonly authorUserId: string | null;
  readonly body: string;
  readonly telegramMsgId: number | null;
  readonly status: MessageStatus;
  readonly error: string | null;
  readonly meta: Record<string, unknown>;
  readonly media: MessageMedia | null;
  /** Ovozli xabarning matni (STT natijasi). */
  readonly transcript: string | null;
  readonly transcriptStatus: TranscriptStatus;
  /**
   * XonzodaAI (o'zimizning STT) matni — FAQAT solishtirish uchun, agentga
   * bormaydi. Ixtiyoriy: eski yozuvlar va soxta repozitoriylarda yo'q.
   */
  readonly xonzoda?: XonzodaTranscript | null;
  readonly createdAt: Date;
  readonly sentAt: Date | null;
  /** Mijoz Telegramda o'qigan vaqt. Faqat chiquvchi xabarlarda. */
  readonly readAt: Date | null;
  /** Rasm turi. NULL — rasm emas yoki tasniflanmagan. */
  readonly imageKind: ImageKind | null;
  readonly imageStatus: ImageStatus;
  /** Vision qaytargan tavsif — FAQAT operator uchun, promptga tushmaydi. */
  readonly imageNote: string | null;
  /** Oxirgi tahrir vaqti. NULL — tahrirlanmagan. */
  readonly editedAt: Date | null;
  /** Mijoz dastlab ko'rgan matn — faqat birinchi tahrirda yoziladi. */
  readonly originalBody: string | null;
  /** Operator xabarni Telegramdan olib tashlagan vaqt. */
  readonly revokedAt: Date | null;
}

export interface NewMessage {
  conversationId: string;
  direction: MessageDirection;
  author: MessageAuthor;
  authorUserId?: string | null;
  body: string;
  telegramMsgId?: number | null;
  status?: MessageStatus;
  meta?: Record<string, unknown>;
  sentAt?: Date | null;
  media?: MessageMedia | null;
  transcript?: string | null;
  transcriptStatus?: TranscriptStatus;
  imageKind?: ImageKind | null;
  imageStatus?: ImageStatus;
  imageNote?: string | null;
}

/** Agentga va dashboardga beriladigan matn: ovoz bo'lsa — uning transkripti. */
export function readableBody(message: Pick<Message, 'body' | 'transcript' | 'media'>): string {
  if (message.transcript?.trim()) return message.transcript.trim();
  if (message.body.trim()) return message.body.trim();
  return message.media ? MEDIA_PLACEHOLDER[message.media.kind] : '';
}

export const MEDIA_PLACEHOLDER: Record<MediaKind, string> = {
  photo: '[mijoz rasm yubordi]',
  voice: '[ovozli xabar]',
  audio: '[audio fayl]',
  video: '[video]',
  video_note: '[video-xabar]',
  document: '[hujjat]',
  sticker: '[stiker]',
  other: '[fayl]',
};
