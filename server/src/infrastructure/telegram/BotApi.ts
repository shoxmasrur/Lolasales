import type { TelegramYangilanish } from '@/domain/services/botTokeni';

/**
 * Telegram Bot API — kunlik xulosa uchun.
 *
 * MTProto akkauntlari bilan HECH QANDAY aloqasi yo'q: ular mijozlarga
 * yozadi, bu esa faqat administrator bilan yozishadi. Shuning uchun
 * alohida, eng sodda yo'l — `fetch`, yangi kutubxonasiz.
 */

const BAZA = 'https://api.telegram.org';
/** Telegram javob bermasa, panel muzlab qolmasin. */
const KUTISH_MS = 10_000;

export interface BotMeMalumoti {
  readonly username: string | null;
}

export class BotApi {
  private async chaqir<T>(token: string, metod: string, body?: unknown): Promise<T> {
    let javob: Response;
    try {
      javob = await fetch(`${BAZA}/bot${token}/${metod}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
        signal: AbortSignal.timeout(KUTISH_MS),
      });
    } catch {
      // Tarmoq xatosi va timeout bir xil ko'rinadi — ikkalasi ham
      // "Telegramga ulanib bo'lmadi".
      throw new Error('Telegramga ulanib bo\'lmadi');
    }

    const natija = (await javob.json().catch(() => null)) as
      | { ok?: boolean; result?: T; description?: string }
      | null;

    if (!natija?.ok) {
      throw new Error(natija?.description ?? `Telegram xatosi (${javob.status})`);
    }
    return natija.result as T;
  }

  async getMe(token: string): Promise<BotMeMalumoti> {
    const r = await this.chaqir<{ username?: string }>(token, 'getMe');
    return { username: r.username ?? null };
  }

  /**
   * Botga kelgan oxirgi xabarlar.
   *
   * `offset: -50`: manfiy `offset` Telegramga navbatning OXIRIDAN `|offset|`
   * tagacha yangilanishni qaytarishni buyuradi va hech narsani
   * tasdiqlamaydi (qayta-qayta o'qish mumkin bo'lib qoladi). Buni
   * bermasak, Telegram navbatning ENG ESKI tasdiqlanmagan yangilanishidan
   * boshlab qaytaradi — 50 tadan ko'p kutilayotgan yangilanish yig'ilib
   * qolsa (24 soatlik saqlash oynasida bu oson bo'ladi), admin yuborgan
   * yangi kod umuman ko'rinmay qoladi.
   */
  async getUpdates(token: string): Promise<TelegramYangilanish[]> {
    return this.chaqir<TelegramYangilanish[]>(token, 'getUpdates', {
      offset: -50,
      limit: 50,
      timeout: 0,
    });
  }

  async sendMessage(token: string, chatId: string, text: string, parseMode?: 'HTML'): Promise<void> {
    const body: Record<string, unknown> = { chat_id: chatId, text };
    // `parse_mode` faqat SO'ROVCHI berganda yuboriladi: mijoz ismidagi
    // `<`/`&` kabi belgilar HTML deb tushunilib, butun xabarni yiqitmasin.
    if (parseMode) body.parse_mode = parseMode;
    await this.chaqir(token, 'sendMessage', body);
  }
}
