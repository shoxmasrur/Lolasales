import type { ISettingsRepository } from '@/domain/repositories/ISupportRepositories';
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
  /** Kelishilgan kunning ertalabida yumshoq eslatma yuborilsinmi. */
  promiseReminder: boolean;
  /**
   * Eslatma shu vaqtgacha yuboriladi (HH:mm). Boshlanishi — ish vaqtining
   * boshlanishi. Kunning ikkinchi yarmida eslatishning ma'nosi yo'q:
   * mijoz to'lovni kun davomida rejalashtiradi, kechqurun eslatma esa
   * eslatma emas, ta'qib bo'lib qoladi.
   */
  promiseReminderUntil: string;
  /**
   * "Pul tushdi" xabari shu vaqtgacha yuboriladi (HH:mm). Boshlanishi —
   * ish vaqtining boshlanishi, kunlari — umumiy `weekdays` sozlamasi.
   *
   * To'lov bankdan istalgan payt, shu jumladan tunda ko'rinishi mumkin.
   * Xabarni o'sha zahoti yuborish — yarim kechada mijozning telefonini
   * jiringlatish demak. Pul kelgani ertalabgacha kutadi.
   */
  promiseThanksUntil: string;
  /** Mijoz javob bermay qo'yganda agent o'zi qayta yozsinmi. */
  silenceNudge: boolean;
  /**
   * Necha ISH KUNI sukutdan keyin qayta yoziladi. Yakshanba sanalmaydi:
   * banklar ishlamaydi, ya'ni o'sha kuni to'lov o'tmagan bo'lishi mumkin.
   */
  silenceNudgeDays: number;
  /**
   * Bitta sukut zanjirida eng ko'pi necha marta. Mijoz javob berishi
   * bilan hisoblagich nolga qaytadi, ya'ni bu "ketma-ket javobsiz"
   * chegarasi — suhbat umri davomidagi jami emas.
   */
  silenceNudgeMax: number;
  /** Yangi oylik to'lov sanasi kelganda avval yozilgan mijozga eslatma. */
  oylikEslatma: boolean;
  /** B guruhi (faqat shu oy qolgan): sanadan necha kun OLDIN. */
  oylikEslatmaOldinKun: number;
  /** C guruhi (oldingi oylardan ham qolgan): sanadan necha kun KEYIN, 0 — sana kuni. */
  oylikEslatmaKeyinKun: number;
  /** Bir kunda eng ko'pi nechta eslatma — yetkazib olish navbati shunga bo'linadi. */
  oylikEslatmaKunlik: number;
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
  /**
   * Minimal qarzdorlik chegarasi (so'm). Kechikkan to'lovi shu summadan
   * KATTA bo'lmagan mijozga yozilmaydi.
   *
   * NEGA KERAK: 800-1000 so'mlik qoldiq — yaxlitlash farqi, qarz emas.
   * Bunday mijozga yozilgan xabar hech qanday to'lovni tezlashtirmaydi,
   * lekin akkauntning kunlik kvotasini yeydi va mijozning butun
   * hisob-kitobga bo'lgan ishonchini so'ndiradi.
   *
   * Qaror MIJOZ bo'yicha: barcha "Сотилди" shartnomalarining kechikkan
   * summasi qo'shilib solishtiriladi. Har shartnoma alohida tekshirilsa,
   * 900 so'mdan uchta shartnomasi bor mijoz (jami 2700) 1000 lik
   * chegarada o'tkazib yuborilardi — agent esa 2700 deb yozgan bo'lardi.
   *
   * 0 — chegara o'chirilgan (faqat nol kechikish "yo'q" hisoblanadi).
   *
   * DIQQAT: `CampaignFilters.minDebt` (`Campaign.ts`) BILAN ADASHTIRMANG
   * — nom bir xil, ma'no teskari (u yerda izoh bor).
   */
  minDebt: number;
  /** Noma'lum Telegram yozuvchilariga sotuv bo'limi telefoni (xaridorlar uchun). */
  sotuvRaqami: string;
  /** Noma'lum mijoz agenti yoqilganmi; o'chiqda suhbat operatorga tushadi. */
  nomalumAgent: boolean;
}

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
      personaName: stored.personaName ?? 'Madina',
      promiseReminder: stored.promiseReminder ?? true,
      promiseReminderUntil: stored.promiseReminderUntil ?? '12:00',
      promiseThanksUntil: stored.promiseThanksUntil ?? '18:00',
      silenceNudge: stored.silenceNudge ?? true,
      silenceNudgeDays: stored.silenceNudgeDays ?? 1,
      silenceNudgeMax: stored.silenceNudgeMax ?? 2,
      oylikEslatma: stored.oylikEslatma ?? false,
      oylikEslatmaOldinKun: stored.oylikEslatmaOldinKun ?? 2,
      oylikEslatmaKeyinKun: stored.oylikEslatmaKeyinKun ?? 0,
      oylikEslatmaKunlik: stored.oylikEslatmaKunlik ?? 60,
      gateMessageMinSec: stored.gateMessageMinSec ?? 5,
      gateMessageMaxSec: stored.gateMessageMaxSec ?? 20,
      gateOtherMinSec: stored.gateOtherMinSec ?? 1,
      gateOtherMaxSec: stored.gateOtherMaxSec ?? 4,
      minDebt: stored.minDebt ?? 100_000,
      sotuvRaqami: stored.sotuvRaqami ?? '71 200 74 00',
      nomalumAgent: stored.nomalumAgent ?? true,
    };
  }

  async update(patch: Partial<OutreachSettings>, updatedBy?: string | null): Promise<OutreachSettings> {
    const current = await this.get();
    const next = { ...current, ...patch };
    await this.repo.set(SETTINGS_KEY, next, updatedBy);
    return next;
  }
}
