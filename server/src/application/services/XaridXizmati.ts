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
    const hozirgi =
      actor === 'menejer'
        ? ((await this.purchases.findActiveByClient(clientId)) ??
          (await this.purchases.findLatestByClient(clientId)) ??
          (await this.faolXarid(clientId)))
        : await this.faolXarid(clientId);
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

  /** Kursni belgilaydi (jami summa = kurs narxi) — faqat karta yuborilmagan bo'lsa. */
  async kursBelgila(clientId: string, courseId: string): Promise<Purchase> {
    const course = await this.courses.findById(courseId);
    if (!course) throw new NotFoundError('Kurs', courseId);
    const xarid = await this.faolXarid(clientId);
    if (!KURS_ALMASHADI.includes(xarid.stage)) return xarid;
    if (xarid.courseId === course.id && xarid.totalAmount === course.price) return xarid;

    const updated = await this.purchases.setCourse(xarid.id, course.id, course.price);
    this.events.publish({ type: 'client.updated', clientId });
    return updated;
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
   * tanlovi o'chib ketardi.
   */
  async bolibTolash(clientId: string): Promise<boolean> {
    const xarid = await this.faolXarid(clientId);
    if (xarid.installment || !KURS_ALMASHADI.includes(xarid.stage)) return false;
    await this.purchases.setInstallment(xarid.id, true);
    this.events.publish({ type: 'client.updated', clientId });
    return true;
  }
}
