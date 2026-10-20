/**
 * Telegram bilan ishlashning domen darajasidagi shartnomasi.
 * Application qatlami GramJS haqida hech narsa bilmaydi — faqat shu interfeys.
 */

export interface ResolvedPeer {
  readonly telegramUserId: string;
  readonly accessHash: string | null;
  readonly username: string | null;
  readonly firstName: string | null;
  readonly lastName: string | null;
}

export type PhoneLookupResult =
  | { readonly kind: 'found'; readonly peer: ResolvedPeer }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'privacy_restricted' };

export interface SentMessage {
  readonly telegramMsgId: number;
  readonly sentAt: Date;
}

export interface OutgoingFile {
  readonly data: Buffer;
  readonly fileName: string;
  readonly mimeType: string | null;
  readonly caption: string;
  /** Rasm/videoni siqilgan media emas, fayl sifatida yuborish. */
  readonly asDocument?: boolean;
}

import type { MediaKind } from '@/domain/entities/Message';

export interface IncomingMedia {
  readonly kind: MediaKind;
  readonly mimeType: string | null;
  readonly fileName: string | null;
  readonly sizeBytes: number | null;
  readonly durationSec: number | null;
  /** Stikerdagi emoji (`DocumentAttributeSticker.alt`). Faqat stikerda. */
  readonly stickerAlt: string | null;
  /**
   * Faylni talab bo'lgandagina yuklab olish — har bir xabarni
   * darhol diskka tushirish tarmoq va joyni behuda sarflaydi.
   */
  download(): Promise<Buffer>;
}

export interface IncomingMessage {
  readonly telegramAccountId: string;
  readonly telegramUserId: string;
  readonly accessHash: string | null;
  readonly username: string | null;
  readonly fullName: string;
  readonly phone: string | null;
  readonly telegramMsgId: number;
  /** Matn yoki media izohi (caption). Media bo'lsa bo'sh bo'lishi mumkin. */
  readonly text: string;
  readonly media: IncomingMedia | null;
  readonly receivedAt: Date;
  /**
   * Telegram jo'natuvchini rasmiy (`verified`) yoki yordam xizmati
   * (`support`) deb belgilagan. Bunday hisob bazada bo'lmasa, noma'lum
   * mijoz OCHILMAYDI — u qarzdor emas va agent unga yozmasligi kerak.
   * Ixtiyoriy: eski chaqiruvchilar va testlar uni bermaydi.
   */
  readonly xizmatHisobi?: boolean;
}

export interface LoginStartResult {
  readonly phoneCodeHash: string;
  readonly status: 'code_sent';
}

export type LoginConfirmResult =
  | { readonly status: 'connected'; readonly tgUserId: string; readonly username: string | null }
  | { readonly status: 'password_required' };

export interface QrLoginStartResult {
  readonly status: 'qr_ready';
  /** `tg://login?token=...` — telefondagi Telegram skanerlaydi. */
  readonly url: string;
  /** Shu QR'ning muddati. Keyingilari `telegram.qr` hodisasi bilan keladi. */
  readonly expiresAt: Date;
}

export interface SpamCheckResult {
  readonly status: 'clean' | 'limited' | 'banned' | 'check_failed';
  /** @SpamBot javobining o'zi — dashboardda ko'rsatiladi. */
  readonly message: string | null;
  /** Cheklov qachongacha (bot sanani aytsa). */
  readonly until: Date | null;
}

/**
 * Akkauntni jonli tekshirish natijasi.
 *
 * NIMANI OCHA OLMAYDI: Telegram FLOOD_WAIT ni METOD bo'yicha beradi.
 * `messages.sendMessage` uchun cheklov turgan bo'lsa ham, bu yerdagi
 * zararsiz so'rov bemalol javob beradi. PEER_FLOOD ni esa umuman probe
 * qilib bo'lmaydi — u faqat notanish odamga yozganda chiqadi.
 * Shu ikkalasi haqidagi ma'lumot @SpamBot javobidan va oldingi haqiqiy
 * urinishlarda yozib qolingan holatdan olinadi.
 */
export type AccountProbe =
  | { readonly ok: true; readonly tgUserId: string; readonly username: string | null }
  | {
      readonly ok: false;
      readonly reason: 'flood_wait' | 'session_dead' | 'banned' | 'not_connected' | 'error';
      /** FLOOD_WAIT bo'lsa Telegram so'ragan soniya, aks holda `null`. */
      readonly seconds: number | null;
      readonly message: string;
    };

/** Telegramdagi suhbat turi. */
export type TelegramPeerKind = 'user' | 'group' | 'channel';

