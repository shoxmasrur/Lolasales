export type TelegramLookupStatus =
  | 'unknown' | 'searching' | 'found' | 'not_found' | 'privacy_restricted' | 'name_mismatch' | 'blocked'
  /** Mijozning Telegram akkaunti o'chirilgan. */
  | 'deactivated';

/** "Aloqa" filtri kalitlari — server tomondagi `ALOQA_KALITLARI` bilan mos. */
export type AloqaHolati = 'javobsiz' | 'oqilmagan';

export type ConversationState =
  | 'new' | 'contacted' | 'negotiating' | 'promised' | 'agreed'
  | 'refused' | 'unreachable' | 'escalated' | 'closed';

export type EscalationStage = 'soft' | 'hard' | 'legal';

export type Permission =
  | 'dashboard.view'
  | 'conversations.view' | 'conversations.send' | 'conversations.manage' | 'conversations.agent_toggle'
  | 'conversations.reset'
  | 'conversations.edit_message' | 'conversations.delete_message'
  | 'clients.view' | 'clients.create' | 'clients.edit' | 'clients.telegram_lookup'
  | 'clients.start_conversation'
  | 'clients.delete'
  | 'clients.export'
  | 'contracts.sync'
  | 'courses.view' | 'courses.edit'
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

export type ClientType = 'qochoq' | 'tajovuzkor' | 'qiynalayotgan' | 'yaxshi_niyatli';

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
  /** Biriktirilgan obyektlar — bo'sh bo'lsa cheklovsiz; admin uchun e'tiborsiz. */
  objects: string[];
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
  externalId: string | null;
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
  /** Bazada yo'q, Telegramdan yozgan begona — shartnomasi hali topilmagan. */
  nomalum: boolean;
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

export interface ClientWithDebt extends Client {
  /** Joriy xarid: faol, bo'lmasa oxirgisi. */
  purchase?: Purchase | null;
  /** Oyma-oy to'lovdagi kechikish (Долг мес.) — agent mijozga shuni aytadi. */
  debtMonthly: number;
  /** Umumiy kechikkan to'lov (Долг общ) — faqat xodim ko'radi. */
  debtTotal: number;
  daysOverdue: number;
  contractsCount: number;
  /** Shartnomalarining CRM holatlari (kalit bo'yicha, takrorsiz). */
  contractStatuses: string[];
  accountName: string | null;
}

export interface Contract {
  id: string;
  clientId: string;
  contractNo: string;
  objectName: string | null;
  status: string | null;
  category: string | null;
  totalPrice: number | null;
  monthlyPayment: number | null;
  paidTotal: number | null;
  contractDate: string | null;
  months: number | null;
  nextPaymentDate: string | null;
  /**
   * Xonadonni bitish muddati, `YYYY-MM-DD`. Operator TO'LIQ sanani ko'radi
   * (agent faqat chorakni) — o'tib ketgan sana ham shu yerda ko'rinishi kerak.
   */
  completionDate: string | null;
  daysOverdue: number;
  debtMonthly: number;
  debtTotal: number;
  /** Hisoblagichlar uchun to'lovdagi kechikish — `debtTotal` ga kirmaydi. */
  debtMeter: number;
  warningCount: number;
  /** Shartnomalar bazasidan oxirgi muvaffaqiyatli yangilanish. */
  syncedAt: string | null;
  /** Oxirgi yangilash xatosi (`not_found` va h.k.). */
  syncError: string | null;
}

export interface Conversation {
  id: string;
  clientId: string;
  telegramAccountId: string | null;
  state: ConversationState;
  stage: EscalationStage;
  agentEnabled: boolean;
  needsHuman: boolean;
  humanReason: string | null;
  /**
   * `'agent_error'` — agent texnik xato tufayli to'xtagan, qayta urinish
   * mumkin. `'broken_promise'` — va'da bajarilmagan; suhbat operator
   * ro'yxatida turadi, lekin agent unga sukutdan keyin baribir yozadi.
   * `'chek_tekshiruvi'` — mijozning cheki "To'lov qabul qilindi" tugmasini
   * kutyapti.
   */
  humanKind: 'agent_error' | 'broken_promise' | 'chek_tekshiruvi' | 'crm_xato' | null;
  lastMessageAt: string | null;
  unreadCount: number;
  summary: string | null;
}

export interface ConversationListItem {
  conversation: Conversation;
  clientName: string;
  clientPhone: string | null;
  debtMonthly: number;
  debtTotal: number;
  daysOverdue: number;
  lastMessageBody: string | null;
  lastMessageDirection: 'in' | 'out' | null;
  nomalum: boolean;
}

/** Mijozlar ro'yxatidagi shartnoma holati filtri uchun variant. */
export interface ContractStatusOption {
  key: string;
  label: string;
  clients: number;
}

