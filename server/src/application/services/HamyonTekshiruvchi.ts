import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { ICourseRepository } from '@/domain/repositories/ICourseRepository';
import type { IPurchaseRepository } from '@/domain/repositories/IPurchaseRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import { kutilganChekSummasi } from '@/domain/services/karta';
import { chekniSolishtir, OYNA_SOAT, tushumniTanla, type HamyonTushum } from '@/domain/services/hamyonMosligi';
import type { IClock, IEventBus } from '@/domain/services/support';
import type { PaymentCheckService } from '@/application/services/PaymentCheckService';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { XulosaBoti } from '@/application/services/XulosaBoti';
import type { HamyonChek, PgHamyonRepository } from '@/infrastructure/db/repositories/PgHamyonRepository';
import { childLogger } from '@/shared/logger';

const log = childLogger('hamyoncha');

const TIK_MS = 60_000;
const SABAB_UZUNLIGI = 300;
const ACTOR = 'hamyoncha';

/** Hamyoncha tomoni — test uchun almashtiriladi. */
export interface HamyonManbai {
  kirimlar(from: Date): Promise<HamyonTushum[]>;
}

/**
 * Mijoz chek yuborgach, pul HAQIQATAN tushganini Hamyoncha orqali tekshiradi.
 *
 *   • aynan bitta mos (summa va vaqt) va boshqa chekka biriktirilmagan tushum
 *     topilsa → chek avtomatik tasdiqlanadi (`confirmReceipt`: rahmat va,
 *     kurs qoidasi bajarilsa, yopiq guruh havolasi ketadi);
 *   • shubha bo'lsa (takroriy chek, bir nechta mos tushum, summa noaniq) yoki
 *     kutish vaqtida pul topilmasa → suhbat menejerga o'tadi va adminga xabar ketadi.
 *
 * Hamyoncha tushumni ~15 daqiqa kechikib yozishi mumkin, shuning uchun "topilmadi"
 * darhol shubha emas: `hamyonKutishDaq` gacha har daqiqada qayta tekshiriladi.
 * Standart holatda O'CHIQ. Kill switch yoqilgan bo'lsa ishlamaydi.
 */
export class HamyonTekshiruvchi {
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private running = false;

  constructor(
    private readonly manba: HamyonManbai,
    private readonly repo: Pick<PgHamyonRepository, 'kutayotganCheklar' | 'bandIdlar' | 'egalla' | 'bosh' | 'holat'>,
    private readonly checks: Pick<PaymentCheckService, 'confirmReceipt'>,
    private readonly purchases: Pick<IPurchaseRepository, 'findById'>,
    private readonly courses: Pick<ICourseRepository, 'findById'>,
    private readonly conversations: Pick<IConversationRepository, 'update'>,
    private readonly clients: Pick<IClientRepository, 'findById'>,
    private readonly admin: Pick<XulosaBoti, 'xabarYubor'>,
    private readonly settings: Pick<RuntimeSettings, 'get'>,
    private readonly audit: IAuditRepository,
    private readonly events: IEventBus,
    private readonly clock: IClock,
    /** Mijozga bitta neutral xabar (shubha topilganda). `null` — yuborilmaydi. */
    private readonly mijozgaXabar: ((conversationId: string, matn: string) => Promise<void>) | null = null,
  ) {}

