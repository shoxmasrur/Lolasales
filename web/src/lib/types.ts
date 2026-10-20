export type TelegramLookupStatus =
  | 'unknown' | 'searching' | 'found' | 'not_found' | 'privacy_restricted' | 'name_mismatch' | 'blocked'
  /** Mijozning Telegram akkaunti o'chirilgan. */
  | 'deactivated';

/** "Aloqa" filtri kalitlari — server tomondagi `ALOQA_KALITLARI` bilan mos. */
export type AloqaHolati = 'javobsiz' | 'oqilmagan';

/** Suhbat holati: yangi → xabar ketgan → mijoz javob bergan → yopilgan. */
export type ConversationState = 'new' | 'contacted' | 'active' | 'closed';

export type Permission =
  | 'dashboard.view'
  | 'conversations.view' | 'conversations.send' | 'conversations.manage' | 'conversations.agent_toggle'
  | 'conversations.reset'
  | 'conversations.edit_message' | 'conversations.delete_message'
  | 'clients.view' | 'clients.create' | 'clients.edit' | 'clients.telegram_lookup'
  | 'clients.start_conversation'
  | 'clients.delete'
  | 'clients.export'
  | 'courses.view' | 'courses.edit'
  | 'receipts.confirm'
  | 'comments.view' | 'comments.import'
  | 'campaigns.view' | 'campaigns.create' | 'campaigns.control'
  | 'import.view' | 'import.run' | 'import.undo'
  | 'telegram.view' | 'telegram.manage' | 'telegram.inbox'
  | 'settings.view' | 'settings.edit' | 'settings.kill_switch'
  | 'agent.view' | 'agent.edit'
  | 'users.view' | 'users.manage' | 'roles.manage'
  | 'audit.view'
  | 'logs.view';

export interface AgentRule {
  id: string;
  sectionId: string;
  body: string | null;
  situation: string | null;
  badExample: string | null;
  goodExample: string | null;
  why: string | null;
  isEnabled: boolean;
  sortOrder: number;
  updatedAt: string;
}

export interface AgentRuleSection {
  id: string;
  key: string;
  title: string;
  description: string | null;
  kind: 'bullets' | 'examples';
  sortOrder: number;
  /** Bo'lim qaysi uslubga tegishli. null — ikkala uslubga ham (umumiy). */
  styleVersion: 'v1' | 'v2' | null;
  rules: AgentRule[];
}

export interface AgentLesson {
  id: string;
  lesson: string;
  conversationId: string | null;
  evidence: string | null;
  status: 'proposed' | 'approved' | 'rejected';
  timesSeen: number;
  createdAt: string;
}

export type ClientType = 'tez_qaror' | 'oylaydigan' | 'narxga_sezgir' | 'shubhali';

export interface ClientProfile {
  clientId: string;
  clientType: ClientType | null;
  summary: string | null;
  whatWorks: string | null;
  bestContactTime: string | null;
  updatedAt: string;
}

export interface Role {
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissions: Permission[];
  isSystem: boolean;
  userCount?: number;
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  roleId: string;
  role: Role;
  isActive: boolean;
  /** Ketma-ket xato kirish urinishlari. */
  failedLoginAttempts: number;
  /** Bloklangan vaqt — bo'lsa faqat administrator ocha oladi. */
  lockedAt: string | null;
  createdAt: string;
}

export interface PermissionInfo {
  key: Permission;
  label: string;
  hint: string;
}

export interface PermissionGroup {
  section: string;
  label: string;
  items: PermissionInfo[];
}

export interface Client {
  id: string;
  fullName: string;
  phone: string | null;
  extraPhones: string[];
  telegramUserId: string | null;
  telegramUsername: string | null;
  /** Telegramda ko'rsatiladigan ism — mijoz F.I.O. si bilan solishtirish uchun. */
  telegramName: string | null;
  telegramStatus: TelegramLookupStatus;
  telegramAccountId: string | null;
  doNotContact: boolean;
  notes: string | null;
  createdAt: string;
  /** Yumshoq o'chirish belgisi — bo'lsa mijoz "O'chirilgan" tabida turadi. */
  deletedAt: string | null;
  deletedBy: string | null;
  source: ClientSource;
  sourceGroup: string | null;
  sourceComment: string | null;
}