/** Akkauntning Telegramdagi suhbati (bizning bazamizdan emas — Telegramning o'zidan). */
export interface TelegramDialog {
  readonly peerId: string;
  readonly accessHash: string | null;
  readonly kind: TelegramPeerKind;
  readonly title: string;
  readonly username: string | null;
  readonly phone: string | null;
  readonly isBot: boolean;
  readonly unreadCount: number;
  readonly lastMessage: {
    readonly id: number;
    readonly text: string;
    /** `true` — biz yozganmiz, `false` — bizga yozishgan. */
    readonly out: boolean;
    readonly date: Date;
  } | null;
}

/** Suhbat tarixidagi bitta xabar. */
export interface TelegramHistoryMessage {
  readonly id: number;
  readonly text: string;
  readonly out: boolean;
  readonly date: Date;
  readonly senderName: string | null;
  /** Matndan tashqari nima borligi ("rasm", "ovoz"…) yoki null. */
  readonly mediaLabel: string | null;
}

/** Suhbatni ochish uchun kerakli minimal ma'lumot. */
export interface TelegramPeerRef {
  readonly peerId: string;
  readonly accessHash: string | null;
  readonly kind: TelegramPeerKind;
}

/**
 * Jonli kuzatuv uchun xom xabar hodisasi.
 *
 * `onIncomingMessage` dan farqi: bu FILTRLANMAYDI — bizning yuborgan
 * xabarimiz ham, bot va guruh xabarlari ham keladi. Agent mantiqi uchun emas,
 * faqat operator ekranida jonli ko'rsatish uchun.
 */
export interface RawTelegramMessage {
  readonly telegramAccountId: string;
  readonly peerId: string;
  readonly kind: TelegramPeerKind;
  readonly messageId: number;
  readonly text: string;
  readonly out: boolean;
  readonly date: Date;
  readonly senderName: string | null;
  readonly mediaLabel: string | null;
}

/**
 * Mijoz bizning xabarlarimizni o'qigani (`UpdateReadHistoryOutbox`).
 *
 * Telegram har bir xabar uchun alohida emas, "shu id gacha hammasi
 * o'qildi" deb xabar beradi — shuning uchun `maxMessageId` va undan
 * kichik id'li chiquvchi xabarlarning HAMMASI o'qilgan hisoblanadi.
 */
export interface MessagesReadEvent {
  readonly telegramAccountId: string;
  readonly peerId: string;
  readonly maxMessageId: number;
  readonly readAt: Date;
}

/**
 * Operatsiya turi — akkaunt navbatidagi tanaffus uzunligi shunga bog'liq.
 * Xabar yuborish spam filtri uchun eng "qimmat" harakat, qidiruv va tarix
 * o'qish ancha xavfsiz.
 */
export type GateKind = 'message' | 'other';

/**
 * Navbatdagi o'rin: mijozning javobi ommaviy qidiruv ortida turmasligi kerak.
 */
export type GatePriority = 'reply' | 'manual' | 'background';

export interface GateOptions {
  readonly kind: GateKind;
  readonly priority?: GatePriority;
  /** Jurnal uchun: qaysi operatsiya cho'zilgani ko'rinsin. */
  readonly label: string;
}

export interface ITelegramGateway {
  /** Saqlangan sessiyalar bilan barcha faol akkauntlarni ko'taradi. */
  bootstrap(): Promise<void>;

  /**
   * Bir necha chaqiruvni bitta bo'lak sifatida bajaradi — orasiga boshqa
   * operatsiya tushmaydi.
   *
   * Xabar yuborish aslida uchta chaqiruv: o'qildi → yozmoqda → yubordi.
   * Ular ajralib qolsa, tashqaridan bot ishlagandek ko'rinadi.
   */
  runExclusive<T>(accountId: string, options: GateOptions, fn: () => Promise<T>): Promise<T>;

  /**
   * Akkauntni uzib, bazadagi joriy sozlamalar bilan qayta ulaydi.
   * Proksi o'zgarganda kerak — sessiya saqlanadi, qayta login shart emas.
   */
  reconnect(accountId: string): Promise<void>;

  startLogin(accountId: string): Promise<LoginStartResult>;
  confirmCode(accountId: string, phoneCodeHash: string, code: string): Promise<LoginConfirmResult>;
  confirmPassword(accountId: string, password: string): Promise<LoginConfirmResult>;
  logout(accountId: string): Promise<void>;
  /**
   * QR orqali kirishni boshlaydi. Birinchi QR'ni qaytaradi; keyingi
   * yangilanishlar va yakun `telegram.qr` / `telegram.status` hodisalari
   * bilan keladi. 2FA bo'lsa holat `awaiting_password` — `confirmPassword`.
   */
  startQrLogin(accountId: string): Promise<QrLoginStartResult>;
  /**
   * QR tsiklini to'xtatadi. Tsikl bo'lmasa hech narsa qilmaydi.
   * Tsikl to'xtatilgan bo'lsa `true` (holat `logged_out` ga qaytadi).
   */
  cancelQrLogin(accountId: string): Promise<boolean>;

