import type { Campaign } from '@/domain/entities/Campaign';
import { canSend } from '@/domain/entities/TelegramAccount';
import type { ICampaignRepository } from '@/domain/repositories/ICampaignRepository';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IClock, IEventBus } from '@/domain/services/support';
import { evaluateWindow } from '@/domain/policies/SendWindowPolicy';
import { nextDelayMs } from '@/domain/policies/PacingPolicy';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { StartConversationUseCase } from '@/application/usecases/messaging/StartConversationUseCase';
import { TelegramError } from '@/shared/errors';
import { sleep } from '@/shared/datetime';
import { config } from '@/shared/config';
import { childLogger } from '@/shared/logger';

const log = childLogger('scheduler');
const IDLE_TICK_MS = 30_000;
const MAX_ATTEMPTS = 3;

/**
 * Kampaniya navbatini sekin tempda qayta ishlaydi.
 *
 * Ban riskini kamaytiruvchi qatlamlar:
 *   1. global kill switch,
 *   2. ish vaqti oynasi (09:00–19:00, dam olish kunisiz),
 *   3. akkauntning kunlik limiti,
 *   4. xabarlar orasida tasodifiy pauza (60–180 s),
 *   5. FLOOD_WAIT/PEER_FLOOD kelganda kampaniyani avtomatik pauza qilish.
 */
