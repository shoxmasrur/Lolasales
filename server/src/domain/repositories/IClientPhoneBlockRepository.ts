/**
 * Mijozdan uzilgan raqamlar — "bu raqam shu mijozniki emas" belgisi.
 *
 * Belgi DOIMIY: import raqamni shu mijozga qayta bog'lay olmaydi. Usiz
 * begona odamga bergan "boshqa yozilmaydi" degan so'zimiz buzilardi.
 */

export interface ClientPhoneBlock {
  readonly clientId: string;
  readonly phone: string;
  readonly reason: string | null;
  readonly blockedBy: string | null;
  readonly blockedAt: Date;
}

/** Uzilgan raqamlar hisobotining qatori. */
export interface PhoneBlockReportRow extends ClientPhoneBlock {
  readonly clientName: string;
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

  /** Raqam biror mijozdan uzilganmi (importdagi yangi lead shunday raqamga yozilmasin). */
  isPhoneBlocked(phone: string): Promise<boolean>;

  /** Shu mijoz uchun uzilgan raqamlar. Import shuni so'raydi. */
  listForClient(clientId: string): Promise<string[]>;

  /**
   * Bir nechta mijoz uchun bir so'rovda.
   *
   * Ommaviy import har qator uchun alohida so'rov yuborsa, minglab
   * qatorli faylda bu sezilarli sekinlashuvga aylanardi.
   */
  listForClients(clientIds: readonly string[]): Promise<Map<string, string[]>>;

  /** Hisobot — eng yangisi birinchi. */
  report(): Promise<PhoneBlockReportRow[]>;

  /** Hisobot filtri uchun: to'silgan raqami bor mijozlar. */
  clientIdsWithBlocks(): Promise<string[]>;
}
