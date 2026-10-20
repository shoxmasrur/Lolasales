import { randomInt } from 'node:crypto';
import type { DashboardStats, ISettingsRepository, IStatsRepository } from '@/domain/repositories/ISupportRepositories';
import { CLIENT_SOURCE_LABEL, CLIENT_SOURCES, type ClientSource } from '@/domain/entities/Client';
import { kodliChat, tokenXatosi } from '@/domain/services/botTokeni';
import type { IClock } from '@/domain/services/support';
import { zonedParts } from '@/shared/datetime';
import type { BotApi } from '@/infrastructure/telegram/BotApi';
import { decrypt, encrypt } from '@/shared/crypto';
import { ValidationError } from '@/shared/errors';
import { childLogger } from '@/shared/logger';

/** Ulash kodi shuncha daqiqa amal qiladi — qisqa umr, chunki kod ochiq saqlanadi. */
const KOD_MUDDATI_DAQIQA = 10;

const log = childLogger('xulosa-boti');

/** `settings` jadvalidagi kalit. Umumiy `outreach` bloki bilan aralashmaydi. */
export const BOT_KALITI = 'daily_digest_bot';

/** Bazadagi ko'rinish — `token` SHIFRLANGAN holda yotadi. */
interface BotYozuvi {
  token: string;
  botUsername: string | null;
  chatId: string | null;
  chatNomi: string | null;
  yangilangan: string;
  /**
   * Bir martalik ulash kodi — OCHIQ saqlanadi, u sir emas: 10 daqiqada
   * eskiradi va faqat botga qaytadan yozib ko'rsatish uchun kerak.
   */
  ulashKodi?: string | null;
  /** Kod muddati tugaydigan vaqt (ISO). */
  kodMuddati?: string | null;
}

/** Tashqariga chiqadigan holat — token BU YERDA YO'Q va bo'lmaydi ham. */
export interface BotHolati {
  readonly tokenBor: boolean;
  readonly botUsername: string | null;
  readonly chatId: string | null;
  readonly chatNomi: string | null;
  readonly yangilangan: string | null;
}

/** Kunlik xulosa qaysi kunga yuborilgani (`settings` kaliti) — kuniga bir marta. */
export const XULOSA_SANASI_KALITI = 'daily_digest_last';

/** Kunlik sotuv xulosasi shu soatdan keyin (loyiha vaqt mintaqasi) yuboriladi. */
export const XULOSA_SOATI = 21;

/** Xulosaga kerakli raqamlar — `DashboardStats` dan olinadi. */
export type KunlikRaqamlar = Pick<DashboardStats, 'newClientsToday' | 'paymentsToday' | 'receiptsPending'>;

const somFormat = (n: number): string =>
  `${new Intl.NumberFormat('ru-RU').format(Math.round(n)).replace(/\u00a0/g, ' ')} so'm`;

/**
 * Kunlik sotuv xulosasi matni. Oddiy matn — `parse_mode` berilmaydi.
 *
 * Manbalar tartibi qotirilgan (`CLIENT_SOURCES`): kundan-kunga solishtirish
 * oson bo'lsin. Yangi mijoz bo'lmagan manba ham "0" bilan ko'rsatiladi.
 */
export function kunlikXulosaMatni(sana: string, r: KunlikRaqamlar): string {
  const manba = new Map(r.newClientsToday.map((x) => [x.source, x.count]));
  const jami = r.newClientsToday.reduce((s, x) => s + x.count, 0);
  const manbaQatorlari = CLIENT_SOURCES.map(
    (k: ClientSource) => `  • ${CLIENT_SOURCE_LABEL[k]}: ${manba.get(k) ?? 0}`,
  );
  return [
    `📊 Kunlik sotuv xulosasi — ${sana}`,
    '',
    `Yangi mijozlar: ${jami}`,
    ...manbaQatorlari,
    '',
    `Tasdiqlangan to'lovlar: ${r.paymentsToday.count} ta, ${somFormat(r.paymentsToday.amount)}`,
    `Tekshiruvni kutayotgan cheklar: ${r.receiptsPending}`,
  ].join('\n');
}

const BOSH_HOLAT: BotHolati = {
  tokenBor: false,
  botUsername: null,
  chatId: null,
  chatNomi: null,
  yangilangan: null,
};