export type ClientSource = 'reklama' | 'guruh' | 'raqam' | 'qolda';

export type XaridBosqichi =
  | 'yangi' | 'suhbatda' | 'qiziqdi' | 'karta_yuborildi'
  | 'chek_keldi' | 'qisman_toladi' | 'toladi' | 'rad_etdi';

export interface Purchase {
  id: string;
  clientId: string;
  courseId: string | null;
  stage: XaridBosqichi;
  stageChangedAt: string;
  totalAmount: number | null;
  paidAmount: number;
  installment: boolean;
  linkSentAt: string | null;
  createdAt: string;
}

export interface Course {
  id: string;
  name: string;
  description: string | null;
  /** YYYY-MM-DD, ikkalasi ham kiradi. */
  salesStart: string;
  salesEnd: string;
  price: number;
  duration: string | null;
  topics: string[];
  startsOn: string | null;
  groupLink: string | null;
  isActive: boolean;
  installmentAllowed: boolean;
  installmentParts: number | null;
  installmentFirstMin: number | null;
  linkAfter: 'birinchi_qism' | 'toliq';
}

export type KnowledgeKind = 'dastur' | 'savol_javob' | 'etiroz' | 'boshqa';

export interface CourseKnowledge {
  id: string;
  courseId: string;
  kind: KnowledgeKind;
  title: string;
  body: string;
  sortOrder: number;
  isEnabled: boolean;
}

/** Mijozlar ro'yxati qatori. */
export interface ClientListItem extends Client {
  /** Joriy xarid: faol, bo'lmasa oxirgisi. */
  purchase?: Purchase | null;
  accountName: string | null;
}

export interface Conversation {
  id: string;
  clientId: string;
  telegramAccountId: string | null;
  state: ConversationState;
  agentEnabled: boolean;
  needsHuman: boolean;
  humanReason: string | null;
  /**
   * `'agent_error'` — agent texnik xato tufayli to'xtagan, qayta urinish
   * mumkin. `'chek_tekshiruvi'` — mijozning cheki menejerning "Tasdiqlash"/"Rad etish" qarorini
   * kutyapti.
   */
  humanKind: 'agent_error' | 'chek_tekshiruvi' | null;
  lastMessageAt: string | null;
  unreadCount: number;
  summary: string | null;
}

export interface ConversationListItem {
  conversation: Conversation;
  clientName: string;
  clientPhone: string | null;
  lastMessageBody: string | null;
  lastMessageDirection: 'in' | 'out' | null;
}

/** Suhbatlar ro'yxati filtrlari uchun variantlar — faqat uchraydiganlari. */
export interface ConversationFilterOptions {
  accounts: Array<{ id: string; label: string }>;
}

export type MediaKind =
  | 'photo' | 'voice' | 'audio' | 'video' | 'video_note' | 'document' | 'sticker' | 'other';

