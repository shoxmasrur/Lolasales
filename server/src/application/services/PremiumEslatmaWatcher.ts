import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import { premiumEslatmasi, premiumXabari } from '@/domain/services/premium';
import type { IClock } from '@/domain/services/support';
import type { XulosaBoti } from '@/application/services/XulosaBoti';
import { zonedParts } from '@/shared/datetime';
import { childLogger } from '@/shared/logger';

const log = childLogger('premium-eslatma');

const CHECK_INTERVAL_MS = 60 * 60 * 1000;
/** Eslatma faqat shu soatlar orasida ketadi — tunda administratorni uyg'otmaslik uchun. */
const ERTA_SOAT = 9;
const KECH_SOAT = 20;

/**
 * Telegram Premium tugashiga 30, 7, 1 kun qolganda va tugagan kuni
 * administratorga xulosa boti orqali eslatma yuboradi (2026-10-09).
 *
 * Bosqich faqat xabar HAQIQATDA ketgandan keyin belgilanadi: bot
 * ulanmagan bo'lsa keyingi soatda yana uriniladi. Sana yangilanganda
 * (`setPremium`) belgi tozalanadi va hisob qaytadan boshlanadi.
 */
export class PremiumEslatmaWatcher {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly accounts: Pick<ITelegramAccountRepository, 'list' | 'markPremiumEslatildi'>,
    private readonly bot: Pick<XulosaBoti, 'xabarYubor'>,
    private readonly clock: IClock,
    private readonly timeZone: string,
    private readonly panel: string | null,
  ) {}

  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.run();
    } catch (err) {
      log.error({ err }, 'Premium eslatma tsiklida xato');
    } finally {
      this.running = false;
    }
  }

  /** @returns nechta eslatma haqiqatda yuborilgani */
  async run(): Promise<number> {
    const { hour } = zonedParts(this.clock.now(), this.timeZone);
    if (hour < ERTA_SOAT || hour >= KECH_SOAT) return 0;

    const today = this.clock.todayIso();
    let yuborildi = 0;
    for (const a of await this.accounts.list()) {
      const bosqich = premiumEslatmasi(a.premiumUntil, a.premiumEslatildi, today);
      if (bosqich === null || !a.premiumUntil) continue;

      const ketdi = await this.bot.xabarYubor(
        premiumXabari({ label: a.label, phone: a.phone, premiumUntil: a.premiumUntil }, today, this.panel),
      );
      if (!ketdi) {
        log.warn(
          { akkaunt: a.label, tugash: a.premiumUntil },
          'Premium tugayapti, lekin Telegram xabari KETMADI — «Sozlamalar»da bot ulanmagan yoki yuborish yiqildi',
        );
        continue;
      }
      await this.accounts.markPremiumEslatildi(a.id, bosqich);
      yuborildi += 1;
      log.info({ akkaunt: a.label, tugash: a.premiumUntil, bosqich }, 'Premium eslatmasi yuborildi');
    }
    return yuborildi;
  }
}
