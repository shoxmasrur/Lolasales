import type { Client, NewClient, TelegramLookupStatus } from '@/domain/entities/Client';
import type { AloqaHolati } from '@/domain/entities/aloqaHolati';
import type { Page, Pagination } from '@/domain/repositories/types';
import type { MijozQamrovi } from '@/domain/entities/MijozQamrovi';

export type ClientTab = 'all' | 'new' | 'in_conversation' | 'no_telegram' | 'needs_review' | 'deleted';

export type ClientTabCounts = Record<ClientTab, number>;

/** Yumshoq o'chirish (yoki tiklash) nechta qatorga tegdi — audit uchun. */
export interface ClientDeletionSummary {
  readonly deletedAt: Date;
  readonly contracts: number;
  readonly conversations: number;
  readonly messages: number;
  readonly promises: number;
  readonly campaignTargets: number;
  readonly profiles: number;
}

export interface ClientQuery extends Pagination {
  search?: string;
  /** Bir nechta holat — "yoki". Bo'sh yoki berilmagan — filtr yo'q. */
  telegramStatus?: readonly TelegramLookupStatus[];
  /**
   * Dashboarddagi tab filtri — operatorning ish oqimi bo'yicha:
   *   new           — hali suhbat boshlanmagan
   *   in_conversation — suhbat bor
   *   no_telegram   — Telegramda topilmadi yoki bog'lana olmaymiz
   *   needs_review  — profil topildi, lekin ism mos kelmadi (tasdiq kutilyapti)
   *   deleted       — savat: o'chirilganlar (faqat shu tabda ko'rinadi)
   */
  tab?: ClientTab;
  hasPhone?: boolean;
  hasDebt?: boolean;
  minDaysOverdue?: number;
  objectName?: string;
  /**
   * Shartnoma holati (`virtual_status`) — kalit bo'yicha.
   *
   * Bitta holat bazada ikki xil yozilgan bo'lishi mumkin (kalit va
   * ko'rinadigan nom), shuning uchun kalit `holatQiymatlari()` orqali
   * barcha yozilishlariga yoyiladi. Bir nechta kalit — "yoki".
   */
  virtualStatus?: readonly string[];
  /**
   * Aloqa qay bosqichda uzilgani — `javobsiz` yoki `oqilmagan`.
   * Berilmasa filtr qo'llanmaydi.
   */
  aloqa?: AloqaHolati;
  sort?: 'debt' | 'overdue' | 'name' | 'recent';
}

/** Filtr ro'yxati uchun: bazada uchraydigan holatlar va ular soni. */
export interface ContractStatusOption {
  readonly key: string;
  readonly label: string;
  readonly clients: number;
}

/** Ro'yxat uchun: mijoz + shartnomalari bo'yicha jamlangan kechikkan to'lov. */
export interface ClientWithDebt extends Client {
  /**
   * Oyma-oy to'lovdagi kechikish (`Долг (мес.)`) — agent mijozga AYNAN
   * shu summani aytadi. `debtTotal` esa xodim uchun to'liq manzara.
   */
  readonly debtMonthly: number;
  readonly debtTotal: number;
  readonly daysOverdue: number;
  readonly contractsCount: number;
  /**
   * Shartnomalarining CRM holatlari (kalit bo'yicha, takrorsiz).
   *
   * Ro'yxat, chunki mijozda bir nechta shartnoma bo'lishi va ular turli
   * holatda turishi mumkin — aynan shunday holatlar chalkashlik tug'diradi
   * ("nega bunga xabar ketmadi?"), shuning uchun hammasi ko'rsatiladi.
   */
  readonly contractStatuses: string[];
  /**
   * Biriktirilgan akkauntning mijozga ko'rinadigan ismi, u bo'lmasa ichki
   * nomi. Biriktirilmagan bo'lsa `null`.
   */
  readonly accountName: string | null;
}

/**
 * Ommaviy suhbat boshlashdan OLDIN har bir mijoz uchun kutilayotgan natija.
 *
 * Telegramga bitta ham so'rov yubormasdan, faqat bazadagi holat bo'yicha
 * hisoblanadi — shuning uchun tugmani bosishdan oldin ko'rsatish mumkin.
 * Sabablarning TARTIBI `StartConversationUseCase` dagi tekshiruvlar tartibi
 * bilan bir xil, aks holda oldindan aytilgan sabab haqiqiysiga mos kelmaydi.
 */
export type BulkStartOutlook =
  /** Telegram profili saqlangan — xabar ketadi. */
  | 'ready'
  /** Ism mos kelmadi: raqam boshqa odamda bo'lishi mumkin. */
  | 'name_mismatch'
  /** Telegramda qidiriladi — natija oldindan noma'lum. */
  | 'needs_lookup'
  | 'do_not_contact'
  | 'blocked'
  /** Mijozning Telegram akkaunti o'chirilgan. */
  | 'deactivated'
  | 'no_phone'
  /** Birorta ham "Сотилди" shartnomasi yo'q — bekor qilinayotgan yoki hali sotilmagan. */
  | 'not_sold'
  | 'no_debt'
  /**
   * Kechikish bor, lekin minimal chegaradan katta emas.
   *
   * `no_debt` dan ALOHIDA saqlanadi: operator "kechikishi umuman yo'q"
   * bilan "chegara tufayli tushib qoldi" ni ajrata olishi kerak —
   * ikkinchisi Sozlamalardagi bitta raqam bilan hal qilinadi, birinchisi
   * yo'q.
   */
  | 'below_min_debt'
  | 'already_started';