export interface MessageMedia {
  kind: MediaKind;
  path: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  durationSec: number | null;
  fileName: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  /** `note` — operatorning agentga topshirig'i, mijozga ketmagan. */
  direction: 'in' | 'out' | 'note';
  author: 'agent' | 'human' | 'client' | 'system';
  body: string;
  status: 'draft' | 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  error: string | null;
  meta: Record<string, unknown>;
  media: MessageMedia | null;
  transcript: string | null;
  transcriptStatus: 'none' | 'pending' | 'done' | 'failed';
  /** XonzodaAI (o'zimizning STT) natijasi — faqat Aisha bilan solishtirish uchun. */
  xonzoda?: {
    status: 'done' | 'failed';
    text: string | null;
    error: string | null;
    ms: number | null;
  } | null;
  createdAt: string;
  sentAt: string | null;
  /** Mijoz Telegramda o'qigan vaqt. Faqat chiquvchi xabarlarda. */
  readAt: string | null;
  /** Oxirgi tahrir vaqti. null — tahrirlanmagan. */
  editedAt: string | null;
  /** Mijoz dastlab ko'rgan matn. */
  originalBody: string | null;
  /** Operator Telegramdan olib tashlagan vaqt. */
  revokedAt: string | null;
  /** Rasm turi: 'tolov' | 'hujjat' | 'boshqa' | 'noaniq'. null — tasniflanmagan. */
  imageKind: string | null;
  imageStatus: 'none' | 'pending' | 'done' | 'failed';
  /** Vision qaytargan tavsif — faqat operator ko'radi. */
  imageNote: string | null;
}

export type SpamStatus = 'unknown' | 'clean' | 'limited' | 'banned' | 'check_failed';

export type RestrictionKind =
  | 'flood_wait'
  | 'peer_flood'
  | 'limited'
  | 'banned'
  | 'session_dead'
  | 'not_connected';

export interface AccountRestriction {
  kind: RestrictionKind;
  /** Cheklov qachon boshlangani. null — noma'lum. */
  since: string | null;
  /** Qachon ochilishi. null — Telegram aytmagan (taxmin qilinmaydi). */
  until: string | null;
  source: 'mtproto' | 'spambot';
  message: string | null;
}

/** Akkauntni tekshirish natijasi: jonli probe + @SpamBot + bazadagi yozuv. */
export interface AccountCheckReport {
  checkedAt: string;
  probe:
    | { ok: true; username: string | null }
    | {
        ok: false;
        reason: 'flood_wait' | 'session_dead' | 'banned' | 'not_connected' | 'error';
        seconds: number | null;
        message: string;
      };
  spamStatus: SpamStatus;
  restrictions: AccountRestriction[];
  /** Shu akkauntga biriktirilgan, Telegramda topilmagan raqamlar soni. */
  notFoundLookups: number;
}

export interface BulkCheckProgress {
  running: boolean;
  done: number;
  total: number;
  currentLabel: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface TelegramAccount {
  id: string;
  label: string;
  /** Mijoz ko'radigan ism. null — umumiy sozlamadagi ism ishlatiladi. */
  personaName: string | null;
  phone: string;
  apiId: number;
  hasSession: boolean;
  status: 'logged_out' | 'awaiting_code' | 'awaiting_password' | 'awaiting_qr' | 'connected' | 'error' | 'banned';
  statusMessage: string | null;
  tgUsername: string | null;
  dailyLimit: number;
  sentToday: number;
  remainingToday: number;
  lookupLimit: number;
  lookupsToday: number;
  remainingLookupsToday: number;
  spamStatus: SpamStatus;
  spamCheckedAt: string | null;
  spamMessage: string | null;
  spamUntil: string | null;
  /** Telegram flood-wait cheklovi tugaydigan vaqt (ISO). null — hozir cheklov yo'q. */
  floodWaitUntil: string | null;
  /** Hozirgi flood-wait qachon boshlangani. null — cheklov yo'q yoki noma'lum. */
  floodWaitSince: string | null;
  /** PEER_FLOOD birinchi marta qachon ko'rilgani. null — cheklov yo'q. */
  peerFloodSince: string | null;
  /** Hozirgi faol cheklovlar. Tekshiruvsiz ham to'ldiriladi. */
  restrictions: AccountRestriction[];
  /** Akkauntning SOCKS5 proksisi. null — to'g'ridan-to'g'ri ulanadi. */
  proxy: { host: string; port: number; username: string | null; hasPassword: boolean } | null;
  isEnabled: boolean;
  connected: boolean;
  /** Agent shu akkauntda qaysi uslub versiyasida yozadi — server tomonda tanlanadi. */
  styleVersion: 'v1' | 'v2';
  /** Agent shu akkauntda qaysi OpenAI modeli bilan yozadi. null — standart (Claude). */
  llmModelId: string | null;
  /** Shu akkaunt bilan suhbati boshlangan mijozlar soni (o'chirilmaganlar). */
  conversationClients: number;
}

export type TelegramPeerKind = 'user' | 'group' | 'channel';

/** Akkauntning Telegramdagi suhbati — bizning bazamizdan emas. */
export interface TelegramDialog {
  peerId: string;
  accessHash: string | null;
  kind: TelegramPeerKind;
  title: string;
  username: string | null;
  phone: string | null;
  isBot: boolean;
  unreadCount: number;
  lastMessage: { id: number; text: string; out: boolean; date: string } | null;
}

export interface TelegramHistoryMessage {
  id: number;
  text: string;
  out: boolean;
  date: string;
  senderName: string | null;
  mediaLabel: string | null;
}

export interface AccountDistribution {
  distribution: Array<{ accountId: string; label: string; personaName: string; count: number }>;
  unassigned: number;
}

export interface CampaignStats {
  total: number;
  pending: number;
  sent: number;
  skipped: number;
  failed: number;
}

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  filters: Record<string, unknown>;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'cancelled';
  dailyLimit: number;
  windowStart: string;
  windowEnd: string;
  createdAt: string;
  stats?: CampaignStats;
}