  start(): void {
    if (this.timer) return;
    this.stopped = false;
    log.info('Hamyoncha tekshiruvchisi tayyor (sozlamada yoqilguncha ishlamaydi)');
    this.schedule();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.tick(), TIK_MS);
  }

  private async tick(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      await this.bajar();
    } catch (err) {
      log.error({ err }, 'Hamyoncha tekshiruvida xato');
    } finally {
      this.running = false;
      this.schedule();
    }
  }

  /** Kutayotgan barcha cheklarni bir marta ko'rib chiqadi. Qaytadi: hal qilinganlar soni. */
  async bajar(): Promise<number> {
    const s = await this.settings.get();
    if (!s.hamyonYoqilgan || s.killSwitch) return 0;

    const cheklar = await this.repo.kutayotganCheklar();
    let hal = 0;
    for (const chek of cheklar) {
      try {
        const faolKarta = (s.paymentCards ?? []).find((k) => k.active);
        if (await this.birChek(chek, s.hamyonKutishDaq, faolKarta ? faolKarta.number.slice(-4) : null)) hal += 1;
      } catch (err) {
        log.error({ err, checkId: chek.id }, "Chekni Hamyoncha bilan tekshirib bo'lmadi");
        // Hamyonchaga ulanib bo'lmayapti va kutish tugagan — jim qolmaymiz, admin bilsin.
        if (this.kutishTugadimi(chek, s.hamyonKutishDaq)) {
          await this.shubha(chek, `Hamyonchaga ulanib bo'lmadi (${err instanceof Error ? err.message : 'xato'})`);
          hal += 1;
        }
      }
    }
    return hal;
  }

  private kutishTugadimi(chek: HamyonChek, kutishDaq: number): boolean {
    return this.clock.now().getTime() - chek.createdAt.getTime() >= kutishDaq * 60_000;
  }

  /** `true` — chek hal qilindi (tasdiqlandi yoki adminga berildi). */
  private async birChek(chek: HamyonChek, kutishDaq: number, bizningKarta4: string | null): Promise<boolean> {
    const hozir = this.clock.now();
    const xarid = chek.purchaseId ? await this.purchases.findById(chek.purchaseId) : null;
    const kurs = xarid?.courseId ? await this.courses.findById(xarid.courseId) : null;
    const kutilgan = xarid ? kutilganChekSummasi(kurs, xarid) : null;

    const boshi = new Date(chek.createdAt.getTime() - OYNA_SOAT * 3_600_000);
    const tushumlar = await this.manba.kirimlar(boshi);
    const band = await this.repo.bandIdlar(tushumlar.map((t) => t.id));
    const qaror = tushumniTanla({ tushumlar, kutilgan, chekVaqti: chek.createdAt, hozir, band });

    if (qaror.kind === 'shubha') {
      await this.shubha(chek, qaror.sabab);
      return true;
    }

    if (qaror.kind === 'topilmadi') {
      if (!this.kutishTugadimi(chek, kutishDaq)) return false; // Hamyoncha kechikishi mumkin — kutamiz
      const boshqa = qaror.boshqaSummalar.length
        ? ` Oynada boshqa summalar bor: ${qaror.boshqaSummalar.join(', ')}.`
        : '';
      await this.shubha(chek, `Hamyonchada ${kutilgan} so'm tushum topilmadi (${kutishDaq} daqiqa kutildi).${boshqa}`);
      return true;
    }

    // Mos tushum: avval atomik biriktiramiz, so'ng tasdiqlaymiz.
    const t = qaror.tushum;

    // Chekdagi summa, vaqt va karta ham Hamyonchadagi haqiqiy tushumga mos bo'lishi shart.
    const solishtiruv = chekniSolishtir({ chek: chek.receiptInfo, tushum: t, bizningKarta4 });
    if (!solishtiruv.ok) {
      await this.shubha(chek, solishtiruv.sabab);
      return true;
    }

    if (!(await this.repo.egalla(t.id, chek.id, t.amount, t.date))) return false; // poyga — keyingi tikda qayta ko'riladi

    const natija = await this.checks.confirmReceipt(chek.conversationId, ACTOR, t.amount);
    if (natija.kind === 'no_review') {
      // Menejer chekni shu orada o'zi yopgan — tushum bo'shatiladi.
      await this.repo.bosh(t.id);
      return true;
    }

    await this.repo.holat(chek.id, 'mos', null);
    await this.audit.record({
      actor: ACTOR,
      action: 'hamyoncha.auto_confirmed',
      entity: 'payment_check',
      entityId: chek.id,
      payload: { amount: t.amount, txDate: t.date.toISOString(), outcome: natija.kind },
    });
    log.info({ checkId: chek.id, amount: t.amount, outcome: natija.kind }, "Chek Hamyoncha bo'yicha tasdiqlandi");

    if (natija.kind !== 'confirmed') {
      // Pul tasdiqlandi, lekin rahmat/havola avtomatik ketmadi — admin qo'lda tugatsin.
      const nom = await this.mijozNomi(chek.clientId);
      await this.admin.xabarYubor(
        `⚠️ To'lov Hamyonchada tasdiqlandi (${t.amount} so'm), lekin avtomatik yakunlanmadi.\nMijoz: ${nom}\nDashboard → Suhbatlar da ko'rib chiqing.`,
      );
    }
    return true;
  }

  /** Avtomatik hal qilib bo'lmaydi: menejerga o'tkazadi va adminga xabar beradi. */
  private async shubha(chek: HamyonChek, sabab: string): Promise<void> {
    const qisqa = sabab.slice(0, SABAB_UZUNLIGI);
    await this.conversations.update(chek.conversationId, {
      needsHuman: true,
      // Admin ko'rib chiqquncha agent jim qolmasin: mijozning savollariga javob beradi.
      humanKind: 'menejer_xabari',
      humanReason: `Hamyoncha: ${qisqa}`,
    });
    await this.repo.holat(chek.id, 'shubha', qisqa);
    await this.audit.record({
      actor: ACTOR,
      action: 'hamyoncha.suspicious',
      entity: 'payment_check',
      entityId: chek.id,
      payload: { sabab: qisqa },
    });
    this.events.publish({ type: 'conversation.updated', conversationId: chek.conversationId });
    log.warn({ checkId: chek.id, sabab: qisqa }, 'Chek shubhali — adminga berildi');

    // Mijoz jim qolmasin: ayblovsiz, bitta neutral xabar (`hamyon_holati` bir marta yoziladi).
    if (this.mijozgaXabar) {
      await this.mijozgaXabar(
        chek.conversationId,
        "To'lovingizni tekshiryapmiz, biroz vaqt oladi. Tasdiqlanishi bilan yozaman 🙂",
      ).catch((err) => log.warn({ err, checkId: chek.id }, "Mijozga xabar ketmadi"));
    }

    const nom = await this.mijozNomi(chek.clientId);
    await this.admin.xabarYubor(
      `⚠️ Shubhali to'lov\nMijoz: ${nom}\nSabab: ${qisqa}\nDashboard → Suhbatlar → «Chek keldi» da tekshiring.`,
    );
  }

  private async mijozNomi(clientId: string): Promise<string> {
    const c = await this.clients.findById(clientId);
    return c?.fullName?.trim() || "Noma'lum mijoz";
  }
}
