import type { TelegramProxy } from '@/domain/entities/telegramProxy';
import type { StyleVersion } from '@/domain/entities/UslubVersiyasi';

export type { TelegramProxy, TelegramProxyPatch } from '@/domain/entities/telegramProxy';

/**
 * Yangi akkaunt uchun kunlik chegaralar.
 *
 * Bazadagi ustun standartlari ham AYNAN shu sonlar (048 migratsiyasi) —
 * ikkalasi ajralib ketmasligi uchun kod shu yerdan oladi.
 *
 * Sonlar tajribaga asoslangan taxmin: Telegramning haqiqiy chegarasi
 * oshkor emas va akkaunt yoshiga bog'liq. Akkaunt kartasidan pasaytirsa
 * bo'ladi.
 */
export const DEFAULT_DAILY_LIMIT = 30;
export const DEFAULT_LOOKUP_LIMIT = 50;

export type TelegramAccountStatus =
  | 'logged_out'
  | 'awaiting_code'
  | 'awaiting_password'
  | 'awaiting_qr'
  | 'connected'
  | 'error'
  | 'banned';

/**
 * @SpamBot javobi bo'yicha holat.
 *   clean         — cheklov yo'q
 *   limited       — vaqtinchalik cheklangan (notanish odamlarga yoza olmaydi)
 *   banned        — akkaunt bloklangan
 *   check_failed  — tekshirib bo'lmadi (bot javob bermadi)
 */
export type SpamStatus = 'unknown' | 'clean' | 'limited' | 'banned' | 'check_failed';

