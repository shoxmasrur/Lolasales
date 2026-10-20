import type { Client } from '@/domain/entities/Client';
import type { Conversation } from '@/domain/entities/Conversation';
import type { Message } from '@/domain/entities/Message';
import type { PaymentCheck } from '@/domain/entities/PaymentCheck';
import type { Campaign, CampaignTarget } from '@/domain/entities/Campaign';
import type { TelegramAccount } from '@/domain/entities/TelegramAccount';
import { DEFAULT_LOOKUP_LIMIT } from '@/domain/entities/TelegramAccount';
import type { User } from '@/domain/entities/User';
import type { Role } from '@/domain/entities/Role';
import { isPermission } from '@/domain/entities/Permission';
import type { ImportBatch } from '@/domain/entities/ImportBatch';
import type { Course, CourseKnowledge } from '@/domain/entities/Course';
import type { Purchase } from '@/domain/entities/Purchase';
import type { LlmModel } from '@/domain/entities/LlmModel';
import { uslubVersiyasi } from '@/domain/entities/UslubVersiyasi';
import { decrypt } from '@/shared/crypto';

export const toDate = (v: unknown): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

const req = (v: unknown): Date => toDate(v) ?? new Date(0);
const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export function mapClient(r: Row): Client {
  return {
    id: r.id,
    fullName: r.full_name,
    firstName: r.first_name ?? null,
    phone: r.phone ?? null,
    extraPhones: r.extra_phones ?? [],
    telegramUserId: r.telegram_user_id ?? null,
    telegramUsername: r.telegram_username ?? null,
    telegramName: r.telegram_name ?? null,
    telegramAccessHash: r.telegram_access_hash ?? null,
    telegramHashAccountId: r.telegram_hash_account_id ?? null,
    telegramStatus: r.telegram_status,
    telegramCheckedAt: toDate(r.telegram_checked_at),
    telegramAccountId: r.telegram_account_id ?? null,
    accountAssignedAt: toDate(r.account_assigned_at),
    doNotContact: Boolean(r.do_not_contact),
    notes: r.notes ?? null,
    createdAt: req(r.created_at),
    updatedAt: req(r.updated_at),
    deletedAt: toDate(r.deleted_at),
    deletedBy: r.deleted_by ?? null,
    source: r.source ?? 'qolda',
    sourceGroup: r.source_group ?? null,
    sourceComment: r.source_comment ?? null,
  };
}

export function mapConversation(r: Row): Conversation {
  return {
    id: r.id,
    clientId: r.client_id,
    telegramAccountId: r.telegram_account_id ?? null,
    peerId: r.peer_id ?? null,
    peerAccessHash: r.peer_access_hash ?? null,
    state: r.state,
    agentEnabled: Boolean(r.agent_enabled),
    needsHuman: Boolean(r.needs_human),
    humanReason: r.human_reason ?? null,
    humanKind: r.human_kind ?? null,
    agentSessionId: r.agent_session_id ?? null,
    lastMessageAt: toDate(r.last_message_at),
    lastInboundAt: toDate(r.last_inbound_at),
    lastOutboundAt: toDate(r.last_outbound_at),
    unreadCount: num(r.unread_count),
    summary: r.summary ?? null,
    createdAt: req(r.created_at),
    updatedAt: req(r.updated_at),
  };
}

export function mapMessage(r: Row): Message {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    direction: r.direction,
    author: r.author,
    authorUserId: r.author_user_id ?? null,
    body: r.body,
    telegramMsgId: r.telegram_msg_id === null || r.telegram_msg_id === undefined ? null : Number(r.telegram_msg_id),
    status: r.status,
    error: r.error ?? null,
    meta: r.meta ?? {},
    media: r.media_kind
      ? {
          kind: r.media_kind,
          path: r.media_path ?? null,
          mimeType: r.media_mime ?? null,
          sizeBytes: r.media_size_bytes === null || r.media_size_bytes === undefined ? null : Number(r.media_size_bytes),
          durationSec: numOrNull(r.media_duration_sec),
          fileName: r.media_file_name ?? null,
        }
      : null,
    transcript: r.transcript ?? null,
    transcriptStatus: r.transcript_status ?? 'none',
    xonzoda: r.transcript_xonzoda_status
      ? {
          status: r.transcript_xonzoda_status,
          text: r.transcript_xonzoda ?? null,
          error: r.transcript_xonzoda_error ?? null,
          ms: numOrNull(r.transcript_xonzoda_ms),
        }
      : null,
    createdAt: req(r.created_at),
    sentAt: toDate(r.sent_at),
    readAt: toDate(r.read_at),
    editedAt: toDate(r.edited_at),
    originalBody: r.original_body ?? null,
    revokedAt: toDate(r.revoked_at),
    imageKind: r.image_kind ?? null,
    imageStatus: r.image_status ?? 'none',
    imageNote: r.image_note ?? null,
  };
}