/** Ogohlantirish dialogida ko'rsatiladigan juftlik. */
export interface BulkStartMismatch {
  readonly id: string;
  readonly fullName: string;
  readonly telegramName: string | null;
  readonly phone: string | null;
}

/** Tanlangan akkauntlarning har biriga nechta mijoz tushishi. */
export interface BulkStartAccountPlan {
  readonly accountId: string;
  readonly label: string;
  /** Mijoz ko'radigan ism; akkauntda ko'rsatilmagan bo'lsa umumiy ism. */
  readonly personaName: string;
  readonly count: number;
  readonly remainingToday: number;
  /** Shu akkauntda bugungi kvotaga sig'maydiganlar soni. */
  readonly overQuota: number;
}

export interface BulkStartPreview {
  readonly total: number;
  readonly counts: Record<BulkStartOutlook, number>;
  readonly mismatches: BulkStartMismatch[];
  /** Tanlangan akkauntlar bo'yicha taqsimot. Akkaunt tanlanmagan bo'lsa bo'sh. */
  readonly accountPlan: BulkStartAccountPlan[];
  /** Tanlov natijasida akkaunti o'zgaradigan mijozlar soni. */
  readonly reassigned: number;
}

export interface TelegramIdentity {
  telegramUserId: string;
  telegramUsername?: string | null;
  telegramAccessHash?: string | null;
  /**
   * Hash'ni topgan akkaunt — MAJBURIY.
   *
   * `access_hash` (akkaunt, peer) juftligiga bog'langan, shuning uchun uni
   * kim topganini bilmasdan saqlash keyin `PEER_ID_INVALID` ga olib keladi.
   * Ixtiyoriy qilinsa, chaqiruvchi uni unutib qo'yishi mumkin — tip
   * darajasida majburlaymiz.
   */
  telegramHashAccountId: string;
  /** Telegramda ko'rsatiladigan ism — mijoz F.I.O. si bilan solishtirish uchun. */
  telegramName?: string | null;
}

