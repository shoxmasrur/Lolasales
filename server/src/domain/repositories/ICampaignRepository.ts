import type {
  Campaign,
  CampaignFilters,
  CampaignStats,
  CampaignStatus,
  CampaignTarget,
  CampaignTargetState,
} from '@/domain/entities/Campaign';
import type { Page, Pagination } from '@/domain/repositories/types';

export interface NewCampaign {
  name: string;
  description?: string | null;
  filters: CampaignFilters;
  dailyLimit: number;
  windowStart: string;
  windowEnd: string;
  createdBy?: string | null;
}

export interface ICampaignRepository {
  create(data: NewCampaign): Promise<Campaign>;
  findById(id: string): Promise<Campaign | null>;
  list(pagination?: Pagination): Promise<Page<Campaign>>;
  findRunning(): Promise<Campaign[]>;
  setStatus(id: string, status: CampaignStatus): Promise<Campaign>;

  addTargets(campaignId: string, clientIds: string[]): Promise<number>;
  listTargets(campaignId: string, pagination?: Pagination): Promise<Page<CampaignTarget>>;
  /** Navbatdagi yuborilmagan nishonlarni bandlab olish (FOR UPDATE SKIP LOCKED). */
  claimNextTargets(campaignId: string, limit: number): Promise<CampaignTarget[]>;
  updateTarget(
    id: string,
    patch: {
      state?: CampaignTargetState;
      skipReason?: string | null;
      lastError?: string | null;
      conversationId?: string | null;
      sentAt?: Date | null;
      incrementAttempts?: boolean;
    },
  ): Promise<CampaignTarget>;
  stats(campaignId: string): Promise<CampaignStats>;
  countSentToday(campaignId: string, todayIso: string): Promise<number>;
}