export function mapCampaign(r: Row): Campaign {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    filters: r.filters ?? {},
    status: r.status,
    dailyLimit: num(r.daily_limit),
    windowStart: String(r.window_start).slice(0, 5),
    windowEnd: String(r.window_end).slice(0, 5),
    createdBy: r.created_by ?? null,
    createdAt: req(r.created_at),
    updatedAt: req(r.updated_at),
    startedAt: toDate(r.started_at),
    completedAt: toDate(r.completed_at),
  };
}

export function mapCampaignTarget(r: Row): CampaignTarget {
  return {
    id: r.id,
    campaignId: r.campaign_id,
    clientId: r.client_id,
    conversationId: r.conversation_id ?? null,
    state: r.state,
    skipReason: r.skip_reason ?? null,
    attempts: num(r.attempts),
    lastError: r.last_error ?? null,
    scheduledAt: toDate(r.scheduled_at),
    sentAt: toDate(r.sent_at),
    createdAt: req(r.created_at),
  };
}

export function mapTelegramAccount(r: Row): TelegramAccount {
  return {
    id: r.id,
    label: r.label,
    personaName: r.persona_name ?? null,
    phone: r.phone,
    apiId: num(r.api_id),
    apiHash: r.api_hash_enc ? decrypt(r.api_hash_enc) : '',
    session: r.session_enc ? decrypt(r.session_enc) : null,
    status: r.status,
    statusMessage: r.status_message ?? null,
    tgUserId: r.tg_user_id ?? null,
    tgUsername: r.tg_username ?? null,
    dailyLimit: num(r.daily_limit),
    sentToday: num(r.sent_today),
    // Standart kodda va bazada ajralib ketmasligi uchun konstantadan
    // olinadi (048 migratsiyasidagi ustun standarti ham AYNAN shu son).
    lookupLimit: num(r.lookup_limit ?? DEFAULT_LOOKUP_LIMIT),
    lookupsToday: num(r.lookups_today ?? 0),
    counterDate: r.counter_date ? String(r.counter_date).slice(0, 10) : null,
    floodWaitUntil: toDate(r.flood_wait_until),
    floodWaitSince: toDate(r.flood_wait_since),
    peerFloodSince: toDate(r.peer_flood_since),
    spamStatus: r.spam_status ?? 'unknown',
    spamCheckedAt: toDate(r.spam_checked_at),
    spamMessage: r.spam_message ?? null,
    spamUntil: toDate(r.spam_until),
    proxy: r.proxy_host
      ? {
          host: String(r.proxy_host),
          port: num(r.proxy_port),
          username: r.proxy_username ?? null,
          password: r.proxy_password_enc ? decrypt(r.proxy_password_enc) : null,
        }
      : null,
    isEnabled: Boolean(r.is_enabled),
    styleVersion: uslubVersiyasi(r.style_version),
    llmModelId: r.llm_model_id ?? null,
    createdAt: req(r.created_at),
    updatedAt: req(r.updated_at),
  };
}

export function mapRole(r: Row): Role {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description ?? null,
    permissions: (r.permissions ?? []).filter(isPermission),
    isSystem: Boolean(r.is_system),
    createdAt: req(r.created_at),
    updatedAt: req(r.updated_at),
  };
}