export interface IClientRepository {
  /** `includeDeleted` faqat savat va tiklash oqimi uchun. */
  findById(id: string, options?: { includeDeleted?: boolean }): Promise<Client | null>;
  findByExternalId(externalId: string): Promise<Client | null>;
  findByPhone(phoneE164: string): Promise<Client | null>;
  findByTelegramUserId(tgUserId: string): Promise<Client | null>;
  /**
   * Ro'yxat metodlarining oxirgi `qamrov` parametri — obyekt cheklovi.
   * Sukut `HAMMASI`: SQL o'zgarmaydi.
   */
  search(query: ClientQuery, qamrov?: MijozQamrovi): Promise<Page<ClientWithDebt>>;
  /**
   * Filtrga tushgan hamma mijozning id'lari — sahifalashsiz.
   * "Filtrdagi hammasini belgilash" uchun.
   */
  searchIds(query: ClientQuery, qamrov?: MijozQamrovi): Promise<string[]>;
  /**
   * Filtrga tushgan hamma qator — bo'laklab, sanoqsiz.
   *
   * `search` limitni 200 bilan cheklaydi va har chaqiruvda `COUNT(*)`
   * qiladi — u ekran uchun. Bu esa eksport uchun: butun to'plamni
   * xotiraga yig'masdan, bo'lak-bo'lak beradi.
   */
  searchAll(query: ClientQuery, batchSize?: number, qamrov?: MijozQamrovi): AsyncIterable<ClientWithDebt[]>;
  /** Har bir tabdagi mijozlar soni — tugmalar yonida ko'rsatiladi. */
  tabCounts(qamrov?: MijozQamrovi): Promise<ClientTabCounts>;
  /** Filtr uchun: bazada uchraydigan shartnoma holatlari. */
  contractStatuses(qamrov?: MijozQamrovi): Promise<ContractStatusOption[]>;
  create(data: NewClient): Promise<Client>;
  /**
   * Mijozni va unga bog'liq hamma narsani yumshoq o'chiradi.
   * Bazadan hech narsa yo'qolmaydi — faqat `deleted_at` qo'yiladi.
   */
  softDelete(id: string, actor: string): Promise<ClientDeletionSummary>;
  /**
   * Faqat noma'lum mijoz qatorini yopadi (suhbat/xabarlarga tegmaydi, Telegram
   * id tozalanadi). Suhbat haqiqiy mijozga ko'chirilgandan keyin chaqiriladi.
   */
  nomalumniYopish(clientId: string): Promise<void>;
  /** O'chirishni bekor qiladi. */
  restore(id: string): Promise<ClientDeletionSummary>;
  update(id: string, patch: Partial<NewClient> & { doNotContact?: boolean }): Promise<Client>;
  setTelegramIdentity(id: string, identity: TelegramIdentity, status: TelegramLookupStatus): Promise<Client>;
  setTelegramStatus(id: string, status: TelegramLookupStatus): Promise<Client>;
  /**
   * Keshdagi Telegram shaxsini o'chiradi va holatni `unknown` ga qaytaradi.
   *
   * Raqam mijozdan uzilganda MAJBURIY: `telegram_user_id` aynan o'sha
   * raqamdan topilgan hisobga — ya'ni begona odamga — ishora qiladi va
   * tozalanmasa xabar raqamsiz ham o'shanga ketaverardi.
   */
  clearTelegramIdentity(id: string): Promise<void>;
  /** Ism mos kelmagan holatda ham kimga tushganini saqlab qo'yamiz. */
  setTelegramName(id: string, name: string | null): Promise<void>;
  /** Telegramda hali qidirilmagan, telefon raqami bor mijozlar. */
  findPendingTelegramLookup(limit: number): Promise<Client[]>;
  /**
   * Ommaviy suhbat boshlashdan oldingi tekshiruv: tanlanganlarning
   * nechtasiga xabar ketishi va qolgani nega o'tkazib yuborilishi.
   *
   * `minDebt` — `OutreachSettings.minDebt`. Chaqiruvchi uni sozlamadan
   * oladi: repozitoriy sozlamalarni o'zi o'qisa, dialogda ko'rsatilgan
   * son bilan yuborishda qo'llanadigan chegara ayri manbadan kelardi.
   */
  previewBulkStart(clientIds: string[], minDebt: number): Promise<BulkStartPreview>;
  /**
   * Ommaviy suhbat boshlashda akkaunti O'ZGARTIRILSA bo'ladigan mijozlar.
   *
   * Chiquvchi xabari bor mijoz ro'yxatga kirmaydi: unga allaqachon bir
   * akkauntdan yozilgan va boshqasiga ko'chirish yozishmani uzib qo'yardi.
   * Bog'lanish taqiqlangan, bloklangan va aloqa vositasi yo'qlar ham
   * chiqarib tashlanadi — ularga baribir yozilmaydi.
   */
  findReassignableForBulkStart(clientIds: string[]): Promise<string[]>;

  // ─── Akkauntga biriktirish ───────────────────────────────────────────────

  assignAccount(clientId: string, accountId: string): Promise<Client>;
  /**
   * Ko'p mijozni bir yo'la biriktiradi — BITTA tranzaksiyada.
   *
   * NEGA ALOHIDA METOD: ommaviy suhbat boshlashda 5000 tagacha biriktirish
   * bo'lishi mumkin. Har birini alohida `assignAccount` bilan bajarish ikki
   * muammo tug'diradi: (1) o'rtada uzilish yarim taqsimot qoldiradi —
   * mijozlarning bir qismi yangi akkauntda, qolgani eskisida; (2) 5000 ta
   * alohida so'rov sekin. Bu yerda hammasi bitta `UPDATE` va bitta
   * tranzaksiya — yo hammasi qo'llanadi, yo hech biri.
   *
   * Qaytaradi: haqiqatan yangilangan qatorlar soni (o'chirilgan mijozlar
   * hisobga olinmaydi, shuning uchun u kirishdan kichik bo'lishi mumkin).
   */
  assignAccounts(assignments: Array<{ clientId: string; accountId: string }>): Promise<number>;
  /** Hali biriktirilmagan mijozlar id'lari. */
  findUnassigned(limit: number): Promise<string[]>;
  /** Har bir akkauntga nechtadan mijoz biriktirilgan — teng taqsimlash uchun. */
  countByAccount(): Promise<Array<{ accountId: string; count: number }>>;
  /**
   * Har akkaunt bo'yicha suhbati boshlangan mijozlar soni — «Suhbatda»
   * tabi bilan bir xil ta'rif: o'chirilmagan suhbati bor tirik mijoz.
   */
  countConversationClientsByAccount(): Promise<Array<{ accountId: string; count: number }>>;
  /**
   * Akkaunt bo'yicha Telegramda TOPILMAGAN raqamlar soni
   * (`telegram_status = 'not_found'`).
   *
   * Akkaunt kartasida ko'rsatiladi: raqamlarning katta qismi topilmasa,
   * bu odatda akkaunt cheklovi emas, import ma'lumotidagi muammo —
   * operator noto'g'ri joyda sabab qidirmasligi uchun kerak.
   */
  countNotFoundByAccount(): Promise<Array<{ accountId: string; count: number }>>;
  /** Akkaunt o'chirilganda yoki bloklanganda mijozlarni bo'shatish. */
  releaseAccount(accountId: string): Promise<number>;
}
