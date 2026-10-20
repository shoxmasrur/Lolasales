export type TelegramLookupStatus =
  | 'unknown'
  | 'searching'
  | 'found'
  | 'not_found'
  | 'privacy_restricted'
  /** Raqam bo'yicha odam topildi, lekin ismi mijozning ismiga mos kelmadi. */
  | 'name_mismatch'
  | 'blocked'
  /**
   * Mijozning Telegram akkaunti o'chirilgan (`INPUT_USER_DEACTIVATED`).
   *
   * `blocked` dan farqi tub: u yerda mijoz bor, lekin yozishni xohlamaydi;
   * bu yerda akkaunt umuman yo'q. Operator boshqa aloqa vositasi qidirishi
   * kerak.
   */
  | 'deactivated';

export type ClientSource = 'reklama' | 'guruh' | 'raqam' | 'qolda';
export const CLIENT_SOURCES: readonly ClientSource[] = ['reklama', 'guruh', 'raqam', 'qolda'];

export const CLIENT_SOURCE_LABEL: Record<ClientSource, string> = {
  reklama: 'Reklama',
  guruh: 'Guruh',
  raqam: 'Raqam',
  qolda: "Qo'lda",
};

export interface Client {
  /** Mijoz qayerdan kelgani. */
  readonly source: ClientSource;
  readonly sourceGroup: string | null;
  readonly sourceComment: string | null;
  readonly id: string;
  readonly externalId: string | null;
  readonly fullName: string;
  /**
   * CRM bergan ANIQ ism. Murojaat shakli ("Aziz aka") shundan tuziladi.
   *
   * NULL bo'lsa ism to'liq ism-sharifdan taxmin qilinadi — Excel importidan
   * kelgan, CRM'da yozuvi bo'lmagan mijozlarda shunday bo'ladi.
   */
  readonly firstName: string | null;
  readonly phone: string | null;
  readonly extraPhones: string[];
  readonly telegramUserId: string | null;
  readonly telegramUsername: string | null;
  readonly telegramAccessHash: string | null;
  /**
   * `telegramAccessHash` ni QAYSI akkaunt topgani.
   *
   * MTProto'da `access_hash` (akkaunt, peer) juftligiga bog'langan —
   * boshqa akkauntdan ishlatilsa `PEER_ID_INVALID` chiqadi. Shuning uchun
   * yuborishdan oldin `cachedPeerUsable()` bilan solishtiriladi.
   * `null` — kim topgani noma'lum, qaytadan qidirish kerak.
   */
  readonly telegramHashAccountId: string | null;
  readonly telegramName: string | null;
  readonly telegramStatus: TelegramLookupStatus;
  readonly telegramCheckedAt: Date | null;
  /**
   * Mijozga doimiy biriktirilgan Telegram akkaunt.
   * Suhbat oxirigacha faqat shu akkauntdan yoziladi.
   */
  readonly telegramAccountId: string | null;
  readonly accountAssignedAt: Date | null;
  readonly doNotContact: boolean;
  readonly notes: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /**
   * Yumshoq o'chirish belgisi. NULL bo'lmasa — mijoz ro'yxatlarda yo'q,
   * lekin uning shartnomalari, suhbatlari va xabarlari bazada turadi.
   */
  readonly deletedAt: Date | null;
  /** Kim o'chirgani (pochtasi) — "O'chirilgan" ro'yxatida ko'rsatiladi. */
  readonly deletedBy: string | null;
  /** Telegramda o'zi yozgan, bazada bo'lmagan odam — shartnomasi yo'q. */
  readonly nomalum: boolean;
}

export interface NewClient {
  externalId?: string | null;
  fullName: string;
  firstName?: string | null;
  phone?: string | null;
  extraPhones?: string[];
  notes?: string | null;
  /** Qaysi import yaratdi — importni qaytarish shu bo'yicha ishlaydi. */
  createdImportBatchId?: string | null;
  /** Faqat `NomalumMijozOchuvchi` beradi. */
  nomalum?: boolean;
}

/** Mijozga xabar yuborish mumkinmi — sof domen qoidasi. */
export function isContactable(client: Client): boolean {
  if (client.doNotContact) return false;
  if (client.telegramStatus === 'blocked') return false;
  // Akkaunt o'chirilgan — yuborilgan xabar hech kimga yetmaydi.
  if (client.telegramStatus === 'deactivated') return false;
  return Boolean(client.phone || client.telegramUserId);
}

/** Mijozning barcha ma'lum raqamlari (asosiy birinchi). */
export function allPhones(client: Client): string[] {
  return [client.phone, ...client.extraPhones].filter((p): p is string => Boolean(p));
}
