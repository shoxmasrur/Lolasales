import { AsyncLocalStorage } from 'node:async_hooks';

import type { GateKind, GateOptions, GatePriority } from '@/domain/services/ITelegramGateway';
import { childLogger } from '@/shared/logger';

const log = childLogger('telegram-gate');

const TARTIB: Record<GatePriority, number> = { reply: 0, manual: 1, background: 2 };

export interface GateDelays {
  messageMinSec: number;
  messageMaxSec: number;
  otherMinSec: number;
  otherMaxSec: number;
}

export interface AccountGateDeps {
  /** Sozlamalar dashboarddan o'zgaradi, shuning uchun har safar so'raladi. */
  delays: () => Promise<GateDelays>;
  /** Sinov uchun almashtiriladi. */
  now?: () => number;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Osilib qolgan chaqiruv akkauntni abadiy bloklamasligi uchun. */
  timeoutMs?: number;
}

interface Kutuvchi {
  priority: GatePriority;
  /** Bir xil ustuvorlikda kelish tartibi saqlanadi. */
  seq: number;
  boshla: () => void;
}

interface Holat {
  band: boolean;
  /** Shu vaqtdan oldin yangi operatsiya boshlanmaydi (tasodifiy tanaffus). */
  keyingiRuxsat: number;
  navbat: Kutuvchi[];
}

const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Bitta Telegram akkaunt — bitta navbat.
 *
 * MUAMMO: bitta jarayonda o'nga yaqin mustaqil taymer ishlaydi (javob
 * beruvchi, kampaniya, kontakt qidiruvi, spam tekshiruvi, ulanish nazorati)
 * va hammasi bir xil akkauntga uriladi. Natijada akkaunt bir vaqtda bir
 * mijozga yozib, ikkinchisini qidirib, uchinchi so'rovni ham yuborishi
 * mumkin edi. Jonli odam bunday qilmaydi — Telegram uchun bu bot belgisi.
 *
 * YECHIM: har akkauntning o'z navbati bor. Ayni paytda faqat bitta
 * operatsiya ketadi, tugagach tasodifiy tanaffus qo'yiladi. Boshqa
 * akkauntlar bir-birini KUTMAYDI — navbat akkaunt bo'yicha.
 *
 * QAYTA KIRISH: mantiqiy operatsiya ichida bir necha API chaqiruvi bo'ladi
 * (o'qildi → yozmoqda → yubordi). Ular bitta bo'lak bo'lib turishi kerak,
 * shuning uchun qulfni allaqachon ushlab turgan oqim ichkaridagi
 * chaqiruvlarda qayta kutmaydi — `AsyncLocalStorage` shuni belgilaydi.
 */
export class AccountGate {
  private readonly holatlar = new Map<string, Holat>();
  private readonly als = new AsyncLocalStorage<Set<string>>();
  private seq = 0;

  private readonly now: () => number;
  private readonly random: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly timeoutMs: number;

  constructor(private readonly deps: AccountGateDeps) {
    this.now = deps.now ?? Date.now;
    this.random = deps.random ?? Math.random;
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Operatsiyani shu akkauntning navbatida bajaradi.
   *
   * Qulfni allaqachon ushlab turgan oqim ichida chaqirilsa — kutmaydi,
   * darhol bajaradi (aks holda o'zini o'zi bloklab qo'yardi).
   */
  async run<T>(accountId: string, options: GateOptions, fn: () => Promise<T>): Promise<T> {
    if (this.als.getStore()?.has(accountId)) return fn();

    const holat = this.holat(accountId);
    await this.egalla(holat, options.priority ?? 'manual');

    // Tanaffus qulf ICHIDA kutiladi: aks holda kutish paytida boshqa
    // operatsiya kirib kelib, ikkalasi baravar ketardi.
    const kutish = holat.keyingiRuxsat - this.now();
    if (kutish > 0) await this.sleep(kutish);

    const kechikish = await this.deps.delays();
    let bo_shatilgan = false;
    const bo_shat = (): void => {
      if (bo_shatilgan) return;
      bo_shatilgan = true;
      holat.keyingiRuxsat = this.now() + this.tanaffusMs(kechikish, options.kind);
      holat.band = false;
      this.keyingisini(holat);
    };

    // Osilib qolgan chaqiruv akkauntni abadiy to'sib qo'ymasligi kerak.
    // Chaqiruvni bekor qila olmaymiz — faqat navbatni bo'shatamiz va
    // ogohlantiramiz. Bitta ustma-ustlik abadiy to'xtashdan yaxshiroq.
    const taymer = setTimeout(() => {
      log.warn(
        { accountId, label: options.label },
        'Telegram operatsiyasi cho\'zilib ketdi — navbat bo\'shatildi',
      );
      bo_shat();
    }, this.timeoutMs);
    taymer.unref?.();

    const ichkarida = new Set(this.als.getStore() ?? []);
    ichkarida.add(accountId);

    try {
      return await this.als.run(ichkarida, fn);
    } finally {
      clearTimeout(taymer);
      bo_shat();
    }
  }

  /** Shu akkauntda hozir necha operatsiya navbatda turibdi — jurnal uchun. */
  navbatUzunligi(accountId: string): number {
    return this.holatlar.get(accountId)?.navbat.length ?? 0;
  }

  private holat(accountId: string): Holat {
    const bor = this.holatlar.get(accountId);
    if (bor) return bor;
    const yangi: Holat = { band: false, keyingiRuxsat: 0, navbat: [] };
    this.holatlar.set(accountId, yangi);
    return yangi;
  }

  private egalla(holat: Holat, priority: GatePriority): Promise<void> {
    return new Promise<void>((resolve) => {
      this.seq += 1;
      holat.navbat.push({ priority, seq: this.seq, boshla: resolve });
      this.keyingisini(holat);
    });
  }

  private keyingisini(holat: Holat): void {
    if (holat.band || holat.navbat.length === 0) return;

    let eng = 0;
    for (let i = 1; i < holat.navbat.length; i += 1) {
      const a = holat.navbat[i]!;
      const b = holat.navbat[eng]!;
      if (TARTIB[a.priority] < TARTIB[b.priority]
        || (TARTIB[a.priority] === TARTIB[b.priority] && a.seq < b.seq)) {
        eng = i;
      }
    }

    const [keyingi] = holat.navbat.splice(eng, 1);
    holat.band = true;
    keyingi!.boshla();
  }

  private tanaffusMs(kechikish: GateDelays, kind: GateKind): number {
    const min = kind === 'message' ? kechikish.messageMinSec : kechikish.otherMinSec;
    const max = kind === 'message' ? kechikish.messageMaxSec : kechikish.otherMaxSec;
    const past = Math.max(0, min);
    const yuqori = Math.max(past, max);
    return Math.round((past + this.random() * (yuqori - past)) * 1000);
  }
}