export class OutreachScheduler {
  private running = false;
  private stopped = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly campaigns: ICampaignRepository,
    private readonly accounts: ITelegramAccountRepository,
    private readonly startConversation: StartConversationUseCase,
    private readonly settings: RuntimeSettings,
    private readonly audit: IAuditRepository,
    private readonly events: IEventBus,
    private readonly clock: IClock,
  ) {}

  start(): void {
    if (this.timer) return;
    this.stopped = false;
    log.info('Kampaniya rejalashtiruvchisi ishga tushdi');
    this.scheduleNext(1_000);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(ms: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      void this.tick();
    }, ms);
  }

  private async tick(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;

    let nextDelay = IDLE_TICK_MS;
    try {
      nextDelay = await this.processOnce();
    } catch (err) {
      log.error({ err }, 'Rejalashtiruvchi tsiklida xato');
    } finally {
      this.running = false;
      this.scheduleNext(nextDelay);
    }
  }

  /** Bitta nishonni qayta ishlaydi va keyingi urinishgacha kutish vaqtini qaytaradi. */
  private async processOnce(): Promise<number> {
    const runtime = await this.settings.get();
    if (runtime.killSwitch) return IDLE_TICK_MS;

    const running = await this.campaigns.findRunning();
    if (!running.length) return IDLE_TICK_MS;

    const now = this.clock.now();
    const today = this.clock.todayIso();
    for (const campaign of running) {
      const window = evaluateWindow(now, {
        start: campaign.windowStart || runtime.windowStart,
        end: campaign.windowEnd || runtime.windowEnd,
        weekdays: runtime.weekdays,
        timeZone: config.TIMEZONE,
      });

      if (!window.allowed) {
        log.debug({ campaign: campaign.name, reason: window.reason }, 'Ish vaqtidan tashqari');
        continue;
      }

      const sentToday = await this.campaigns.countSentToday(campaign.id, today);
      if (sentToday >= campaign.dailyLimit) {
        log.info({ campaign: campaign.name, sentToday }, 'Kampaniyaning kunlik limiti to\'ldi');
        continue;
      }

      const accounts = await this.accounts.listConnected();
      const usable = accounts.filter((a) => canSend(a, now, today));
      if (!usable.length) {
        log.warn({ campaign: campaign.name }, 'Kvotasi qolgan ulangan akkaunt yo\'q');
        continue;
      }

      const [target] = await this.campaigns.claimNextTargets(campaign.id, 1);
      if (!target) {
        await this.finishCampaign(campaign);
        continue;
      }

      try {
        const result = await this.startConversation.execute(target.clientId);

        if (result.status === 'started') {
          await this.campaigns.updateTarget(target.id, {
            state: 'sent',
            conversationId: result.conversation.id,
            sentAt: this.clock.now(),
            incrementAttempts: true,
          });
        } else {
          await this.campaigns.updateTarget(target.id, {
            state: 'skipped',
            skipReason: result.reason,
            conversationId: result.conversation?.id ?? null,
            incrementAttempts: true,
          });
        }

        this.events.publish({ type: 'campaign.updated', campaignId: campaign.id });
        this.events.publish({ type: 'stats.invalidate' });
      } catch (err) {
        await this.handleTargetError(campaign, target.id, target.attempts, err);
        if (err instanceof TelegramError && (err.telegramCode === 'PEER_FLOOD' || err.telegramCode === 'BANNED')) {
          // Spam filtri — kampaniyani darhol to'xtatamiz, aks holda akkaunt yo'qoladi.
          await this.campaigns.setStatus(campaign.id, 'paused');
          await this.audit.record({
            actor: 'system',
            action: 'campaign.auto_paused',
            entity: 'campaign',
            entityId: campaign.id,
            payload: { reason: err.message },
          });
          this.events.publish({ type: 'campaign.updated', campaignId: campaign.id });
          log.error({ campaign: campaign.name }, 'Kampaniya avtomatik pauza qilindi (spam filtri)');
          return IDLE_TICK_MS;
        }
        if (err instanceof TelegramError && err.telegramCode === 'FLOOD_WAIT') {
          return Math.max((err.retryAfterSec ?? 60) * 1000, IDLE_TICK_MS);
        }
      }

      // Bitta tsiklda bitta xabar — keyin tabiiy pauza.
      //
      // Oraliq kampaniyaning kunlik chegarasiga moslanadi: 600 daqiqalik
      // oyna va 30 ta limit → o'rtacha 20 daqiqa. `dailyLimit` bu yerda
      // KAMPANIYANING umumiy chegarasi, akkauntlar soniga
      // ko'paytirilmaydi (yuqoridagi `sentToday` tekshiruvi ham shunday).
      return nextDelayMs({
        windowStart: campaign.windowStart || runtime.windowStart,
        windowEnd: campaign.windowEnd || runtime.windowEnd,
        dailySends: campaign.dailyLimit,
        minDelaySec: runtime.minDelaySec,
        maxDelaySec: runtime.maxDelaySec,
      });
    }

    return IDLE_TICK_MS;
  }

  private async handleTargetError(
    campaign: Campaign,
    targetId: string,
    attempts: number,
    err: unknown,
  ): Promise<void> {
    const message = err instanceof Error ? err.message : 'Noma\'lum xato';
    const exhausted = attempts + 1 >= MAX_ATTEMPTS;

    await this.campaigns.updateTarget(targetId, {
      state: exhausted ? 'failed' : 'pending',
      lastError: message,
      incrementAttempts: true,
    });

    log.warn({ campaign: campaign.name, targetId, attempts: attempts + 1, err: message }, 'Nishon xatosi');
  }

  private async finishCampaign(campaign: Campaign): Promise<void> {
    const stats = await this.campaigns.stats(campaign.id);
    if (stats.pending > 0) return;

    await this.campaigns.setStatus(campaign.id, 'completed');
    await this.audit.record({
      actor: 'system',
      action: 'campaign.completed',
      entity: 'campaign',
      entityId: campaign.id,
      payload: { ...stats },
    });
    this.events.publish({ type: 'campaign.updated', campaignId: campaign.id });
    log.info({ campaign: campaign.name, ...stats }, 'Kampaniya yakunlandi');
  }

  /** Testlar uchun: bir tsiklni sinxron bajarish. */
  async runOnceForTesting(): Promise<void> {
    await this.processOnce();
    await sleep(0);
  }
}
