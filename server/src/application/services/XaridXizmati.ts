import {
  bosqichOtishi,
  type BosqichAktori,
  type Purchase,
  type XaridBosqichi,
} from '@/domain/entities/Purchase';
import type { ICourseRepository } from '@/domain/repositories/ICourseRepository';
import type { IPurchaseRepository } from '@/domain/repositories/IPurchaseRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IClock, IEventBus } from '@/domain/services/support';
import { AppError, NotFoundError } from '@/shared/errors';

/** Kurs faqat karta yuborilgunga qadar almashtiriladi. */
const KURS_ALMASHADI: readonly XaridBosqichi[] = ['yangi', 'suhbatda', 'qiziqdi'];

/** Mijozning xarid bosqichlarini yuritadi: ochish, bosqichga o'tish, kursni belgilash. */
export class XaridXizmati {
  constructor(
    private readonly purchases: IPurchaseRepository,
    private readonly courses: ICourseRepository,
    private readonly events: IEventBus,
    private readonly audit: IAuditRepository,
    private readonly clock: IClock,
  ) {}

  /** Faol xarid; yo'q bo'lsa `yangi` xarid ochadi. */
  async faolXarid(clientId: string): Promise<Purchase> {
    const faol = await this.purchases.findActiveByClient(clientId);
    if (faol) return faol;
    try {
      return await this.purchases.create({ clientId, courseId: null, totalAmount: null });
    } catch (err) {
      // Poyga: boshqa jarayon shu orada ochib ulgurdi (qisman unique indeks).
      const endi = await this.purchases.findActiveByClient(clientId);
      if (endi) return endi;
      throw err;
    }
  }

  /** Bosqichni `bosqichOtishi` qoidasi bo'yicha o'zgartiradi; ruxsat yo'q yoki o'zgarmasa `null`. */
  async bosqich(
    clientId: string,
    requested: XaridBosqichi,
    actor: BosqichAktori,
    by?: string,
  ): Promise<Purchase | null> {
    // Menejer istalgan vaqtda joriy xaridni o'zgartiradi (tugallangan bo'lsa ham);
    // yangi xarid faqat mijozda umuman yo'q bo'lsa ochiladi.
    // Agent esa faqat FAOL xaridni suradi: yakunlangan xariddan keyin model
    // `suhbatda`/`qiziqdi` qaytarsa ham yangi ("fantom") xarid ochilmaydi.
    let hozirgi: Purchase;
    if (actor === 'menejer') {
      hozirgi =
        (await this.purchases.findActiveByClient(clientId)) ??
        (await this.purchases.findLatestByClient(clientId)) ??
        (await this.faolXarid(clientId));
    } else if (actor === 'agent') {
      const faol = await this.purchases.findActiveByClient(clientId);
      if (!faol) return null;
      hozirgi = faol;
    } else {
      hozirgi = await this.faolXarid(clientId);
    }
    const yangi = bosqichOtishi(hozirgi.stage, requested, actor);
    if (!yangi) return null;

    let updated: Purchase;
    try {
      updated = await this.purchases.setStage(hozirgi.id, yangi);
    } catch (err) {
      // Bitta faol xarid indeksi: tugallangan xaridni qaytarishda boshqasi faol bo'lib qolgan.
      if ((err as { code?: string }).code === '23505') {
        throw new AppError('Mijozda boshqa faol xarid bor — avval uni yakunlang', 409, 'ACTIVE_PURCHASE_EXISTS');
      }
      throw err;
    }
    await this.audit.record({
      actor: by ?? actor,
      action: 'purchase.stage',
      entity: 'purchase',
      entityId: updated.id,
      payload: { clientId, from: hozirgi.stage, to: yangi, actor, at: this.clock.now().toISOString() },
    });
    this.events.publish({ type: 'client.updated', clientId });
    return updated;
  }

  /**
   * Tizim bosqichi faqat FAOL xaridga: faol xarid yo'q bo'lsa (mijozda xarid
   * umuman yo'q yoki oxirgisi yakunlangan) hech narsa ochilmaydi, `null`.
   * Chek oqimi shu yo'ldan: yakunlangan xariddan keyingi rasm "Chek keldi"
   * bosqichli soxta xarid ochmasin.
   */
  async faolXaridBosqichi(clientId: string, requested: XaridBosqichi, actor: BosqichAktori): Promise<Purchase | null> {
    if (!(await this.purchases.findActiveByClient(clientId))) return null;
    return this.bosqich(clientId, requested, actor);
  }

  /** Kursni belgilaydi (jami summa = kurs narxi) — faqat karta yuborilmagan bo'lsa. */
  async kursBelgila(clientId: string, courseId: string): Promise<Purchase> {
    const course = await this.courses.findById(courseId);
    if (!course) throw new NotFoundError('Kurs', courseId);
    const xarid = await this.faolXarid(clientId);
    if (!KURS_ALMASHADI.includes(xarid.stage)) return xarid;
    // Mijoz tanlagan narx varianti (masalan, qator) agent kursni qayta aytganda ham saqlanadi.
    const variantNarxi = (course.priceOptions ?? []).some((o) => o.price === xarid.totalAmount);
    if (xarid.courseId === course.id && (xarid.totalAmount === course.price || variantNarxi)) return xarid;

    const updated = await this.purchases.setCourse(xarid.id, course.id, course.price);
    this.events.publish({ type: 'client.updated', clientId });
    return updated;
  }

