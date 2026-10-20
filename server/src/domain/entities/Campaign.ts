export type CampaignStatus = 'draft' | 'running' | 'paused' | 'completed' | 'cancelled';
export type CampaignTargetState =
  | 'pending'
  | 'resolving'
  | 'ready'
  | 'sending'
  | 'sent'
  | 'skipped'
  | 'failed';

/** Kampaniyaga mijoz tanlash filtri (contracts jadvali bo'yicha). */
export interface CampaignFilters {
  /**
   * DIQQAT: `OutreachSettings.minDebt` (`RuntimeSettings.ts`) BILAN
   * ADASHTIRMANG — nom bir xil, ma'no teskari. Bu yerdagisi bitta
   * SHARTNOMANING `debt_monthly` ustuniga qo'yilgan PASTKI chegara
   * (nishonlarni TANLASH uchun, `PgContractRepository`), o'shanisi esa
   * MIJOZNING jami kechikishiga qo'yilgan YUQORI chegara (yozishni
   * TO'XTATISH uchun).
   */
  minDebt?: number;
  maxDebt?: number;
  minDaysOverdue?: number;
  maxDaysOverdue?: number;
  objects?: string[];
  categories?: string[];
  statuses?: string[];
  onlyWithPhone?: boolean;
  excludeContacted?: boolean;
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
