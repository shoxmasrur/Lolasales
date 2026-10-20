import type { Client, ClientSource, NewClient } from '@/domain/entities/Client';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IncomingMessage, ResolvedPeer } from '@/domain/services/ITelegramGateway';
import type { IEventBus } from '@/domain/services/support';
import type { XaridXizmati } from '@/application/services/XaridXizmati';
import { normalizePhone } from '@/shared/phone';
import { uniqueBuzildimi } from '@/shared/pgErrors';
import { ValidationError } from '@/shared/errors';
import { childLogger } from '@/shared/logger';

const log = childLogger('mijoz-yaratuvchi');

/** Ism berilmagan odam uchun: to'liq ism, bo'lmasa @username, bo'lmasa telefon. */
export function kiruvchiIsmi(i: Pick<IncomingMessage, 'fullName' | 'username' | 'phone'>): string {
  const ism = i.fullName.trim();
  if (ism) return ism;
  if (i.username?.trim()) return `@${i.username.trim()}`;
  const tel = normalizePhone(i.phone);
  if (tel) return tel;
  return 'Telegram foydalanuvchisi';
}

/**
 * Yangi mijozni uch manbadan yaratadi: reklama (kiruvchi xabar), guruh va
 * raqam (Excel). Mavjud mijoz topilsa — o'sha qaytariladi va manbasi
 * O'ZGARTIRILMAYDI.
 */
export class MijozYaratuvchi {
  constructor(
    private readonly clients: Pick<IClientRepository, 'findByTelegramUserId' | 'findByPhone' | 'create'>,
    private readonly xarid: Pick<XaridXizmati, 'faolXarid' | 'kursBelgila'>,
    private readonly events: IEventBus,
  ) {}

  /**
   * Begona odam sotuv akkauntiga yozdi — u lead. Telegram shaxsi yaratish bilan
   * BIR INSERT'da yoziladi (unique indeks poygani yopadi), faol xarid `yangi`.
   * Idempotent: mavjud mijoz bo'lsa yangisi ochilmaydi.
   */
  async reklamadan(incoming: IncomingMessage): Promise<Client> {
    const phone = normalizePhone(incoming.phone);
    const { client, created } = await this.yarat(incoming.telegramUserId, {
      fullName: kiruvchiIsmi(incoming),
      phone,
      source: 'reklama',
      telegram: {
        telegramUserId: incoming.telegramUserId,
        telegramUsername: incoming.username,
        telegramAccessHash: incoming.accessHash,
        // Hash xabar KELGAN akkauntniki — faqat o'sha akkaunt uni ishlata oladi.
        telegramHashAccountId: incoming.telegramAccountId,
        telegramName: incoming.fullName.trim() || null,
        telegramAccountId: incoming.telegramAccountId,
      },
    }, phone);
    if (created) await this.yangiMijoz(client, 'reklama');
    return client;
  }

  /** Guruh a'zosi (izoh/xabar yozgan). Takrorlanish `telegramUserId` bo'yicha. */
  async guruhdan(i: {
    accountId: string;
    peer: ResolvedPeer;
    fullName: string;
    sourceGroup: string;
    sourceComment: string;
  }): Promise<{ client: Client; created: boolean }> {
    const natija = await this.yarat(i.peer.telegramUserId, {
      fullName: i.fullName.trim() || (i.peer.username ? `@${i.peer.username}` : 'Telegram foydalanuvchisi'),
      source: 'guruh',
      sourceGroup: i.sourceGroup,
      sourceComment: i.sourceComment,
      telegram: {
        telegramUserId: i.peer.telegramUserId,
        telegramUsername: i.peer.username,
        telegramAccessHash: i.peer.accessHash,
        telegramHashAccountId: i.accountId,
        telegramName: i.fullName.trim() || null,
        telegramAccountId: i.accountId,
      },
    });
    if (natija.created) await this.yangiMijoz(natija.client, 'guruh');
    return natija;
  }