export class XulosaBoti {
  constructor(
    private readonly settings: ISettingsRepository,
    private readonly api: BotApi,
  ) {}

  private async yozuv(): Promise<BotYozuvi | null> {
    return (await this.settings.get<BotYozuvi>(BOT_KALITI)) ?? null;
  }

  /**
   * Shifrlangan tokenni ochish.
   *
   * `ENCRYPTION_KEY` almashtirilgan bo'lsa ochib bo'lmaydi — bunda
   * "token yo'q" deb hisoblaymiz va administrator uni qayta kiritadi.
   */
  private async token(): Promise<string | null> {
    const y = await this.yozuv();
    if (!y?.token) return null;
    try {
      return decrypt(y.token);
    } catch (err) {
      log.error({ err }, 'Bot tokenini ochib bo\'lmadi — qayta kiritish kerak');
      return null;
    }
  }

  /**
   * `tokenBor` shifrni OCHIB ko'rsatadi, shifrlangan qatorning shunchaki
   * bor-yo'qligini emas. `ENCRYPTION_KEY` almashsa (yoki eski DB nusxasi
   * tiklansa) `decrypt` yiqiladi — shunda "yo'q" deb ko'rsatamiz, aks
   * holda panel yashil "saqlangan" deb yolg'on gapiradi-yu, «Ulash kodini
   * olish» va sinov tugmalari tushunarsiz xato bilan yiqiladi. Yozuvning
   * o'zi O'CHIRILMAYDI: administrator yangi tokenni kiritsa, ustiga yoziladi.
   */
  async holat(): Promise<BotHolati> {
    const y = await this.yozuv();
    if (!y) return BOSH_HOLAT;

    let tokenBor = false;
    if (y.token) {
      try {
        decrypt(y.token);
        tokenBor = true;
      } catch (err) {
        log.error({ err }, 'Bot tokenini ochib bo\'lmadi — qayta kiritish kerak');
      }
    }

    return {
      tokenBor,
      botUsername: y.botUsername,
      chatId: y.chatId,
      chatNomi: y.chatNomi,
      yangilangan: y.yangilangan,
    };
  }

  /**
   * Tokenni tekshirib saqlash.
   *
   * Avval `getMe`: yaroqsiz token saqlansa, kechqurun xulosa jimgina
   * ketmay qolardi va buni hech kim sezmasdi.
   */
  async tokenSaqla(token: string, userId: string | null): Promise<BotHolati> {
    const xato = tokenXatosi(token);
    if (xato) throw new ValidationError(xato);

    const toza = token.trim();
    let username: string | null;
    try {
      username = (await this.api.getMe(toza)).username;
    } catch (err) {
      throw new ValidationError(
        `Telegram tokenni qabul qilmadi: ${err instanceof Error ? err.message : 'xato'}`,
      );
    }

    // Token almashsa, eski chat ham ma'nosiz — yangi bot boshqa suhbatda.
    const yozuv: BotYozuvi = {
      token: encrypt(toza),
      botUsername: username,
      chatId: null,
      chatNomi: null,
      yangilangan: new Date().toISOString(),
    };
    await this.settings.set(BOT_KALITI, yozuv, userId);
    return this.holat();
  }

  /**
   * Bir martalik ulash kodini yaratish.
   *
   * "Oxirgi yozgan odam" qoidasi kifoya emas edi: bot username'i ochiq va
   * qidiriladi, botga birinchi bo'lib yozgan istalgan begona odam nomzod
   * bo'lib qolardi — kunlik xulosa esa mijoz ismlarini olib boradi. Endi
   * FAQAT shu kodni bilgan (panelni ko'rgan) admin biriktira oladi.
   */
  async kodBoshla(userId: string | null): Promise<{ kod: string; amalQiladi: string }> {
    const y = await this.yozuv();
    if (!y) throw new ValidationError('Avval bot tokenini saqlang');

    const kod = String(randomInt(100_000, 1_000_000));
    const amalQiladi = new Date(Date.now() + KOD_MUDDATI_DAQIQA * 60_000).toISOString();

    await this.settings.set(BOT_KALITI, { ...y, ulashKodi: kod, kodMuddati: amalQiladi }, userId);
    return { kod, amalQiladi };
  }