/** Sotuv paneli raqamlari ("bugun" — Asia/Tashkent bo'yicha). */
export interface DashboardStats {
  clientsTotal: number;
  clientsOnTelegram: number;
  conversationsTotal: number;
  conversationsNeedingHuman: number;
  messagesSentToday: number;
  messagesReceivedToday: number;
  /** Menejer tasdig'ini kutayotgan cheklar. */
  receiptsPending: number;
  /** Voronka: har mijozning joriy xaridi qaysi bosqichda. */
  funnel: Array<{ stage: XaridBosqichi; count: number }>;
  /** Bugun qo'shilgan mijozlar manbalar bo'yicha. */
  newClientsToday: Array<{ source: ClientSource; count: number }>;
  /** Bugun tasdiqlangan to'lovlar. */
  paymentsToday: { count: number; amount: number };
  /** Kunlik dinamika — ODAM soni, xabar soni emas. */
  dailyActivity: Array<{ day: string; writtenTo: number; replied: number }>;
}

/** Ommaviy suhbat boshlashdan oldingi tekshiruv natijasi. */
export type BulkStartOutlook =
  | 'ready'
  | 'name_mismatch'
  | 'needs_lookup'
  | 'do_not_contact'
  | 'blocked'
  | 'deactivated'
  | 'no_phone'
  | 'already_started';

export interface BulkStartAccountPlan {
  accountId: string;
  label: string;
  personaName: string;
  count: number;
  remainingToday: number;
  overQuota: number;
}

export interface BulkStartPreview {
  total: number;
  counts: Record<BulkStartOutlook, number>;
  mismatches: Array<{
    id: string;
    fullName: string;
    telegramName: string | null;
    phone: string | null;
  }>;
  accountPlan: BulkStartAccountPlan[];
  reassigned: number;
}

export interface PaymentCard {
  id: string;
  number: string;
  holder: string;
  bank: string;
  active: boolean;
}