export interface TelegramAccount {
  readonly id: string;
  readonly label: string;
  /**
   * Mijoz ko'radigan ism. `null` — umumiy sozlamadagi ism ishlatiladi.
   * `label` dan farqi: `label` ichki nom, bu esa mijozga aytiladigan ism.
   */
  readonly personaName: string | null;
  readonly phone: string;
  readonly apiId: number;
  /** Shifrlangan holda saqlanadi, faqat gateway ochadi. */
  readonly apiHash: string;
  readonly session: string | null;
  readonly status: TelegramAccountStatus;
  readonly statusMessage: string | null;
  readonly tgUserId: string | null;
  readonly tgUsername: string | null;
  readonly dailyLimit: number;
  readonly sentToday: number;
  /** Kunlik telefon qidiruvi (importContacts) chegarasi. */
  readonly lookupLimit: number;
  readonly lookupsToday: number;
  readonly counterDate: string | null; // YYYY-MM-DD
  readonly floodWaitUntil: Date | null;
  /**
   * Hozirgi FLOOD_WAIT qachon boshlangani. `null` — cheklov yo'q yoki
   * 060 migratsiyasidan oldin yozilgan.
   *
   * `floodWaitUntil` dan farqi: bu YANGI cheklov sezilganda bir marta
   * yoziladi va cheklov davom etsa tegilmaydi. Shu sabab operator
   * "qancha vaqtdan beri" degan savolga javob oladi.
   */
  readonly floodWaitSince: Date | null;
  /** PEER_FLOOD birinchi marta qachon ko'rilgani. Toza tekshiruvda tozalanadi. */
  readonly peerFloodSince: Date | null;
  readonly spamStatus: SpamStatus;
  readonly spamCheckedAt: Date | null;
  readonly spamMessage: string | null;
  readonly spamUntil: Date | null;
  /** `null` — akkaunt to'g'ridan-to'g'ri, server IP'sidan ulanadi. */
  readonly proxy: TelegramProxy | null;
  readonly isEnabled: boolean;
  readonly styleVersion: StyleVersion;
  /**
   * Akkaunt qaysi til modeli bilan yozadi. `null` — standart yo'l
   * (Claude, .env dagi AGENT_MODEL) — 112-migratsiyadan oldingi va
   * keyingi barcha akkauntlar shu holatdan boshlanadi.
   */
  readonly llmModelId: string | null;
  /**
   * Telegram Premium tugash sanasi, YYYY-MM-DD. `null` — Premium yo'q.
   * Qo'lda kiritiladi (`domain/services/premium.ts`); tizim ishiga
   * ta'sir qilmaydi — faqat belgi va eslatma.
   */
  readonly premiumUntil: string | null;
  /** Shu sana uchun oxirgi yuborilgan eslatma bosqichi (30/7/1/0 kun). */
  readonly premiumEslatildi: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Akkaunt hozir NOTANISH odamga birinchi xabarni yubora oladimi.
 *
 * Kunlik kvota aynan shu yerda hal qiluvchi: Telegramning spam filtri
 * (PEER_FLOOD) o'zaro yozishmagan odamlarga yuborilgan xabarlarni
 * sanaydi. Mavjud suhbatdagi javob uchun `canReply` ishlatiladi.
 */
export function canSend(account: TelegramAccount, now: Date, todayIso: string): boolean {
  if (!account.isEnabled) return false;
  if (account.status !== 'connected') return false;
  if (account.floodWaitUntil && account.floodWaitUntil.getTime() > now.getTime()) return false;
  // Spam filtriga tushgan akkaunt notanish odamlarga umuman yoza olmaydi —
  // urinish faqat cheklovni uzaytiradi.
  if (account.spamStatus === 'limited' || account.spamStatus === 'banned') {
    if (!account.spamUntil || account.spamUntil.getTime() > now.getTime()) return false;
  }
  const usedToday = account.counterDate === todayIso ? account.sentToday : 0;
  return usedToday < account.dailyLimit;
}

/**
 * Akkaunt hozir Telegramdan telefon raqami bo'yicha odam qidira oladimi.
 *
 * NEGA XABARDAN ALOHIDA: `contacts.importContacts` — spam filtri uchun
 * mustaqil signal. Xabar yubormasdan ham kuniga yuzlab raqam qidirish
 * akkauntni cheklashga olib keladi. Shuning uchun o'z hisoblagichi va
 * o'z chegarasi bor; xabar kvotasi tugagani qidiruvni to'xtatmaydi va
 * aksincha.
 */
export function canLookup(account: TelegramAccount, now: Date, todayIso: string): boolean {
  if (!account.isEnabled) return false;
  if (account.status !== 'connected') return false;
  if (account.floodWaitUntil && account.floodWaitUntil.getTime() > now.getTime()) return false;
  if (account.spamStatus === 'limited' || account.spamStatus === 'banned') {
    if (!account.spamUntil || account.spamUntil.getTime() > now.getTime()) return false;
  }
  const usedToday = account.counterDate === todayIso ? account.lookupsToday : 0;
  return usedToday < account.lookupLimit;
}

/**
 * Akkaunt MAVJUD suhbatda javob bera oladimi.
 *
 * Kunlik kvota bu yerda TEKSHIRILMAYDI. Kvota — notanish odamga
 * yozishdan himoya; mijoz o'zi yozgan suhbatda javob berish esa
 * Telegram uchun oddiy yozishma va PEER_FLOOD xavfini tug'dirmaydi.
 * Kvota javoblarga ham tegsa, kun o'rtasida agent jim qolib, mijoz
 * javobsiz qolardi — bu undiruv uchun ham, obro' uchun ham yomon.
 *
 * `limited` holati ham to'sqinlik qilmaydi: spam filtri cheklagan
 * akkaunt notanish odamga yoza olmaydi, lekin mavjud suhbatni davom
 * ettira oladi. `banned` esa umuman yoza olmaydi.
 */
export function canReply(account: TelegramAccount, now: Date): boolean {
  if (!account.isEnabled) return false;
  if (account.status !== 'connected') return false;
  if (account.floodWaitUntil && account.floodWaitUntil.getTime() > now.getTime()) return false;
  if (account.spamStatus === 'banned') {
    if (!account.spamUntil || account.spamUntil.getTime() > now.getTime()) return false;
  }
  return true;
}

export type RestrictionKind =
  | 'flood_wait'
  | 'peer_flood'
  | 'limited'
  | 'banned'
  | 'session_dead'
  | 'not_connected';

export interface AccountRestriction {
  readonly kind: RestrictionKind;
  /** Cheklov qachon boshlangani. `null` — yozib qolinmagan. */
  readonly since: Date | null;
  /** Qachon ochilishi. `null` — Telegram aytmagan; TAXMIN QILINMAYDI. */
  readonly until: Date | null;
  readonly source: 'mtproto' | 'spambot';
  readonly message: string | null;
}

/**
 * Akkauntning bazada yozib qolingan FAOL cheklovlari.
 *
 * Tekshiruv tugmasini bosish SHART EMAS: cheklovlar haqiqiy urinishlar
 * paytida yozib boriladi, ya'ni karta ochilishi bilan ko'rinadi. Ilgari
 * `flood_wait_until` bazada turardi-yu, ekranda hech qayerda yo'q edi —
 * akkaunt jim turar, sababi esa ko'rinmasdi.
 *
 * Muddati o'tgan cheklov ro'yxatga TUSHMAYDI: "ochilgan" cheklov
 * operatorni akkaunt hali cheklangan deb o'ylashga majbur qilardi.
 */
export function activeRestrictions(
  account: TelegramAccount,
  now: Date = new Date(),
): AccountRestriction[] {
  const out: AccountRestriction[] = [];

  if (account.floodWaitUntil && account.floodWaitUntil.getTime() > now.getTime()) {
    out.push({
      kind: 'flood_wait',
      since: account.floodWaitSince,
      until: account.floodWaitUntil,
      source: 'mtproto',
      message: 'Telegram bu akkauntdan so\'rovlarni vaqtincha sekinlashtirdi',
    });
  }

  if (account.peerFloodSince) {
    out.push({
      kind: 'peer_flood',
      since: account.peerFloodSince,
      // PEER_FLOOD ning ochilish vaqtini MTProto AYTMAYDI. @SpamBot sana
      // bergan bo'lsa (`spamUntil`) — yagona ishonchli manba shu.
      until: account.spamStatus === 'limited' ? account.spamUntil : null,
      source: 'mtproto',
      message: 'Akkaunt notanish odamlarga yozishdan cheklangan',
    });
  }

  // @SpamBot cheklangan desa-yu, PEER_FLOOD hali bizga tushmagan bo'lsa —
  // bu ham cheklov. Ikki marta ko'rsatmaslik uchun faqat shu holatda.
  if (account.spamStatus === 'limited' && !account.peerFloodSince) {
    out.push({
      kind: 'limited',
      since: account.spamCheckedAt,
      until: account.spamUntil,
      source: 'spambot',
      message: account.spamMessage,
    });
  }

  if (account.spamStatus === 'banned' || account.status === 'banned') {
    out.push({
      kind: 'banned',
      since: account.spamCheckedAt,
      until: account.spamUntil,
      source: account.spamStatus === 'banned' ? 'spambot' : 'mtproto',
      message: account.spamMessage ?? account.statusMessage,
    });
  }

  return out;
}

/** Yangi mijozlarni biriktirish uchun yaroqli akkauntlar. */
export function canAcceptClients(account: TelegramAccount): boolean {
  return account.isEnabled && account.spamStatus !== 'banned';
}

export function remainingQuota(account: TelegramAccount, todayIso: string): number {
  const usedToday = account.counterDate === todayIso ? account.sentToday : 0;
  return Math.max(0, account.dailyLimit - usedToday);
}

export function remainingLookups(account: TelegramAccount, todayIso: string): number {
  const usedToday = account.counterDate === todayIso ? account.lookupsToday : 0;
  return Math.max(0, account.lookupLimit - usedToday);
}

/**
 * Mijoz ko'radigan ism: akkauntniki ustun, bo'lmasa umumiy sozlamadagi.
 *
 * Bo'sh satr "ism yo'q" degani — operator maydonni tozalaganda akkaunt
 * umumiy ismga qaytishi kerak, ismsiz yozib ketmasligi emas.
 */
export function personaNameOf(account: TelegramAccount | null, fallback: string): string {
  return account?.personaName?.trim() || fallback;
}