  /** Excel raqami. Takrorlanish `findByPhone` bo'yicha. */
  async raqamdan(i: {
    fullName: string;
    phone: string;
    courseId: string | null;
    batchId: string;
  }): Promise<{ client: Client; created: boolean }> {
    const phone = normalizePhone(i.phone) ?? i.phone;
    const mavjud = await this.clients.findByPhone(phone);
    if (mavjud) return { client: mavjud, created: false };

    const client = await this.clients.create({
      fullName: i.fullName.trim() || phone,
      phone,
      source: 'raqam',
      createdImportBatchId: i.batchId,
    });
    await this.yangiMijoz(client, 'raqam', i.courseId);
    return { client, created: true };
  }

  /** Menejer qo'lda qo'shgan mijoz. Takrorlanish `findByPhone` bo'yicha. */
  async qoldan(i: {
    fullName: string;
    phone: string;
    courseId: string | null;
  }): Promise<{ client: Client; created: boolean }> {
    const phone = normalizePhone(i.phone) ?? i.phone;
    // Ikki marta bosilgan "Qo'shish": bir telefon uchun bir vaqtda bitta yaratish —
    // ikkinchi so'rov birinchisining natijasini (mavjud mijoz sifatida) oladi.
    const ketayotgan = this.qoldaKetayotgan.get(phone);
    if (ketayotgan) return { client: (await ketayotgan).client, created: false };
    const ish = this.qoldanIchki(i.fullName, phone, i.courseId);
    this.qoldaKetayotgan.set(phone, ish);
    try {
      return await ish;
    } finally {
      this.qoldaKetayotgan.delete(phone);
    }
  }

  private readonly qoldaKetayotgan = new Map<string, Promise<{ client: Client; created: boolean }>>();

  private async qoldanIchki(
    fullName: string,
    phone: string,
    courseId: string | null,
  ): Promise<{ client: Client; created: boolean }> {
    const mavjud = await this.clients.findByPhone(phone);
    if (mavjud) return { client: mavjud, created: false };
    let client: Client;
    try {
      client = await this.clients.create({ fullName: fullName.trim() || phone, phone, source: 'qolda' });
    } catch (err) {
      if (!uniqueBuzildimi(err)) throw err;
      // Poyga: boshqa jarayon shu raqamli mijozni ulgurib yaratdi.
      const endi = await this.clients.findByPhone(phone);
      if (endi) return { client: endi, created: false };
      throw new ValidationError('Bu raqamli mijoz allaqachon qo\'shilmoqda — ro\'yxatni yangilang');
    }
    await this.yangiMijoz(client, 'qolda', courseId);
    return { client, created: true };
  }

  private async yarat(
    telegramUserId: string,
    data: NewClient,
    phone?: string | null,
  ): Promise<{ client: Client; created: boolean }> {
    const mavjud = await this.mavjud(telegramUserId, phone ?? null);
    if (mavjud) return { client: mavjud, created: false };
    try {
      return { client: await this.clients.create(data), created: true };
    } catch (err) {
      if (!uniqueBuzildimi(err)) throw err;
      // Poyga: bir vaqtda kelgan ikkinchi xabar mijozni ulgurib yaratdi.
      const endi = await this.clients.findByTelegramUserId(telegramUserId);
      if (endi) return { client: endi, created: false };
      throw err;
    }
  }

  private async mavjud(telegramUserId: string, phone: string | null): Promise<Client | null> {
    const tg = await this.clients.findByTelegramUserId(telegramUserId);
    if (tg) return tg;
    return phone ? this.clients.findByPhone(phone) : null;
  }

  private async yangiMijoz(client: Client, manba: ClientSource, courseId: string | null = null): Promise<void> {
    try {
      // Kurs ma'lum bo'lsa (Excel "Kurs" ustuni) xarid shu kursga ochiladi.
      if (courseId) await this.xarid.kursBelgila(client.id, courseId);
      else await this.xarid.faolXarid(client.id);
    } catch (err) {
      // Xarid ochilmasa ham mijoz yo'qolmasin — keyingi bosqich o'zgarishida ochiladi.
      log.warn({ err, clientId: client.id }, 'Faol xarid ochilmadi');
    }
    log.info({ clientId: client.id, manba }, 'Yangi mijoz yaratildi');
    this.events.publish({ type: 'client.updated', clientId: client.id });
    this.events.publish({ type: 'stats.invalidate' });
  }
}
