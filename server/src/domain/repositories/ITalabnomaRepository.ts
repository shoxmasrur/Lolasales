import type { Talabnoma, TalabnomaHolati, TalabnomaNomzodi } from '@/domain/entities/Talabnoma';
import type { HolatKorinishi } from '@/domain/entities/shartnomaHolati';
import type { Rekvizit } from '@/domain/services/rekvizit';
import type { Page, Pagination } from '@/domain/repositories/types';

export interface YangiTalabnoma {
  contractId: string;
  clientId: string;
  summa: number;
  rekvizit: Rekvizit;
}

export interface YuborildiMalumoti {
  pdfPath: string;
  messageId: string;
  /** YYYY-MM-DD */
  kuchgaKirish: string;
  /** YYYY-MM-DD */
  muddatSanasi: string;
  sentBy: string;
  sentAt: Date;
}

export interface TalabnomaQuery extends Pagination {
  /** Talabnomaning o'z holati (yuborilmoqda/yuborildi/…). */
  holat?: TalabnomaHolati;
  /**
   * Shartnomaning HOZIRGI CRM holati — kanonik kalit (`holatKorinishi`).
   * Bazadagi barcha yozilishlari (kalit va Excel nomi) bilan solishtiriladi.
   */
  shartnomaHolati?: string;
  /** Obyekt nomi — qirqilgan holda aniq moslik. */
  obyekt?: string;
  /** Faqat shu mijozning talabnomalari («Batafsil» oynasi). */
  clientId?: string;
}

/**
 * Ro'yxat qatori. `sentByName` — yuborgan operatorning ismi: sahifa uni
 * `/users` dan qidirmasin (u `users.view` huquqini talab qiladi).
 * `shartnomaHolati`/`objectName` — shartnomaning HOZIRGI holati (yuborilgan
 * paytdagisi emas): talabnomadan keyin shartnoma bekor qilinayotgan bo'lsa,
 * operator shuni ko'rishi kerak.
 */
export type TalabnomaQatori = Talabnoma & {
  fullName: string;
  contractNo: string;
  sentByName: string | null;
  objectName: string | null;
  shartnomaHolati: HolatKorinishi | null;
};

/** «Yuborilgan» filtrlari uchun variantlar — talabnomasi bor shartnomalardan. */
export interface TalabnomaFiltrVariantlari {
  holatlar: HolatKorinishi[];
  obyektlar: string[];
}

export interface ITalabnomaRepository {
  /**
   * Yuborishga yaroqli shartnomalar. SQL faqat OLDINDAN filtrlaydi
   * (2+ oy kechikish, yoziladigan holat, `isContactable`, noma'lum emas,
   * band talabnoma yo'q, mijozda amaldagi va'da yo'q); yakuniy qaror —
   * domen qoidasida.
   */
  nomzodlar(todayIso: string): Promise<TalabnomaNomzodi[]>;
  /**
   * Xuddi shu filtr bitta shartnomaga — yuborish oldidan qayta tekshiruv.
   * `istisnoTalabnomaId` — shu talabnoma "band" deb sanalmaydi: qayta
   * urinishda shartnomani aynan o'zi band qilib turadi, qolgan shartlar
   * (to'lov, va'da, bog'lanish taqiqi) baribir tekshirilishi kerak.
   */
  nomzod(contractId: string, todayIso: string, istisnoTalabnomaId?: string): Promise<TalabnomaNomzodi | null>;
  /** `holat='yuborilmoqda'`. Shartnoma band bo'lsa `ConflictError` (`code='TALABNOMA_BOR'`). */
  yarat(t: YangiTalabnoma): Promise<Talabnoma>;
  /** Raqam bir marta beriladi: qayta urinishda o'sha raqam qaytadi. */
  raqamBer(id: string): Promise<number>;
  /** Faqat `yuborilmoqda` dan. */
  yuborildi(id: string, p: YuborildiMalumoti): Promise<void>;
  /** Faqat `yuborilmoqda` dan. */
  xato(id: string, sabab: string): Promise<void>;
  /**
   * `xato` yoki 10 daqiqadan beri yangilanmagan `yuborilmoqda` →
   * `yuborilmoqda`. Boshqa holatda `null` (ikki operator bir vaqtda
   * qayta bossa, faqat bittasi oladi).
   */
  qaytaUrinishgaOl(id: string): Promise<Talabnoma | null>;
  /** Faqat `xato` → `bekor`. Bo'lmasa `false`. */
  bekorQil(id: string): Promise<boolean>;
  findById(id: string): Promise<Talabnoma | null>;
  /**
   * Shartnomani band qilib turgan talabnoma (`yuborilmoqda|yuborildi|xato`).
   * NEGA: `nomzod()` band shartnomani ham `null` qaytaradi — yuborishda
   * "allaqachon bor" ni "endi kerak emas" dan ajratish uchun kerak.
   */
  bandTalabnoma(contractId: string): Promise<Talabnoma | null>;
  list(q: TalabnomaQuery): Promise<Page<TalabnomaQatori>>;
  /** `list` filtrlari uchun: talabnomasi bor shartnomalarning holatlari va obyektlari. */
  filtrVariantlari(): Promise<TalabnomaFiltrVariantlari>;
  /** `yuborildi` talabnomalarning eng kech muddati (≥ bugun), yo'q bo'lsa `null`. */
  faolMuddat(clientId: string, todayIso: string): Promise<string | null>;
  /** Agent konteksti uchun: mijozning `yuborildi` talabnomalari, shartnoma raqami bilan. */
  yuborilganlar(clientId: string): Promise<Array<Talabnoma & { contractNo: string }>>;
}
