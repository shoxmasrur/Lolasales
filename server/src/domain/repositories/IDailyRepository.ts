import type { KunFiltri, XomKunStat, XomSuhbat } from '@/domain/services/kunlikToifalar';

/**
 * Kunlik xulosa uchun xom ma'lumot.
 *
 * `boshIso`/`oxirIso` — UTC oralig'i [bosh, oxir); `kunIso` esa Toshkent
 * kuni (`DATE` ustunlari bilan solishtirish uchun — ular vaqtsiz).
 *
 * `kunStat` Obyekt/Agent filtrini SQL da qo'llaydi; `kunSuhbatlari` esa
 * doim butun kunni qaytaradi — filtr JS da (`filtrgaMos`), chunki filtr
 * variantlari ham shu ro'yxatdan quriladi va og'ir so'rov kun uchun bitta.
 */
export interface IDailyRepository {
  kunStat(boshIso: string, oxirIso: string, kunIso: string, filtr?: KunFiltri): Promise<XomKunStat>;
  kunSuhbatlari(boshIso: string, oxirIso: string, kunIso: string): Promise<XomSuhbat[]>;
}
