import type { IKompaniyaGateway } from '@/domain/services/IKompaniyaGateway';
import { rekvizitTanla, type CrmKompaniya, type RekvizitNatija } from '@/domain/services/rekvizit';
import type { IClock } from '@/domain/services/support';
import { childLogger } from '@/shared/logger';

const log = childLogger('rekvizit');

/**
 * Kompaniyalar ro'yxati kamdan-kam o'zgaradi, talabnoma esa ketma-ket
 * ko'rib chiqiladi — har ko'rinishda CRM'ga chiqmaslik uchun 10 daqiqa
 * keshlanadi.
 */
const KESH_MS = 10 * 60 * 1000;

export class RekvizitManbai {
  private kesh: { royxat: CrmKompaniya[]; olingan: number } | null = null;

  constructor(
    private readonly gw: IKompaniyaGateway,
    private readonly clock: IClock,
  ) {}

  /**
   * Keshni tashlaydi: keyingi `rekvizit()` CRM'dan yangi ro'yxat oladi.
   * NEGA: operator «CRM'dan yangilash» ni bosganda CRM'ga yangi kompaniya
   * yoki hisob kiritilgan bo'lishi mumkin — 10 daqiqa kutib o'tirmasin.
   */
  keshniTashla(): void {
    this.kesh = null;
  }

  /**
   * Hech qachon tashlamaydi: CRM yiqilsa operator panelda aniq sababni
   * ko'radi, talabnoma esa rekvizitsiz yuborilmaydi. Xato keshlanmaydi —
   * CRM tiklanishi bilan keyingi so'rov ishlaydi.
   */
  async rekvizit(inn: string | null): Promise<RekvizitNatija> {
    const hozir = this.clock.now().getTime();
    if (!this.kesh || hozir - this.kesh.olingan >= KESH_MS) {
      try {
        this.kesh = { royxat: await this.gw.listCompanies(), olingan: hozir };
      } catch (err) {
        // Operator faqat umumiy sababni ko'radi; aniq xato (HTTP kodi,
        // tarmoq) tekshirish uchun jurnalga yoziladi.
        log.warn({ err }, 'CRM kompaniyalar olinmadi');
        return { ok: false, sabab: 'Rekvizit olinmadi: CRM javob bermadi' };
      }
    }
    return rekvizitTanla(this.kesh.royxat, inn);
  }
}
