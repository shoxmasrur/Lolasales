import type { Client } from '@/domain/entities/Client';
import { NOMALUM_SABAB_ESKI_XABAR, NOMALUM_SABAB_TASDIQ } from '@/domain/entities/NomalumSuhbat';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { INomalumSuhbatRepository } from '@/domain/repositories/INomalumSuhbatRepository';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { IncomingMessage } from '@/domain/services/ITelegramGateway';
import { normalizePhone } from '@/shared/phone';

export function nomalumIsmi(incoming: Pick<IncomingMessage, 'fullName' | 'username'>): string {
  const ism = incoming.fullName.trim();
  if (ism) return ism;
  if (incoming.username?.trim()) return `@${incoming.username.trim()}`;
  return "Noma'lum mijoz";
}

/**
 * Telegramning o'z xizmat hisoblari: 777000 — kirish kodlari va tizim
 * xabarlari, 42777 — Telegram yordam xizmati. Ular "notanish odam" emas —
 * agent ularga shartnoma raqamini so'rab yozmasligi kerak.
 */
export const TELEGRAM_XIZMAT_IDLARI: ReadonlySet<string> = new Set(['777000', '42777']);

/**
 * Shundan eski kiruvchi xabarga noma'lum agent javob bermaydi. Deploy yoki
 * qayta ulanishdan keyin `fetchMissed` soatlab oldingi xabarlarni olib
 * keladi — notanish odamga kechikkan "salom, shartnoma raqamingiz?" yozish
 * o'rniga operator o'zi qaror qiladi.
 */
export const ESKI_XABAR_MS = 10 * 60 * 1000;

/**
 * Bazada yo'q jo'natuvchi uchun noma'lum mijoz yozuvini ochadi.
 * Telegram identifikatori darhol yoziladi — ikkinchi xabar
 * `findByTelegramUserId` orqali shu yozuvga tushsin (yangi mijoz ochilmasin).
 */
export class NomalumMijozOchuvchi {
  constructor(
    private readonly clients: Pick<IClientRepository, 'create' | 'setTelegramIdentity'>,
    private readonly nomalum: Pick<INomalumSuhbatRepository, 'ensure' | 'find' | 'update'>,
    /** O'z Telegram akkauntlarimiz — ular bir-biriga yozsa noma'lum mijoz ochilmaydi. */
    private readonly accounts: Pick<ITelegramAccountRepository, 'list'> | null = null,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Bu jo'natuvchi uchun noma'lum mijoz OCHILMAYDI: Telegram xizmati,
   * Telegram belgilagan rasmiy/yordam hisobi yoki o'zimizning akkauntimiz.
   * Aks holda bular "notanish" deb ochilib, agent ularga yozib yuborardi.
   */
  async xizmatYozuvchisimi(incoming: Pick<IncomingMessage, 'telegramUserId' | 'xizmatHisobi'>): Promise<boolean> {
    if (TELEGRAM_XIZMAT_IDLARI.has(incoming.telegramUserId)) return true;
    if (incoming.xizmatHisobi) return true;
    if (!this.accounts) return false;
    const bizniki = await this.accounts.list();
    return bizniki.some((a) => a.tgUserId === incoming.telegramUserId);
  }

  /** Xabar noma'lum agent javob beradigan darajada yangi emasmi. */
  eskimi(receivedAt: Date): boolean {
    return this.now().getTime() - receivedAt.getTime() > ESKI_XABAR_MS;
  }

  /**
   * Eski xabar: model chaqirilmaydi, operator chaqiriladi. Natija —
   * chaqiruvchi qo'yadigan `humanReason` (`null` — belgi kerak emas).
   *   • `kutilmoqda` → `operatorda`, eski xabar sababi;
   *   • `hujjat_kutilmoqda` → holat QOLADI (topilgan mijoz va bir bosishli
   *     tasdiq yo'qolmasin), lekin xabar jim yo'qolmasin — tasdiq sababi;
   *   • qolganlari (`tasdiq_kutilmoqda` va h.k.) — tegilmaydi.
   */
  async eskiniOperatorga(conversationId: string): Promise<string | null> {
    const suhbat = await this.nomalum.find(conversationId);
    if (suhbat?.holat === 'hujjat_kutilmoqda') return NOMALUM_SABAB_TASDIQ;
    if (suhbat?.holat !== 'kutilmoqda') return null;
    await this.nomalum.update(conversationId, { holat: 'operatorda', sabab: 'Eski xabar — agent javob bermadi' });
    return NOMALUM_SABAB_ESKI_XABAR;
  }

  /**
   * Telefon mijozga YOZILMAYDI: Telegram bergan raqam tasdiqlanmagan va
   * CRM raqami bilan to'qnashishi mumkin. U holat jadvaliga tushadi.
   */
  async och(incoming: IncomingMessage): Promise<Client> {
    const client = await this.clients.create({ fullName: nomalumIsmi(incoming), nomalum: true });
    // Qaytgan yozuvni qaytaramiz (telegramUserId bilan): chaqiruvchi uni
    // "identifikator yo'q" deb bilib, ikkinchi marta yozmasin — u
    // `telegram_name` ni o'chirib yuborardi.
    return this.clients.setTelegramIdentity(
      client.id,
      {
        telegramUserId: incoming.telegramUserId,
        telegramUsername: incoming.username,
        telegramAccessHash: incoming.accessHash,
        // Hash xabar KELGAN akkauntniki — faqat o'sha akkaunt ishlata oladi.
        telegramHashAccountId: incoming.telegramAccountId,
        telegramName: incoming.fullName || null,
      },
      'found',
    );
  }

  /** Holat qatorini yaratadi/yangilaydi; Telegram telefoni shu yerga yoziladi. */
  async suhbatniBelgila(conversationId: string, telegramTelefon: string | null): Promise<void> {
    await this.nomalum.ensure(conversationId, normalizePhone(telegramTelefon));
  }
}
