import type { ClientSource } from '@/domain/entities/Client';
import type { XaridBosqichi } from '@/domain/entities/Purchase';

export type CampaignStatus = 'draft' | 'running' | 'paused' | 'completed' | 'cancelled';
export type CampaignTargetState =
  | 'pending'
  | 'resolving'
  | 'ready'
  | 'sending'
  | 'sent'
  | 'skipped'
  | 'failed';

/** Kampaniyaga mijoz tanlash filtri (mijozlar va ularning joriy xaridi bo'yicha). */
export interface CampaignFilters {
  /** Mijozning joriy xaridi shu bosqichlardan birida ("yoki"). Bo'sh — filtr yo'q. */
  stage?: XaridBosqichi[];
  /** Mijoz manbasi shulardan biri ("yoki"). Bo'sh — filtr yo'q. */
  source?: ClientSource[];
  /** Mijozning joriy xaridi shu kursga tegishli. */
  courseId?: string;
  /** Faqat hali birorta ham suhbati yo'q mijozlar. */
  onlyWithoutConversation?: boolean;
  limit?: number;
}

export interface Campaign {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly filters: CampaignFilters;
  readonly status: CampaignStatus;
  readonly dailyLimit: number;
  readonly windowStart: string; // HH:mm
  readonly windowEnd: string; // HH:mm
  readonly createdBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly startedAt: Date | null;
  readonly completedAt: Date | null;
}

export interface CampaignTarget {
  readonly id: string;
  readonly campaignId: string;
  readonly clientId: string;
  readonly contractId: string | null;
  readonly conversationId: string | null;
  readonly state: CampaignTargetState;
  readonly skipReason: string | null;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly scheduledAt: Date | null;
  readonly sentAt: Date | null;
  readonly createdAt: Date;
}

export interface CampaignStats {
  readonly total: number;
  readonly pending: number;
  readonly sent: number;
  readonly skipped: number;
  readonly failed: number;
}