/** Foydalanuvchi qatorida rol ustunlari `r_` prefiksi bilan keladi. */
export function mapUser(r: Row): User {
  return {
    id: r.id,
    email: r.email,
    passwordHash: r.password_hash,
    fullName: r.full_name,
    roleId: r.role_id,
    role: mapRole({
      id: r.r_id,
      key: r.r_key,
      name: r.r_name,
      description: r.r_description,
      permissions: r.r_permissions,
      is_system: r.r_is_system,
      created_at: r.r_created_at,
      updated_at: r.r_updated_at,
    }),
    isActive: Boolean(r.is_active),
    failedLoginAttempts: Number(r.failed_login_attempts ?? 0),
    lockedAt: toDate(r.locked_at),
    createdAt: req(r.created_at),
    updatedAt: req(r.updated_at),
  };
}

export function mapImportBatch(r: Row): ImportBatch {
  return {
    id: r.id,
    filename: r.filename,
    kind: r.kind,
    rowsTotal: num(r.rows_total),
    rowsOk: num(r.rows_ok),
    rowsFailed: num(r.rows_failed),
    clientsCreated: num(r.clients_created),
    errors: r.errors ?? [],
    createdBy: r.created_by ?? null,
    createdAt: req(r.created_at),
    undoneAt: toDate(r.undone_at),
    undoneBy: r.undone_by ?? null,
  };
}

export function mapPaymentCheck(r: Row): PaymentCheck {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    clientId: r.client_id,
    purchaseId: r.purchase_id ?? null,
    messageId: r.message_id ?? null,
    kind: 'receipt_review',
    status: r.status,
    receiptSource: r.receipt_source ?? null,
    // `DATE` ustuni drayverdan `Date` bo'lib keladi — promptga va
    // so'rovlarga YYYY-MM-DD kerak.
    sinceIso: typeof r.since_date === 'string' ? r.since_date : toIsoDay(r.since_date),
    acknowledgedAt: toDate(r.acknowledged_at),
    confirmedBy: r.confirmed_by ?? null,
    confirmedAt: toDate(r.confirmed_at),
    confirmedAmount: r.confirmed_amount === null || r.confirmed_amount === undefined ? null : num(r.confirmed_amount),
    rejectedReason: r.rejected_reason ?? null,
    prevStage: r.prev_stage ?? null,
    createdAt: req(r.created_at),
  };
}

/** `Date` → "YYYY-MM-DD" (mahalliy emas, UTC — DATE ustuni vaqtsiz). */
function toIsoDay(value: unknown): string {
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export function mapLlmModel(r: Row): LlmModel {
  return {
    id: r.id,
    provider: r.provider,
    model: r.model,
    label: r.label,
    // NUMERIC matn bo'lib keladi — `num()` ni ishlatib bo'lmaydi, chunki
    // NULL ni 0 ga aylantirib, «narx kiritilmagan» ma'nosini yo'qotardi;
    // `numOrNull()` aynan shu holatni qoplaydi.
    inputPricePerMtok: numOrNull(r.input_price_per_mtok),
    outputPricePerMtok: numOrNull(r.output_price_per_mtok),
    isEnabled: Boolean(r.is_enabled),
  };
}

export function mapCourse(r: Row): Course {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    salesStart: String(r.sales_start),
    salesEnd: String(r.sales_end),
    price: num(r.price),
    duration: r.duration ?? null,
    topics: r.topics ?? [],
    startsOn: r.starts_on ? String(r.starts_on) : null,
    groupLink: r.group_link ?? null,
    isActive: Boolean(r.is_active),
    installmentAllowed: Boolean(r.installment_allowed),
    installmentParts: numOrNull(r.installment_parts),
    installmentFirstMin: numOrNull(r.installment_first_min),
    linkAfter: r.link_after,
  };
}

export function mapCourseKnowledge(r: Row): CourseKnowledge {
  return {
    id: r.id,
    courseId: r.course_id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    sortOrder: num(r.sort_order),
    isEnabled: Boolean(r.is_enabled),
  };
}

export function mapPurchase(r: Row): Purchase {
  return {
    id: r.id,
    clientId: r.client_id,
    courseId: r.course_id ?? null,
    stage: r.stage,
    stageChangedAt: req(r.stage_changed_at),
    totalAmount: numOrNull(r.total_amount),
    paidAmount: num(r.paid_amount),
    installment: Boolean(r.installment),
    linkSentAt: toDate(r.link_sent_at),
    remindedStages: r.reminded_stages ?? [],
    createdAt: req(r.created_at),
  };
}
