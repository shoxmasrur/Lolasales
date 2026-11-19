import type { ISettingsRepository } from '@/domain/repositories/ISupportRepositories';
import type { PaymentCard } from '@/domain/services/karta';
import { config } from '@/shared/config';

export interface OutreachSettings {
  /**
   * Yangi KAMPANIYA uchun kunlik standart.
   *
   * DIQQAT: bu akkauntning kunlik chegarasi EMAS. Akkaunt chegarasi
   * `telegram_accounts.daily_limit` da va Telegram sahifasidan
   * sozlanadi. Bu qiymat faqat `CreateCampaignUseCase` da ishlatiladi.
   */
  dailyLimit: number;
  minDelaySec: number;
  maxDelaySec: number;
  windowStart: string;
  windowEnd: string;
  weekdays: number[];
  killSwitch: boolean;
  agentAutoReply: boolean;
  personaName: string;
  /** Jim qolgan mijozga bosqichiga bitta yumshoq eslatma yuborilsinmi. */
  eslatmaYoqilgan: boolean;
  /** Eslatma oxirgi xabardan necha soat o'tgach yuboriladi (1–168). */
  eslatmaSoat: number;
  /**
   * Bitta akkauntning ikki Telegram operatsiyasi orasidagi tasodifiy tanaffus.
   *
   * Kampaniya pauzasi (`minDelaySec`/`maxDelaySec`) BILAN ADASHTIRMANG: u
   * ikki MIJOZ orasidagi oraliq va daqiqalar bilan o'lchanadi. Bu yerdagi
   * qiymatlar esa akkauntning har qanday ikki chaqiruvi orasidagi eng kichik
   * bo'shliq — mijozga javob, qidiruv, tarix o'qish, hammasi.
   *
   * NEGA KERAK: bir vaqtda ketgan ikki so'rov ham, doimiy bir xil oraliq ham
   * Telegram uchun bot belgisi. Tasodifiy tanaffus jonli odamning tempiga
   * yaqinlashtiradi.
   */
  gateMessageMinSec: number;
  gateMessageMaxSec: number;
  /** Qidiruv, tarix o'qish, holat tekshiruvi — bular ancha xavfsiz. */
  gateOtherMinSec: number;
  gateOtherMaxSec: number;
  /** To'lov kartalari; xabarga birinchi faol karta tushadi (LLM raqam yozmaydi). */
  paymentCards: PaymentCard[];
  /** Kompaniya nomi (agent matnlarida). */
  kompaniyaNomi: string;
  /** Kanal izohlarini saralash uchun kalit so'zlar ("+" — faqat yolg'iz plyus). */
  izohKalitSozlari: string[];
  /** Bir yig'ishda barcha postlar bo'yicha jami o'qiladigan izohlar (50–2000). */
  izohLimit: number;
  /** Kalit so'zga mos izoh egalarini AVTOMATIK lead qilish (standart: o'chiq). */
  izohAvtoYoqilgan: boolean;
  /** Qaysi akkaunt kanallarni o'qiydi; null — birinchi ulangan akkaunt. */
  izohAvtoAkkauntId: string | null;
  /** Avtomatik tekshiruv oralig'i, daqiqa (5–1440). */
  izohAvtoOraliqMin: number;
  /** Faqat oxirgi shuncha kunlik postlar izohlari o'qiladi (1–30). */
  izohAvtoKunlar: number;
  /** Bir yurishda olinadigan yangi leadlarning eng ko'pi (1–50). */
  izohAvtoMaxYangi: number;
  /** Hamyoncha orqali pulni avtomatik tekshirish (standart: o'chiq). */
  hamyonYoqilgan: boolean;
  /** Pul tushmagan bo'lsa, shuncha daqiqa kutilib, keyin adminga aytiladi (5–180). */
  hamyonKutishDaq: number;
  /** Hamyoncha botiga kirish uchun akkaunt; null — birinchi ulangan akkaunt. */
  hamyonAkkauntId: string | null;
  /** Bot chatining manzili (birinchi marta topilgach saqlanadi). */
  hamyonBot: { peerId: string; accessHash: string } | null;
}

export const IZOH_KALIT_SOZLARI = ['menga xabar bering', 'menga yozing', 'qiziqaman', 'narxi', '+'];

export const SETTINGS_KEY = 'outreach';

/**
 * Ish rejimi sozlamalari: bazadagi qiymat ustuvor, bo'lmasa .env dan olinadi.
 * Dashboarddan o'zgartirilganda darhol kuchga kiradi (keshsiz).
 */
export class RuntimeSettings {
  constructor(private readonly repo: ISettingsRepository) {}

  async get(): Promise<OutreachSettings> {
    const stored = (await this.repo.get<Partial<OutreachSettings>>(SETTINGS_KEY)) ?? {};
    return {
      dailyLimit: stored.dailyLimit ?? config.OUTREACH_DAILY_LIMIT,
      minDelaySec: stored.minDelaySec ?? config.OUTREACH_MIN_DELAY_SEC,
      maxDelaySec: stored.maxDelaySec ?? config.OUTREACH_MAX_DELAY_SEC,
      windowStart: stored.windowStart ?? config.OUTREACH_WINDOW_START,
      windowEnd: stored.windowEnd ?? config.OUTREACH_WINDOW_END,
      weekdays: stored.weekdays ?? [1, 2, 3, 4, 5, 6],
      killSwitch: stored.killSwitch ?? config.KILL_SWITCH,
      agentAutoReply: stored.agentAutoReply ?? config.AGENT_AUTO_REPLY,
      personaName: stored.personaName ?? 'Lola',
      eslatmaYoqilgan: stored.eslatmaYoqilgan ?? true,
      eslatmaSoat: stored.eslatmaSoat ?? 24,
      gateMessageMinSec: stored.gateMessageMinSec ?? 5,
      gateMessageMaxSec: stored.gateMessageMaxSec ?? 20,
      gateOtherMinSec: stored.gateOtherMinSec ?? 1,
      gateOtherMaxSec: stored.gateOtherMaxSec ?? 4,
      paymentCards: stored.paymentCards ?? [],
      kompaniyaNomi: stored.kompaniyaNomi ?? 'LolaSales',
      izohKalitSozlari: stored.izohKalitSozlari ?? IZOH_KALIT_SOZLARI,
      izohLimit: stored.izohLimit ?? 500,
      izohAvtoYoqilgan: stored.izohAvtoYoqilgan ?? false,
      izohAvtoAkkauntId: stored.izohAvtoAkkauntId ?? null,
      izohAvtoOraliqMin: stored.izohAvtoOraliqMin ?? 60,
      izohAvtoKunlar: stored.izohAvtoKunlar ?? 3,
      izohAvtoMaxYangi: stored.izohAvtoMaxYangi ?? 10,
      hamyonYoqilgan: stored.hamyonYoqilgan ?? false,
      hamyonKutishDaq: stored.hamyonKutishDaq ?? 30,
      hamyonAkkauntId: stored.hamyonAkkauntId ?? null,
      hamyonBot: stored.hamyonBot ?? null,
    };
  }

  async update(patch: Partial<OutreachSettings>, updatedBy?: string | null): Promise<OutreachSettings> {
    const current = await this.get();
    const next = { ...current, ...patch };
    await this.repo.set(SETTINGS_KEY, next, updatedBy);
    return next;
  }
}
