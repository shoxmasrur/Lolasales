import { api } from '@/lib/api';

/**
 * Qayta aloqa ro'yxati — API turlari va so'rovlari.
 *
 * Kelishuv: docs/superpowers/specs/2026-09-16-qayta-aloqa-royxati-design.md, 3-bo'lim.
 * Hammasi `/api/recontact` ostida.
 */

export type RecontactKind = 'vada_buzilgan' | 'sana_yoq' | 'javobsiz' | 'oqilmagan';

export interface RecontactItem {
  conversationId: string;
  clientId: string;
  clientName: string;
  kind: RecontactKind;
  /** CRM, so'm. */
  overdue: number;
  silentWorkDays: number;
  /** ISO. */
  lastMessageAt: string;
  lastMessageDirection: 'in' | 'out';
  /** <= 120 belgi. */
  lastMessagePreview: string;
  lastPromise: { date: string; amount: number; status: string } | null;
}

export interface RecontactTopic {
  id: string;
  title: string;
  instruction: string;
  sortOrder: number;
  isEnabled: boolean;
}

export interface RecontactJobResult {
  conversationId: string;
  clientName: string;
  outcome: 'sent' | 'skipped' | 'failed';
  reason?: string;
}

export interface RecontactJob {
  id: string;
  status: 'running' | 'done' | 'stopped';
  total: number;
  sent: number;
  skipped: number;
  failed: number;
  /** conversationId. */
  current: string | null;
  results: RecontactJobResult[];
  startedAt: string;
  finishedAt: string | null;
  /** email. */
  startedBy: string;
  /** Navbat nega to'xtadi (kill switch, operator) — tugagan bo'lsa null. */
  stopReason: string | null;
  /** Server qayta ishga tushgach (deploy) navbat necha marta davom ettirilgan. */
  resumedCount?: number;
}

/** Socket hodisasi. `lib/socket.ts` dagi `ServerEvent` ga hali qo'shilmagan. */
export interface RecontactBulkProgressEvent {
  type: 'recontact.bulk_progress';
  job: RecontactJob;
}

export function isRecontactProgress(event: unknown): event is RecontactBulkProgressEvent {
  return (
    typeof event === 'object'
    && event !== null
    && (event as { type?: unknown }).type === 'recontact.bulk_progress'
  );
}

/** Operator erkin yozadigan topshiriq chegarasi (`TOPSHIRIQ_MAX`). */
export const RECONTACT_INSTRUCTION_MAX = 1000;
export const RECONTACT_TITLE_MAX = 120;

export const RECONTACT_KIND_LABEL: Record<RecontactKind, string> = {
  vada_buzilgan: "Va'da buzilgan",
  sana_yoq: 'Sana kelishilmagan',
  javobsiz: "O'qib, javob bermagan",
  oqilmagan: "O'qilmagan",
};

export const RECONTACT_KIND_COLOR: Record<RecontactKind, string> = {
  vada_buzilgan: 'bg-red-500/15 text-red-300',
  sana_yoq: 'bg-amber-500/15 text-amber-300',
  javobsiz: 'bg-violet-500/15 text-violet-300',
  oqilmagan: 'bg-sky-500/15 text-sky-300',
};

/** Ko'rsatish tartibi — tasniflagich ustunligi bilan bir xil. */
export const RECONTACT_KINDS: RecontactKind[] = ['vada_buzilgan', 'sana_yoq', 'javobsiz', 'oqilmagan'];

export const PROMISE_STATUS_LABEL: Record<string, string> = {
  pending: 'Kutilmoqda',
  partial: 'Qisman',
  kept: 'Bajarildi',
  broken: 'Buzildi',
  cancelled: 'Bekor qilingan',
};

export type RecontactBulkBody =
  | { conversationIds: string[]; topicId: string }
  | { conversationIds: string[]; instruction: string };

export const recontactApi = {
  list: () => api.get<{ items: RecontactItem[] }>('/recontact'),
  topics: (all = false) =>
    api.get<{ items: RecontactTopic[] }>('/recontact/topics', all ? { all: 1 } : undefined),
  createTopic: (body: { title: string; instruction: string; sortOrder?: number; isEnabled?: boolean }) =>
    api.post<RecontactTopic>('/recontact/topics', body),
  updateTopic: (id: string, body: Partial<Omit<RecontactTopic, 'id'>>) =>
    api.patch<RecontactTopic>(`/recontact/topics/${id}`, body),
  deleteTopic: (id: string) => api.delete<{ ok: true }>(`/recontact/topics/${id}`),
  startBulk: (body: RecontactBulkBody) => api.post<{ job: RecontactJob }>('/recontact/bulk', body),
  bulk: () => api.get<{ job: RecontactJob | null }>('/recontact/bulk'),
  stopBulk: () => api.post<{ ok: true }>('/recontact/bulk/stop'),
};
