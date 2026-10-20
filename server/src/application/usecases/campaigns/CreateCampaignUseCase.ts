import type { Campaign, CampaignFilters } from '@/domain/entities/Campaign';
import type { ICampaignRepository } from '@/domain/repositories/ICampaignRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IEventBus } from '@/domain/services/support';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';

export interface CreateCampaignInput {
  name: string;
  description?: string | null;
  filters: CampaignFilters;
  dailyLimit?: number;
  windowStart?: string;
  windowEnd?: string;
  userId?: string | null;
  userEmail: string;
  /** Yaratilgandan keyin darhol ishga tushirish. */
  startNow?: boolean;
}

export interface CreateCampaignResult {
  readonly campaign: Campaign;
  readonly targetsAdded: number;
}

/** Filtrga mos debitorlardan kampaniya navbatini yig'adi. */
export class CreateCampaignUseCase {
  constructor(
    private readonly campaigns: ICampaignRepository,
    private readonly contracts: IContractRepository,
    private readonly settings: RuntimeSettings,
    private readonly audit: IAuditRepository,
    private readonly events: IEventBus,
  ) {}

  async execute(input: CreateCampaignInput): Promise<CreateCampaignResult> {
    const runtime = await this.settings.get();

    const campaign = await this.campaigns.create({
      name: input.name,
      description: input.description ?? null,
      filters: input.filters,
      dailyLimit: input.dailyLimit ?? runtime.dailyLimit,
      windowStart: input.windowStart ?? runtime.windowStart,
      windowEnd: input.windowEnd ?? runtime.windowEnd,
      createdBy: input.userId ?? null,
    });

    const targets = await this.contracts.findTargetsByFilters(input.filters);
    const targetsAdded = await this.campaigns.addTargets(
      campaign.id,
      targets.map((t) => ({ clientId: t.clientId, contractId: t.contractId })),
    );

    const finalCampaign = input.startNow && targetsAdded > 0
      ? await this.campaigns.setStatus(campaign.id, 'running')
      : campaign;

    await this.audit.record({
      actor: input.userEmail,
      action: 'campaign.created',
      entity: 'campaign',
      entityId: campaign.id,
      payload: { name: input.name, targetsAdded, filters: input.filters, started: Boolean(input.startNow) },
    });

    this.events.publish({ type: 'campaign.updated', campaignId: campaign.id });

    return { campaign: finalCampaign, targetsAdded };
  }

  /** Kampaniya yaratmasdan, filtr nechta mijozni qamrashini ko'rsatadi. */
  async preview(filters: CampaignFilters): Promise<number> {
    const targets = await this.contracts.findTargetsByFilters(filters);
    return targets.length;
  }
}