  /** Telefon raqami bo'yicha Telegram foydalanuvchisini topish (contacts.importContacts). */
  lookupByPhone(accountId: string, phoneE164: string): Promise<PhoneLookupResult>;

  /**
   * Username bo'yicha topish (@nomi).
   *
   * Mijozning shartnomadagi raqami bilan Telegramda o'tirmasligi mumkin —
   * boshqa raqamda. Bunday holatda xodim username'ni qo'lda kiritadi.
   */
  lookupByUsername(accountId: string, username: string): Promise<PhoneLookupResult>;

  /**
   * Mijozni akkauntning kontaktlariga qo'shadi (yoki nomini yangilaydi).
   *
   * Ikkinchi darajali amal: chaqiruvchi xatoni yutib yuborishi kutiladi —
   * kontakt saqlanmagani xabar yuborilganini bekor qilmaydi.
   */
  saveContact(
    accountId: string,
    peer: ResolvedPeer,
    firstName: string,
    lastName: string,
  ): Promise<void>;

  sendMessage(accountId: string, peer: ResolvedPeer, text: string): Promise<SentMessage>;
  sendMedia(accountId: string, peer: ResolvedPeer, file: OutgoingFile): Promise<SentMessage>;

  /**
   * Yuborilgan xabar matnini o'zgartiradi.
   *
   * Telegram cheklovi: chiquvchi xabarni faqat 48 soat ichida tahrirlash
   * mumkin. Muddat o'tgan bo'lsa `MESSAGE_EDIT_TIME_EXPIRED` keladi.
   * Matn aynan bir xil bo'lsa `MESSAGE_NOT_MODIFIED` keladi — chaqiruvchi
   * uni muvaffaqiyat deb hisoblaydi.
   */
  editMessage(accountId: string, peer: ResolvedPeer, telegramMsgId: number, text: string): Promise<void>;

  /**
   * Xabarni IKKALA tomondan ham o'chiradi (`revoke: true`).
   *
   * Shaxsiy chatda muddat chegarasi yo'q. Faqat o'zimizdan o'chirish
   * kerak emas: mijoz xato xabarni ko'rmasligi butun ishning maqsadi.
   */
  deleteMessage(accountId: string, peer: ResolvedPeer, telegramMsgId: number): Promise<void>;

  sendTyping(accountId: string, peer: ResolvedPeer): Promise<void>;
  markRead(accountId: string, peer: ResolvedPeer): Promise<void>;

  /** Kiruvchi xabarlarga obuna. Qaytgan funksiya obunani bekor qiladi. */
  onIncomingMessage(handler: (msg: IncomingMessage) => Promise<void>): () => void;

  /** Mijoz xabarlarimizni o'qiganiga obuna. */
  onMessagesRead(handler: (event: MessagesReadEvent) => Promise<void>): () => void;

  /** Akkauntning Telegramdagi suhbatlari ro'yxati (eng so'nggi faoliyat bo'yicha). */
  listDialogs(accountId: string, options?: { limit?: number }): Promise<TelegramDialog[]>;

  /**
   * Uzilish paytida o'tkazib yuborilgan KIRUVCHI xabarlarni tortadi.
   *
   * `getHistory` dan farqi tub: u ko'rish uchun mo'ljallangan va media
   * yuklab olish imkonini bermaydi. Bu yerda esa to'liq `IncomingMessage`
   * quriladi — chek rasmi ham birga keladi, ya'ni xabarni jonli oqimdagi
   * bilan bir xil yo'ldan o'tkazish mumkin.
   *
   * Eng eskisidan yangisiga qaytariladi: suhbat tartibi buzilmasin.
   */
  fetchMissed(
    accountId: string,
    options: { since: Date; dialogLimit?: number; perDialog?: number },
  ): Promise<IncomingMessage[]>;

  /** Bitta suhbat tarixi. `offsetId` — shu id'dan eskiroqlarini olish. */
  getHistory(
    accountId: string,
    peer: TelegramPeerRef,
    options?: { limit?: number; offsetId?: number },
  ): Promise<TelegramHistoryMessage[]>;

  /** Jonli kuzatuv: filtrlanmagan xabar oqimi (kiruvchi ham, chiquvchi ham). */
  onRawMessage(handler: (msg: RawTelegramMessage) => void): () => void;

  /** @SpamBot dan akkaunt cheklanganini so'raydi. */
  checkSpamStatus(accountId: string): Promise<SpamCheckResult>;

  /** Akkaunt nomidan zararsiz so'rov yuborib, sessiya holatini tekshiradi. */
  probeAccount(accountId: string): Promise<AccountProbe>;

  isConnected(accountId: string): boolean;
  shutdown(): Promise<void>;
}
