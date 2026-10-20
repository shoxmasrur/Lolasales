import type { ISettingsRepository } from '@/domain/repositories/ISupportRepositories';
import { decrypt, encrypt } from '@/shared/crypto';

export const LLM_SETTINGS_KEY = 'llm';

interface LlmSozlamasi {
  openaiKeyEnc?: string | null;
  openaiBaseUrl?: string | null;
}

/**
 * OpenAI kaliti bazada SHIFRLANGAN holda yashaydi (Telegram `api_hash_enc`
 * bilan bir xil usul) va hech qachon API javobiga chiqmaydi — panel faqat
 * «kiritilgan / yo'q» ni biladi.
 *
 * `.env` dagi kalit zaxira: bazada kalit bo'lsa u ustun. Shunday qilib
 * serverni qayta sozlamasdan paneldan almashtirish mumkin, lekin eski
 * o'rnatishlar ishlashda davom etadi.
 */
export class LlmKaliti {
  constructor(
    private readonly settings: ISettingsRepository,
    private readonly env: { envKey: string | undefined; envBaseUrl: string },
  ) {}

  async openAiKey(): Promise<string | null> {
    const saqlangan = await this.settings.get<LlmSozlamasi>(LLM_SETTINGS_KEY);
    const enc = saqlangan?.openaiKeyEnc;
    if (enc) return decrypt(enc);
    return this.env.envKey?.trim() || null;
  }

  /**
   * Kalit qayerdan kelayotganini aytadi — panel «O'chirish» tugmasini
   * to'g'ri ko'rsatishi uchun kerak: bazadagi qatorni o'chirish `.env`
   * dagi qiymatga ta'sir qilmaydi (`setOpenAiKey` faqat bazani tozalaydi),
   * ya'ni `.env` dan kelayotgan kalitni paneldan umuman o'chirib
   * bo'lmaydi.
   */
  async kalitManbasi(): Promise<'baza' | 'env' | null> {
    const saqlangan = await this.settings.get<LlmSozlamasi>(LLM_SETTINGS_KEY);
    if (saqlangan?.openaiKeyEnc) return 'baza';
    return this.env.envKey?.trim() ? 'env' : null;
  }

  /**
   * `hasOpenAiKey()` shifrni ochib ko'radi (`openAiKey()` orqali) — buzuq
   * shifr yoki almashgan `ENCRYPTION_KEY` bo'lsa `decrypt()` otiladi.
   * Bu shunchaki "kalit bor/yo'q" savoliga javob, shuning uchun bunday
   * holatda 500 bilan yiqilishdan ko'ra "yo'q" deb hisoblash to'g'riroq —
   * `GET /llm/key` panelni butunlay yiqitmasligi kerak.
   */
  async hasOpenAiKey(): Promise<boolean> {
    try {
      return (await this.openAiKey()) !== null;
    } catch {
      return false;
    }
  }

  /**
   * `userId` — foydalanuvchining UUID si, e-pochtasi EMAS: qiymat
   * `settings.updated_by` ustuniga tushadi va u UUID turida.
   */
  async setOpenAiKey(key: string | null, userId?: string): Promise<void> {
    const oldingi = (await this.settings.get<LlmSozlamasi>(LLM_SETTINGS_KEY)) ?? {};
    await this.settings.set(
      LLM_SETTINGS_KEY,
      { ...oldingi, openaiKeyEnc: key ? encrypt(key) : null },
      userId ?? null,
    );
  }

  async baseUrl(): Promise<string> {
    const saqlangan = await this.settings.get<LlmSozlamasi>(LLM_SETTINGS_KEY);
    return saqlangan?.openaiBaseUrl?.trim() || this.env.envBaseUrl;
  }
}