/** Suhbatlar ro'yxati filtrlari uchun variantlar — faqat uchraydiganlari. */
export interface ConversationFilterOptions {
  objects: string[];
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

export interface PaymentPromise {
  id: string;
  clientId: string;
  amount: number;
  promisedDate: string;
  quote: string | null;
  status: 'pending' | 'kept' | 'broken' | 'cancelled';
  createdAt: string;
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

export interface DashboardStats {
  clientsTotal: number;
  clientsWithPhone: number;
  clientsOnTelegram: number;
  contractsTotal: number;
  debtMonthly: number;
  debtTotal: number;
  debtCollectedPromised: number;
  /** Shu oyda undirilgan summa — gaplashilgan mijozdan, birinchi xabardan keyin. */
  collectedThisMonth: number;
  collectedClientsThisMonth: number;
  conversationsTotal: number;
  conversationsNeedingHuman: number;
  messagesSentToday: number;
  messagesReceivedToday: number;
  promisesPending: number;
  promisesKept: number;
  promisesBroken: number;
  byState: Array<{ state: string; count: number }>;
  byStage: Array<{ stage: string; count: number }>;
  /** Kunlik dinamika — ODAM soni, xabar soni emas. */
  dailyActivity: Array<{ day: string; writtenTo: number; replied: number }>;
}

/** Davr bo'yicha statistika — bosh sahifadagi sana filtri. */
export interface PeriodStats {
  from: string;
  to: string;
  collectedByUs: { amount: number; clients: number };
  collectedWithoutUs: { amount: number; clients: number };
  daily: Array<{ day: string; byUs: number; withoutUs: number }>;
  /** HOZIRGI kechikkan to'lov — davrga bog'liq emas (tarix saqlanmagan). */
  debtNow: { total: number; monthly: number };
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
  | 'not_sold'
  | 'no_debt'
  /** Kechikish bor, lekin minimal chegaradan katta emas. */
  | 'below_min_debt'
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
  /** Noma'lum mijozlar so'ralganda aytiladigan sotuv bo'limi raqami. */
  sotuvRaqami: string;
  /** Noma'lum yozuvchilarga agent o'zi javob bersinmi. */
  nomalumAgent: boolean;
  promiseReminder: boolean;
  promiseReminderUntil: string;
  /** "Pul tushdi" xabari shu vaqtgacha yuboriladi (HH:mm). */
  promiseThanksUntil: string;
  silenceNudge: boolean;
  silenceNudgeDays: number;
  silenceNudgeMax: number;
  /**
   * Bitta akkauntning ikki Telegram operatsiyasi orasidagi tasodifiy tanaffus.
   * Kampaniya pauzasidan farqli: u ikki MIJOZ orasidagi oraliq, bu esa
   * akkauntning har qanday ikki so'rovi orasidagi eng kichik bo'shliq.
   */
  gateMessageMinSec: number;
  gateMessageMaxSec: number;
  gateOtherMinSec: number;
  gateOtherMaxSec: number;
  /**
   * Minimal qarzdorlik chegarasi (so'm). Kechikkan to'lovi shu summadan
   * katta bo'lmagan mijozga yozilmaydi. 0 — chegara yo'q.
   */
  minDebt: number;
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

export interface Bayram {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  yillik: boolean;
}

export interface ImportBatch {
  id: string;
  filename: string;
  kind: 'debtors' | 'phones';
  rowsTotal: number;
  rowsOk: number;
  rowsFailed: number;
  clientsCreated: number;
  contractsCreated: number;
  contractsUpdated: number;
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

// ─── Mijozni qo'lda qo'shish ─────────────────────────────────────────────

export interface ContractPreview {
  contractNo: string;
  clientName: string;
  phones: string[];
  objectName: string | null;
  /** Kechikkan to'lov. */
  overdueTotal: number;
  daysOverdue: number;
}

/**
 * Xato holatlari (`not_found`, `disabled`, `error`) serverdan HTTP xatosi
 * bo'lib keladi va bu tipga tushmaydi — shuning uchun `outcome` faqat 'ok'.
 */
export interface AddClientPreview {
  outcome: 'ok';
  existingClient: { id: string; fullName: string } | null;
  matchedByPhone: { id: string; fullName: string } | null;
  contract: ContractPreview;
}

export interface AddClientResult {
  outcome: 'created' | 'attached' | 'already_exists';
  clientId: string;
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
  shartnoma: string | null;
  akkaunt: string | null;
  mijoz: string | null;
  payload: Record<string, unknown>;
}

export type NomalumHolat = 'kutilmoqda' | 'hujjat_kutilmoqda' | 'tasdiq_kutilmoqda' | 'operatorda' | 'mijoz_emas' | 'boglandi';

/** Noma'lum Telegram yozuvchining bog'lash holati (`GET /conversations/:id`). */
export interface NomalumSuhbat {
  conversationId: string;
  holat: NomalumHolat;
  agentJavoblari: number;
  urinishlar: number;
  topilmagan: number;
  shartnomaRaqami: string | null;
  topilganClientId: string | null;
  telegramTelefon: string | null;
  sabab: string | null;
  createdAt: string;
  updatedAt: string;
}
