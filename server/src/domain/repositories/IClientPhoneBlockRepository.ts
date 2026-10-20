import type { MijozQamrovi } from '@/domain/entities/MijozQamrovi';

/**
 * Mijozdan uzilgan raqamlar — "bu raqam shu mijozniki emas" belgisi.
 *
 * Belgi DOIMIY: sinxronizatsiya ham, import ham raqamni shu mijozga qayta
 * bog'lay olmaydi. Usiz CRM har yangilanishda uzilgan raqamni qaytarib
 * qo'yardi va begona odamga bergan "boshqa yozilmaydi" degan va'damiz
 * buzilardi.
 */

export interface ClientPhoneBlock {
  readonly clientId: string;
  readonly phone: string;
  readonly reason: string | null;
  readonly blockedBy: string | null;
  readonly blockedAt: Date;
}

/** CRM jamoasiga beriladigan hisobot qatori. */
export interface PhoneBlockReportRow extends ClientPhoneBlock {
  readonly clientName: string;
  /** Mijozning shartnoma raqamlari — CRM'da qidirish uchun. */
  readonly contractNos: string[];
  readonly blockedByName: string | null;
}

export interface IClientPhoneBlockRepository {
  /**
   * Raqamni uzilgan deb belgilaydi.
   *
   * Idempotent: allaqachon belgilangan raqam qayta yuborilsa xato
   * bermaydi va yozuvni o'zgartirmaydi — birinchi uzish sababi va vaqti
   * saqlanib qoladi. Operator tugmani ikki marta bosishi mumkin.
   */
  block(entry: {
    clientId: string;
    phone: string;
    reason?: string | null;
    blockedBy?: string | null;
  }): Promise<void>;

  /** Xato belgilangan bo'lsa — to'siqni olib tashlaydi. */
  unblock(clientId: string, phone: string): Promise<void>;

  /** Shu mijoz uchun uzilgan raqamlar. Sinxronizatsiya va import shuni so'raydi. */
  listForClient(clientId: string): Promise<string[]>;

  /**
   * Bir nechta mijoz uchun bir so'rovda.
   *
   * Ommaviy import har qator uchun alohida so'rov yuborsa, minglab
   * qatorli faylda bu sezilarli sekinlashuvga aylanardi.
   */
  listForClients(clientIds: readonly string[]): Promise<Map<string, string[]>>;

  /** CRM uchun hisobot — eng yangisi birinchi. */
  /** `qamrov` — obyekt cheklovi; sukut `HAMMASI` (SQL o'zgarmaydi). */
  report(qamrov?: MijozQamrovi): Promise<PhoneBlockReportRow[]>;

  /** Hisobot filtri uchun: to'silgan raqami bor mijozlar. */
  clientIdsWithBlocks(): Promise<string[]>;
}