  /** Botga ulash kodini yozgan odamning shaxsiy suhbatini biriktirish. */
  async chatUla(userId: string | null): Promise<BotHolati> {
    const token = await this.token();
    if (!token) throw new ValidationError('Avval bot tokenini saqlang');

    const y = await this.yozuv();
    if (!y?.ulashKodi) {
      throw new ValidationError('Avval «Ulash kodini olish» tugmasini bosing');
    }
    if (!y.kodMuddati || new Date(y.kodMuddati).getTime() < Date.now()) {
      throw new ValidationError('Kod eskirdi, yangisini oling');
    }

    const nomzod = kodliChat(await this.api.getUpdates(token), y.ulashKodi);
    if (!nomzod) {
      throw new ValidationError(
        'Kod bilan xabar kelmadi. Botga kodni yuboring va qayta urinib ko\'ring.',
      );
    }

    // Kod bir marta ishlaydi — biriktirilgandan keyin darhol tozalanadi.
    await this.settings.set(
      BOT_KALITI,
      {
        ...y,
        chatId: nomzod.chatId,
        chatNomi: nomzod.nomi,
        ulashKodi: null,
        kodMuddati: null,
        yangilangan: new Date().toISOString(),
      },
      userId,
    );
    return this.holat();
  }

  async sinovYubor(): Promise<void> {
    const token = await this.token();
    const y = await this.yozuv();
    if (!token) throw new ValidationError('Avval bot tokenini saqlang');
    if (!y?.chatId) throw new ValidationError('Avval «Ulash kodini olish» va «Ulash» tugmalari bilan chatni ulang');

    try {
      await this.api.sendMessage(token, y.chatId, 'Kunlik xulosa boti ulandi. Sinov xabari.');
    } catch (err) {
      throw new ValidationError(
        `Xabar yuborilmadi: ${err instanceof Error ? err.message : 'xato'}`,
      );
    }
  }

  /**
   * Kunlik sotuv xulosasini rejalashtirish: har 10 daqiqada tekshiradi,
   * `XULOSA_SOATI` dan keyin va shu kunga hali yuborilmagan bo'lsa yuboradi.
   * Bot ulanmagan bo'lsa hech narsa qilmaydi (sana ham belgilanmaydi).
   *
   * @returns to'xtatish funksiyasi
   */
  rejaBoshla(stats: IStatsRepository, clock: IClock, timeZone: string): () => void {
    let band = false;
    const tekshir = async (): Promise<void> => {
      if (band) return;
      band = true;
      try {
        const now = clock.now();
        if (zonedParts(now, timeZone).hour < XULOSA_SOATI) return;
        const bugun = clock.todayIso();
        if ((await this.settings.get<string>(XULOSA_SANASI_KALITI)) === bugun) return;
        const holat = await this.holat();
        if (!holat.tokenBor || !holat.chatId) return;

        const raqamlar = await stats.dashboard(bugun, timeZone);
        if (await this.xabarYubor(kunlikXulosaMatni(bugun, raqamlar))) {
          await this.settings.set(XULOSA_SANASI_KALITI, bugun);
          log.info({ sana: bugun }, 'Kunlik sotuv xulosasi yuborildi');
        }
      } catch (err) {
        log.error({ err }, 'Kunlik sotuv xulosasini tayyorlab bo\'lmadi');
      } finally {
        band = false;
      }
    };
    const timer = setInterval(() => void tekshir(), 10 * 60_000);
    timer.unref?.();
    void tekshir();
    return () => clearInterval(timer);
  }

  /**
   * Bot orqali xabar yuborish (kunlik xulosa, sessiya ogohlantirishi).
   *
   * Xato QAYTARILMAYDI: xabar yuborilmagani chaqiruvchini yiqitmasligi
   * kerak — faqat jurnalga yoziladi.
   */
  async xabarYubor(matn: string): Promise<boolean> {
    const token = await this.token();
    const y = await this.yozuv();
    if (!token || !y?.chatId) return false;

    try {
      await this.api.sendMessage(token, y.chatId, matn);
      return true;
    } catch (err) {
      log.error({ err }, 'Kunlik xulosa xabari yuborilmadi');
      return false;
    }
  }

  async tozala(userId: string | null): Promise<void> {
    await this.settings.set(BOT_KALITI, null, userId);
  }
}
