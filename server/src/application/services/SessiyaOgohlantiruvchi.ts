import type { DomainEvent, IEventBus } from '@/domain/services/support';
import type { XulosaBoti } from '@/application/services/XulosaBoti';
import { olimIzohi } from '@/infrastructure/telegram/sessiyaIzi';
import { childLogger } from '@/shared/logger';
import { formatPhone } from '@/shared/phone';

const log = childLogger('sessiya-ogohlantiruvchi');

type SessiyaYoqoldi = Extract<DomainEvent, { type: 'telegram.session_lost' }>;

/** Ogohlantirish matni. Oddiy matn — `parse_mode` berilmaydi. */
export function sessiyaXabari(e: SessiyaYoqoldi, vaqt: Date, timeZone: string, panel: string | null): string {
  const soat = new Intl.DateTimeFormat('ru-RU', {
    timeZone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(vaqt);
  return [
    '⚠️ Telegram akkaunt chiqib ketdi',
    '',
    `Akkaunt: ${e.label} (${formatPhone(e.phone)})`,
    `Vaqt: ${soat}`,
    `Sabab: ${e.kod}`,
    olimIzohi(e.kod),
    '',
    panel ? `Qayta ulash: ${panel}/telegram` : 'Panelda Telegram sahifasidan qayta ulang.',
  ].join('\n');
}

/**
 * Akkaunt sessiyasi uzilganda administratorga Telegram orqali xabar beradi.
 *
 * NEGA KERAK: chiqib ketgan akkaunt mijozlarga yozmaydi va javoblarni ham
 * olmaydi, panelga esa hech kim qarab turmaydi — 2026-09-24..10-02 da
 * bir necha akkaunt soatlab shu holatda qolgan. Sessiyani faqat odam
 * tiklaydi (SMS kod + 2FA), shuning uchun u darhol bilishi kerak.
 *
 * Xabar kunlik xulosa boti orqali ketadi («Sozlamalar» → bot). Bot
 * ulanmagan bo'lsa xabar ketmaydi — bu jurnalga `warn` bo'lib tushadi.
 */
export class SessiyaOgohlantiruvchi {
  constructor(
    private readonly events: IEventBus,
    private readonly bot: Pick<XulosaBoti, 'xabarYubor'>,
    private readonly timeZone: string,
    private readonly panel: string | null,
  ) {}

  start(): () => void {
    return this.events.subscribe((event) => {
      if (event.type !== 'telegram.session_lost') return;
      void this.yubor(event);
    });
  }

  private async yubor(e: SessiyaYoqoldi): Promise<void> {
    try {
      const ketdi = await this.bot.xabarYubor(sessiyaXabari(e, new Date(), this.timeZone, this.panel));
      if (ketdi) {
        log.info({ akkaunt: e.label, kod: e.kod }, 'Sessiya uzilgani haqida xabar yuborildi');
      } else {
        log.warn(
          { akkaunt: e.label, kod: e.kod },
          'Sessiya uzildi, lekin Telegram xabari KETMADI — «Sozlamalar»da bot ulanmagan yoki yuborish yiqildi',
        );
      }
    } catch (err) {
      log.error({ akkaunt: e.label, err }, 'Sessiya ogohlantirishini yuborib bo\'lmadi');
    }
  }
}
