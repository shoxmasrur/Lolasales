import type { Rekvizit } from '@/domain/services/rekvizit';

/**
 * `talabnomalar.holat` — 132-migratsiyadagi CHECK bilan aynan bir xil.
 *
 * `yuborilmoqda` — yozuv yaratilgan, PDF/Telegram hali tugamagan;
 * `xato` — yuborish yiqildi, shartnoma qayta urinish yoki bekor
 * qilinguncha band qoladi; `bekor` — operator xatoni yopdi, shartnoma
 * yana nomzodlar ro'yxatiga qaytadi.
 */
export type TalabnomaHolati = 'yuborilmoqda' | 'yuborildi' | 'xato' | 'bekor';

/** Shartnomani band qiladigan holatlar (`talabnomalar_bir_marta` indeksi). */
export const BAND_QILUVCHI_HOLATLAR: readonly TalabnomaHolati[] = ['yuborilmoqda', 'yuborildi', 'xato'];

export interface Talabnoma {
  readonly id: string;
  readonly contractId: string;
  readonly clientId: string;
  /** `ET-NN` dagi son. Raqam yuborish oldidan beriladi, shuning uchun `null` bo'lishi mumkin. */
  readonly raqam: number | null;
  readonly holat: TalabnomaHolati;
  readonly summa: number;
  /** Yuborish paytidagi nusxa — CRM keyin o'zgarsa ham hujjatdagisi qoladi. */
  readonly rekvizit: Rekvizit;
  readonly pdfPath: string | null;
  readonly messageId: string | null;
  /** YYYY-MM-DD */
  readonly kuchgaKirish: string | null;
  /** YYYY-MM-DD */
  readonly muddatSanasi: string | null;
  readonly sentAt: Date | null;
  readonly sentBy: string | null;
  readonly xatoSababi: string | null;
  readonly createdAt: Date;
  /**
   * Oxirgi holat o'zgarishi. Sahifa 10 daqiqadan beri o'zgarmagan
   * `yuborilmoqda` ni osilgan deb taniydi (`qaytaUrinishgaOl` chegarasi).
   */
  readonly updatedAt: Date;
}

/** Talabnoma yuborishga yaroqli shartnoma — SQL oldindan filtrlagan qator. */
export interface TalabnomaNomzodi {
  readonly contractId: string;
  readonly clientId: string;
  readonly contractNo: string;
  readonly contractDate: Date | null;
  readonly objectName: string | null;
  readonly objectAddress: string | null;
  readonly companyInn: string | null;
  /** Kechikkan oylik to'lovlar — talabnoma summasi shu. */
  readonly debtMonthly: number;
  readonly fullName: string;
  readonly firstName: string | null;
  /** Mijoz nomidan qarindoshi yozadi (`client_profiles.interlocutor_*`). */
  readonly qarindoshOrqali: boolean;
  /** `contracts.virtual_status` xom holda (kalit yoki Excel nomi) — `holatKorinishi` bilan o'qiladi. */
  readonly virtualStatus: string | null;
}
