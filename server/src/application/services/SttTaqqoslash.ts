import { VOICE_KINDS, type XonzodaTranscript, type Message } from '@/domain/entities/Message';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { IMediaStorage } from '@/domain/services/IMediaStorage';
import type { ISpeechToText } from '@/domain/services/ISpeechToText';
import type { IEventBus } from '@/domain/services/support';
import { childLogger } from '@/shared/logger';

const log = childLogger('stt:taqqoslash');

/**
 * Navbatda shuncha xabardan ortig'i tashlanadi — platforma uzoq vaqt
 * javob bermasa xotira to'lib ketmasin. Solishtirish monitoring uchun,
 * bir nechta xabar tushib qolsa zarar yo'q.
 */
const NAVBAT_CHEGARASI = 100;

/**
 * Ovozli xabarni XonzodaAI'ga ham yuborib, natijani Aisha matni yoniga yozadi.
 *
 * NEGA FONDA: asosiy matn (Aisha) va agent javobi buni KUTMASLIGI kerak —
 * XonzodaAI jonli qo'ng'iroqlar bilan bitta GPU'da ishlaydi va band bo'lishi
 * mumkin. Natija agentga bormaydi: bu faqat XonzodaAI sifatini Aisha bilan
 * solishtirish uchun (foydalanuvchi qarori, 2026-10-15).
 *
 * NEGA KETMA-KET: platforma bir vaqtda 2 ta so'rov qabul qiladi va
 * ortig'ini rad etadi; bittadan yuborsak qo'ng'iroqlarga joy qoladi.
 *
 * Hech qachon xato tashlamaydi.
 */
export class SttTaqqoslash {
  private tail: Promise<void> = Promise.resolve();
  private navbatda = 0;

  constructor(
    private readonly stt: ISpeechToText,
    private readonly storage: IMediaStorage,
    private readonly messages: Pick<IMessageRepository, 'setXonzodaTranscript'>,
    private readonly events: IEventBus,
    private readonly now: () => number = Date.now,
  ) {}

  /** Saqlangan kiruvchi xabar uchun solishtiruvni navbatga qo'yadi. */
  boshla(message: Message): void {
    if (!this.stt.available) return;
    const media = message.media;
    if (!media || !VOICE_KINDS.has(media.kind) || !media.path) return;
    if (this.navbatda >= NAVBAT_CHEGARASI) {
      log.warn({ messageId: message.id }, 'XonzodaAI navbati to\'la — solishtirish o\'tkazib yuborildi');
      return;
    }

    this.navbatda += 1;
    const path = media.path;
    this.tail = this.tail
      .then(() => this.bittasi(message, path, media.mimeType, media.fileName, media.durationSec))
      .catch((err: unknown) => log.warn({ err, messageId: message.id }, 'XonzodaAI solishtiruvida kutilmagan xato'))
      .finally(() => {
        this.navbatda -= 1;
      });
  }

  /** Navbat bo'shaguncha kutadi (testlar uchun). */
  idle(): Promise<void> {
    return this.tail;
  }

  private async bittasi(
    message: Message,
    path: string,
    mimeType: string | null,
    fileName: string | null,
    durationSec: number | null,
  ): Promise<void> {
    const boshi = this.now();
    let natija: XonzodaTranscript;
    try {
      const audio = await this.storage.read(path);
      const r = await this.stt.transcribe({
        audio,
        fileName: fileName ?? path.split('/').pop() ?? 'voice.ogg',
        mimeType,
        durationSec,
      });
      const ms = this.now() - boshi;
      natija = r.ok
        ? { status: 'done', text: r.text, error: null, ms }
        : { status: 'failed', text: null, error: r.reason, ms };
    } catch (err) {
      natija = {
        status: 'failed',
        text: null,
        error: err instanceof Error ? err.message : 'Noma\'lum xato',
        ms: this.now() - boshi,
      };
    }

    await this.messages.setXonzodaTranscript(message.id, natija);
    this.events.publish({ type: 'message.updated', conversationId: message.conversationId, messageId: message.id });
    log.info({ messageId: message.id, status: natija.status, ms: natija.ms }, 'XonzodaAI solishtiruvi yozildi');
  }
}
