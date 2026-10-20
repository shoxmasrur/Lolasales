import { io, type Socket } from 'socket.io-client';
import { tokenStore } from '@/lib/api';

export interface BulkLookupJob {
  id: string;
  total: number;
  done: number;
  found: number;
  needsReview: number;
  notFound: number;
  failed: number;
  status: 'running' | 'done' | 'stopped' | 'failed';
  currentName: string | null;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  /** Server qayta ishga tushgach (deploy) vazifa necha marta davom ettirilgan. */
  resumedCount?: number;
}

export interface BulkStartJob {
  id: string;
  total: number;
  done: number;
  started: number;
  skipped: number;
  failed: number;
  status: 'running' | 'done' | 'stopped' | 'failed';
  currentName: string | null;
  /** Keyingi xabar taxminan qachon ketadi. */
  nextAt: string | null;
  /** O'rtacha necha daqiqada bitta xabar ketadi. */
  paceMinutes: number | null;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  skipReasons: Record<string, number>;
  /**
   * Kim o'tkazib yuborilgani — sabab bo'yicha ochib ko'rish uchun.
   *
   * Sabab bo'yicha son yetarli emas edi: "9 tasi Сотилди emas" degan
   * qatorni ko'rgan operator qaysi shartnomalar ekanini bilolmasdi.
   */
  skippedItems: Array<{
    clientId: string;
    fullName: string;
    contractNo: string | null;
    reason: string;
  }>;
  /** Serverdagi cheklovdan oshgani uchun ro'yxatga kirmaganlari. */
  skippedItemsTruncated: number;
  /** Operator "ism mos kelmasa ham yuborilsin" deb tasdiqlaganmi. */
  allowNameMismatch: boolean;
  /**
   * Har akkauntning o'z oqimi.
   *
   * Operator akkaunt tanlamagan bo'lsa BO'SH — bunday ishda bitta ketma-ket
   * oqim bo'ladi va jadvalni ko'rsatishning ma'nosi yo'q.
   */
  accounts: Array<{
    accountId: string | null;
    label: string;
    personaName: string;
    total: number;
    done: number;
    started: number;
    skipped: number;
    failed: number;
    nextAt: string | null;
    paceMinutes: number | null;
    status: 'waiting' | 'running' | 'done' | 'stopped' | 'flood';
    error: string | null;
  }>;
  /** Server qayta ishga tushgach (deploy) vazifa necha marta davom ettirilgan. */
  resumedCount?: number;
}

export interface BulkContractSyncJob {
  id: string;
  /** Tanlangan mijozlar soni. */
  total: number;
  done: number;
  /** Muvaffaqiyatli yangilangan shartnomalar soni. */
  contracts: number;
  /** CRM'dan qo'shilgan yangi raqamlar soni. */
  newPhones: number;
  notFound: number;
  failed: number;
  /** Bizda umuman shartnomasi yo'q mijozlar. */
  noContract: number;
  status: 'running' | 'done' | 'stopped' | 'failed';
  currentName: string | null;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  missing: Array<{
    clientId: string;
    name: string;
    reason: 'not_found' | 'error' | 'no_contract';
  }>;
  /** Serverdagi cheklovdan oshgani uchun ro'yxatga kirmaganlari. */
  missingTruncated: number;
  /** Server qayta ishga tushgach (deploy) vazifa necha marta davom ettirilgan. */
  resumedCount?: number;
}

export type ServerEvent =
  | { type: 'message.created'; conversationId: string; messageId: string }
  | { type: 'message.updated'; conversationId: string; messageId: string }
  | { type: 'conversation.updated'; conversationId: string }
  /** Mijoz chiquvchi xabarlarni Telegramda o'qidi. */
  | { type: 'conversation.messages_read'; conversationId: string }
  | { type: 'conversation.created'; conversationId: string }
  | { type: 'campaign.updated'; campaignId: string }
  | { type: 'telegram.status'; accountId: string; status: string }
  | { type: 'telegram.qr'; accountId: string; url: string; expiresAt: string }
  | {
      type: 'telegram.raw_message';
      accountId: string;
      peerId: string;
      messageId: number;
      text: string;
      out: boolean;
      date: string;
      senderName: string | null;
      mediaLabel: string | null;
    }
  | { type: 'agent.thinking'; conversationId: string; on: boolean }
  | { type: 'telegram.lookup_progress'; job: BulkLookupJob }
  | { type: 'conversation.bulk_progress'; job: BulkStartJob }
  | { type: 'contracts.sync_progress'; job: BulkContractSyncJob }
  | { type: 'stats.invalidate' };

let socket: Socket | null = null;

/**
 * Yagona socket ulanishi.
 *
 * DIQQAT: mavjud socket QAYTA YARATILMAYDI, hatto hozir ulanmagan bo'lsa ham.
 *
 * Ilgari shart `socket?.connected` edi va bu jiddiy xatoga olib kelardi:
 * ulanish bir necha yuz millisekund davom etadi, shu oraliqda ikkinchi
 * komponent `getSocket()` chaqirsa, birinchi socket UZILIB yangisi
 * yaratilardi. Natijada birinchi komponentning `socket.on(...)` tinglovchisi
 * o'lik ulanishda qolib ketardi — hodisalar unga umuman kelmasdi.
 *
 * Aynan shu sabab ommaviy tekshiruv progressi jonli yangilanmay, faqat
 * sahifa qayta yuklanganda o'zgarardi. Socket.io o'zi qayta ulanadi,
 * shuning uchun bu yerda hech narsa uzish shart emas.
 */
export function getSocket(): Socket {
  if (socket) return socket;

  socket = io({
    path: '/socket.io',
    auth: { token: tokenStore.get() },
    transports: ['websocket', 'polling'],
  });

  return socket;
}

export function closeSocket(): void {
  socket?.disconnect();
  socket = null;
}