  /**
   * Mijoz tanlagan narx variantini (qator) xaridning jami summasi qiladi.
   * Faqat karta yuborilgunga qadar va faqat kursning o'z variantlaridan biri bo'lsa;
   * boshqa narx (o'ylab topilgan) e'tiborsiz — `null`.
   */
  async narxBelgila(clientId: string, narx: number): Promise<Purchase | null> {
    const xarid = await this.purchases.findActiveByClient(clientId);
    if (!xarid) return this.qatorniKotar(clientId, narx);
    if (!xarid.courseId || !KURS_ALMASHADI.includes(xarid.stage)) return null;
    const course = await this.courses.findById(xarid.courseId);
    if (!course || !(course.priceOptions ?? []).some((o) => o.price === narx)) return null;
    if (xarid.totalAmount === narx) return xarid;

    const updated = await this.purchases.setCourse(xarid.id, course.id, narx);
    this.events.publish({ type: 'client.updated', clientId });
    return updated;
  }

  /**
   * To'liq to'lagan mijoz yuqoriroq narxli qatorni (oldingi qator) tanladi: xarid
   * qayta ochiladi — jami summa yangi qator narxiga, bosqich `qisman_toladi` ga,
   * to'langan summa o'zgarmaydi. Karta farq (jami − to'langan) bilan ketadi, chek
   * tasdig'i esa shu xaridga qo'shiladi. Yangi narx kursning o'z variantlaridan biri
   * va to'langandan katta bo'lishi shart; havola qayta yuborilmaydi (atomik belgi).
   */
  private async qatorniKotar(clientId: string, narx: number): Promise<Purchase | null> {
    const oxirgi = await this.purchases.findLatestByClient(clientId);
    if (!oxirgi?.courseId || oxirgi.stage !== 'toladi') return null;
    const course = await this.courses.findById(oxirgi.courseId);
    if (!course || !(course.priceOptions ?? []).some((o) => o.price === narx)) return null;
    if (narx <= (oxirgi.totalAmount ?? 0) || narx <= oxirgi.paidAmount) return null;

    try {
      await this.purchases.setCourse(oxirgi.id, oxirgi.courseId, narx);
      const updated = await this.purchases.setStage(oxirgi.id, 'qisman_toladi');
      await this.audit.record({
        actor: 'agent',
        action: 'purchase.row_upgrade',
        entity: 'purchase',
        entityId: oxirgi.id,
        payload: { clientId, from: oxirgi.totalAmount, to: narx, paid: oxirgi.paidAmount, at: this.clock.now().toISOString() },
      });
      this.events.publish({ type: 'client.updated', clientId });
      return updated;
    } catch (err) {
      if ((err as { code?: string }).code === '23505') return null; // boshqa faol xarid bor
      throw err;
    }
  }

  /**
   * Agent ko'rsatgan kurs (sotuvdagi ekanini chaqiruvchi tekshiradi).
   *
   *   • faol xarid bor — `kursBelgila` (karta yuborilgunga qadar almashadi);
   *   • faol xarid yo'q (oxirgisi `toladi`/`rad_etdi`) — yangi xarid faqat
   *     kurs YANGI bo'lsa ochiladi: oxirgi (yakunlangan) xaridning kursi ham,
   *     mijoz allaqachon to'lagan kurslar ham emas. Aks holda `null`: model
   *     rahmat yoki kontekstdagi kursni takrorlagan, xarid ochilmaydi.
   */
  async agentKursi(clientId: string, courseId: string): Promise<Purchase | null> {
    if (await this.purchases.findActiveByClient(clientId)) return this.kursBelgila(clientId, courseId);
    const oxirgi = await this.purchases.findLatestByClient(clientId);
    if (oxirgi?.courseId === courseId) return null;
    if ((await this.purchases.listPaidCourseIds(clientId)).includes(courseId)) return null;
    return this.kursBelgila(clientId, courseId);
  }

  /** Faqat faol xarid; hech narsa OCHMAYDI. */
  async faol(clientId: string): Promise<Purchase | null> {
    return this.purchases.findActiveByClient(clientId);
  }

  /**
   * Agent kontekstidagi xarid: faol bo'lsa o'sha, bo'lmasa eng oxirgisi.
   * `faolXarid` dan farqi — hech narsa OCHMAYDI (kontekst o'qish yon ta'sirsiz).
   */
  async joriyXarid(clientId: string): Promise<Purchase | null> {
    return (await this.purchases.findActiveByClient(clientId)) ?? (await this.purchases.findLatestByClient(clientId));
  }

  /** Mijoz to'liq to'lagan kurslarning id lari. */
  async tolanganKurslar(clientId: string): Promise<string[]> {
    return this.purchases.listPaidCourseIds(clientId);
  }

  /**
   * Agent "bo'lib to'lash" tanlanganini bildirdi. Faqat karta yuborilishidan
   * oldingi bosqichlarda va faqat `true` ga o'zgartiriladi: model har
   * navbatda `installment: false` qaytaradi, uni yozsak mijozning oldingi
   * tanlovi o'chib ketardi. Faol xarid yo'q bo'lsa — hech narsa qilinmaydi.
   */
  async bolibTolash(clientId: string): Promise<boolean> {
    // Faol xarid bo'lmasa yangisi OCHILMAYDI: "bo'lib to'lash" kurs tanlangandan
    // keyin ma'noli, bo'sh xarid esa ro'yxatda soxta "Yangi" bo'lib qolardi.
    const xarid = await this.purchases.findActiveByClient(clientId);
    if (!xarid || xarid.installment || !KURS_ALMASHADI.includes(xarid.stage)) return false;
    await this.purchases.setInstallment(xarid.id, true);
    this.events.publish({ type: 'client.updated', clientId });
    return true;
  }
}
