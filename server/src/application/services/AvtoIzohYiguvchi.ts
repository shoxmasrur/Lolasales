import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IzohQatori, IzohYiguvchi } from '@/application/services/IzohYiguvchi';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import { TelegramError } from '@/shared/errors';
import { childLogger } from '@/shared/logger';

const log = childLogger('avto-izoh');

/** Birinchi tekshiruv server ishga tushgandan shuncha keyin (akkaunt ulanib olsin). */
const BOSHLANISH_KUTISH_MS = 60_000;
/** O'chiq holatda sozlama shuncha vaqtda bir qayta tekshiriladi. */
const BO_SH_TIK_MS = 60_000;

export interface AvtoNatija {
  readonly kanallar: number;
  readonly yangi: number;
  readonly sabab?: string;
}

/**
 * Kanal izohlaridan lead olishni AVTOMATIK qiladi.
 *
 * Har `izohAvtoOraliqMin` daqiqada: akkaunt a'zo izohli kanallarni o'qiydi,
 * kalit so'zga mos va hali mijoz bo'lmagan odamlarni mijoz (manba «Guruh»)
 * qiladi. Birinchi xabar odatdagidek KAMPANIYA orqali ketadi — shuning uchun
 * kill switch, ish vaqti oynasi, kunlik limit va pauzalar o'zgarmay amal qiladi.
 *
 * Xavfsizlik: standart holatda O'CHIQ; bir yurishda `izohAvtoMaxYangi` tadan
 * ortiq yangi lead olinmaydi; FLOOD_WAIT/PEER_FLOOD kelsa yurish to'xtaydi.
 * Kanal yoki guruhga hech narsa yozilmaydi (faqat o'qiladi).
 */
export class AvtoIzohYiguvchi {
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private running = false;

  constructor(
    private readonly yiguvchi: Pick<IzohYiguvchi, 'kanallar' | 'kommentlar' | 'mijozQil'>,
    private readonly accounts: Pick<ITelegramAccountRepository, 'listConnected'>,
    private readonly settings: Pick<RuntimeSettings, 'get'>,
    private readonly audit: IAuditRepository,
  ) {}

  start(): void {
    if (this.timer) return;
    this.stopped = false;
    log.info("Avtomatik izoh yig'uvchi tayyor (sozlamada yoqilguncha ishlamaydi)");
    this.schedule(BOSHLANISH_KUTISH_MS);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(ms: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.tick(), ms);
  }

  private async tick(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;
    let keyingi = BO_SH_TIK_MS;
    try {
      const s = await this.settings.get();
      if (!s.izohAvtoYoqilgan) {
        keyingi = BO_SH_TIK_MS;
      } else if (s.killSwitch) {
        keyingi = BO_SH_TIK_MS;
        log.info("Kill switch yoqilgan — avtomatik izoh yig'ish o'tkazib yuborildi");
      } else {
        keyingi = Math.max(s.izohAvtoOraliqMin, 5) * 60_000;
        await this.birYurish();
      }
    } catch (err) {
      log.error({ err }, "Avtomatik izoh yig'ishda xato");
    } finally {
      this.running = false;
      this.schedule(keyingi);
    }
  }

  /** Bitta yurish: barcha izohli kanallar. */
  async birYurish(): Promise<AvtoNatija> {
    const s = await this.settings.get();
    const ulangan = await this.accounts.listConnected();
    const akkaunt = s.izohAvtoAkkauntId
      ? ulangan.find((a) => a.id === s.izohAvtoAkkauntId)
      : ulangan[0];
    if (!akkaunt) {
      log.warn("Ulangan akkaunt yo'q — avtomatik izoh yig'ish o'tkazib yuborildi");
      return { kanallar: 0, yangi: 0, sabab: 'akkaunt_yoq' };
    }

    const kanallar = (await this.yiguvchi.kanallar(akkaunt.id)).filter((k) => k.memberOfLinked);
    let qolgan = s.izohAvtoMaxYangi;
    let yangi = 0;

    for (const kanal of kanallar) {
      if (qolgan <= 0) break;
      try {
        const natija = await this.yiguvchi.kommentlar(
          akkaunt.id, kanal.peer.peerId, 'all', s.izohAvtoKunlar, false,
        );
        const qatorlar: IzohQatori[] = [];
        for (const i of natija.items) {
          if (!i.tanlasaBoladi || i.mavjudMijoz || i.author.kind !== 'user') continue;
          qatorlar.push({ peer: i.author.peer, fullName: i.author.fullName, text: i.text });
          if (qatorlar.length >= qolgan) break;
        }
        if (!qatorlar.length) continue;

        const r = await this.yiguvchi.mijozQil(akkaunt.id, kanal.title, qatorlar, 'avto', null, true);
        yangi += r.created;
        qolgan -= r.created;
        log.info({ kanal: kanal.title, yangi: r.created, mavjud: r.existing }, 'Kanal izohlaridan lead olindi');
      } catch (err) {
        if (err instanceof TelegramError && (err.telegramCode === 'FLOOD_WAIT' || err.telegramCode === 'PEER_FLOOD')) {
          log.warn({ kanal: kanal.title, kod: err.telegramCode }, "Telegram cheklovi — yurish to'xtatildi");
          break;
        }
        log.error({ err, kanal: kanal.title }, "Kanalni o'qib bo'lmadi — keyingisiga o'tildi");
      }
    }

    if (yangi > 0) {
      await this.audit.record({
        actor: 'avto',
        action: 'comments.auto_imported',
        entity: 'telegram_account',
        entityId: akkaunt.id,
        payload: { kanallar: kanallar.length, yangi },
      });
    }
    return { kanallar: kanallar.length, yangi };
  }
}