export interface OutreachSettings {
  dailyLimit: number;
  minDelaySec: number;
  maxDelaySec: number;
  windowStart: string;
  windowEnd: string;
  weekdays: number[];
  killSwitch: boolean;
  agentAutoReply: boolean;
  personaName: string;
  paymentCards: PaymentCard[];
  kompaniyaNomi: string;
  /** Jim qolgan mijozga bosqichiga bitta eslatma. */
  eslatmaYoqilgan: boolean;
  /** Oxirgi xabardan necha soat o'tgach (1–168). */
  eslatmaSoat: number;
  /**
   * Bitta akkauntning ikki Telegram operatsiyasi orasidagi tasodifiy tanaffus.
   * Kampaniya pauzasidan farqli: u ikki MIJOZ orasidagi oraliq, bu esa
   * akkauntning har qanday ikki so'rovi orasidagi eng kichik bo'shliq.
   */
  gateMessageMinSec: number;
  gateMessageMaxSec: number;
  gateOtherMinSec: number;
  gateOtherMaxSec: number;
  /** Kanal izohlarini saralash uchun kalit so'zlar ("+" — faqat yolg'iz plyus). */
  izohKalitSozlari: string[];
  /** Bir yig'ishda jami o'qiladigan izohlar (50–2000). */
  izohLimit: number;
}

/**
 * Agent ishlatadigan til modeli — Sozlamalar sahifasidagi "AI modellari"
 * bo'limi va akkaunt kartasidagi tanlagich shu shaklga tayanadi.
 *
 * `provider` FAQAT `'openai'` — server tomonda ham shu (`LLM_PROVIDERS`,
 * `llmRoutes.ts`). Claude jadvaldan ATAYLAB tanlanmaydi: `ClaudeAgentEngine`
 * model nomini konstruktordan olmaydi, u doim `.env` dagi `AGENT_MODEL`ni
 * ishlatadi — jadvalga Claude qatorini qo'shish operatorni "tanladim" deb
 * ishontirardi-yu, dvigatel baribir o'zgarmasdi.
 */
export interface LlmModel {
  id: string;
  provider: 'openai';
  /** Provayderdagi aniq nom — so'rovga aynan shu yuboriladi. */
  model: string;
  /** Panelda ko'rinadigan nom. */
  label: string;
  inputPricePerMtok: number | null;
  outputPricePerMtok: number | null;
  isEnabled: boolean;
}

export interface ImportBatch {
  id: string;
  filename: string;
  kind: 'leads';
  rowsTotal: number;
  rowsOk: number;
  rowsFailed: number;
  clientsCreated: number;
  errors: Array<{ row: number; reason: string; value?: string }>;
  createdAt: string;
  /** Import qaytarilgan bo'lsa — qachon va kim tomonidan. */
  undoneAt: string | null;
  undoneBy: string | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/** Tizim jurnalining bitta qatori. */
export interface AppLogItem {
  id: string;
  at: string;
  /** `info` faqat bayroqli qatorlarda bo'ladi (Telegram audit izi). */
  level: 'info' | 'warn' | 'error';
  flag: 'telegram' | null;
  scope: string | null;
  msg: string;
  akkaunt: string | null;
  mijoz: string | null;
  payload: Record<string, unknown>;
}

/** Izohlari yoqilgan kanal (Guruhlar sahifasi). */
export interface CommentChannel {
  peer: { peerId: string; accessHash: string | null; kind: 'channel' };
  title: string;
  linkedChatId: string | null;
  memberOfLinked: boolean;
}

export interface ChannelPost {
  id: number;
  date: string;
  text: string;
  repliesCount: number;
}

export interface CommentPeer {
  telegramUserId: string;
  accessHash: string | null;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
}

export type CommentAuthor =
  | { kind: 'user'; peer: CommentPeer; fullName: string }
  | { kind: 'anonim'; title: string };

export interface ChannelCommentItem {
  id: number;
  postId: number;
  date: string;
  text: string;
  author: CommentAuthor;
  /** Shaxsiy xabar yozsa bo'ladi (anonim emas, access_hash bor). */
  tanlasaBoladi: boolean;
  /** Muallif bazada allaqachon mijoz. */
  mavjudMijoz: boolean;
}

export interface CommentsFetchResult {
  items: ChannelCommentItem[];
  /** FLOOD_WAIT tufayli yig'ish erta to'xtagan bo'lsa. */
  partial: { reason: string; retryAfterSec: number | null } | null;
}
