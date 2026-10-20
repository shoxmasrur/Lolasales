import type {
  SpamStatus,
  TelegramAccount,
  TelegramAccountStatus,
} from '@/domain/entities/TelegramAccount';
import type { TelegramProxyPatch } from '@/domain/entities/telegramProxy';

export interface NewTelegramAccount {
  label: string;
  phone: string;
  apiId: number;
  apiHash: string;
  dailyLimit?: number;
  personaName?: string | null;
  lookupLimit?: number;
}

export interface ITelegramAccountRepository {
  findById(id: string): Promise<TelegramAccount | null>;
  findByPhone(phone: string): Promise<TelegramAccount | null>;
  list(): Promise<TelegramAccount[]>;
  listConnected(): Promise<TelegramAccount[]>;
  create(data: NewTelegramAccount): Promise<TelegramAccount>;
  saveSession(id: string, session: string): Promise<TelegramAccount>;
  setStatus(
    id: string,
    status: TelegramAccountStatus,
    extra?: { statusMessage?: string | null; tgUserId?: string | null; tgUsername?: string | null },
  ): Promise<TelegramAccount>;
  /**
   * FLOOD_WAIT ni yozadi. `flood_wait_since` FAQAT yangi cheklovda
   * qo'yiladi — davom etayotgan cheklovda tegilmaydi, aks holda
   * "qachondan beri" har xatoda oldinga siljib ketardi.
   */
  setFloodWait(id: string, until: Date): Promise<void>;
  /** PEER_FLOOD birinchi ko'rilganda vaqtni yozadi (takroriysida tegmaydi). */
  markPeerFlood(id: string): Promise<void>;
  /** Cheklov tozalanganini yozadi — tekshiruv `clean` qaytarganda. */
  clearPeerFlood(id: string): Promise<void>;
  setSpamStatus(
    id: string,
    status: SpamStatus,
    extra?: { message?: string | null; until?: Date | null },
  ): Promise<TelegramAccount>;
  /** Kunlik hisoblagichni atomik oshiradi va yangi qiymatni qaytaradi. */
  incrementSentToday(id: string, todayIso: string): Promise<number>;
  /** Qidiruv hisoblagichini atomik oshiradi va yangi qiymatni qaytaradi. */
  incrementLookupsToday(id: string, todayIso: string): Promise<number>;
  /** Bugungi hisoblagichni nolga tushiradi (operator qo'lda tiklaganda). */
  resetSentToday(id: string, todayIso: string): Promise<TelegramAccount>;
  update(
    id: string,
    patch: {
      label?: string;
      dailyLimit?: number;
      isEnabled?: boolean;
      personaName?: string | null;
      lookupLimit?: number;
      /** `null` — proksini butunlay o'chirish. */
      proxy?: TelegramProxyPatch | null;
      /** `null` — standart yo'lga (Claude, .env) qaytarish. */
      llmModelId?: string | null;
    },
  ): Promise<TelegramAccount>;
  /**
   * Premium tugash sanasini qo'yadi (`null` — Premium yo'q). Eslatma
   * bosqichi tozalanadi: yangi sana uchun eslatmalar qayta boshlanadi.
   */
  setPremium(id: string, untilIso: string | null): Promise<TelegramAccount>;
  /** Shu bosqich eslatmasi yuborilganini yozadi — takrorlanmasin. */
  markPremiumEslatildi(id: string, bosqich: number): Promise<void>;
  remove(id: string): Promise<void>;
}
