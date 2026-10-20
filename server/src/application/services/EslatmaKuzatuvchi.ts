import { canSend } from '@/domain/entities/TelegramAccount';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import { canAgentReply } from '@/domain/entities/Conversation';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IPurchaseRepository } from '@/domain/repositories/IPurchaseRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IClock } from '@/domain/services/support';
import { evaluateWindow } from '@/domain/policies/SendWindowPolicy';
import { eslatmaKerakmi } from '@/domain/services/eslatma';
import type { AgentRunner } from '@/application/services/AgentRunner';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { XaridXizmati } from '@/application/services/XaridXizmati';
import { randomBetween, sleep } from '@/shared/datetime';
import { config } from '@/shared/config';
import { AbortedError, StaleTurnError } from '@/shared/errors';
import { childLogger } from '@/shared/logger';

const log = childLogger('eslatma');

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
/** Bir tsiklda shuncha eslatma ketadi — qolgani keyingi tsiklga. */
const BATCH = 20;
/** Nomzodlar ko'proq olinadi: bir qismi qayta o'qishda tushib qoladi. */
const CANDIDATE_LIMIT = BATCH * 3;

/**
 * Jim qolgan mijozga (`qiziqdi` / `karta_yuborildi`) har bosqichga BITTA
 * yumshoq eslatma yuboradi. Himoya qatlamlari: kill switch, yuborish oynasi,
 * partiya chegarasi, nomzodlar orasidagi tasodifiy pauza, yuborishdan oldin
 * holatni qayta o'qish.
 */
export class EslatmaKuzatuvchi {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private inflight: Promise<void> | null = null;
  private stopping = false;

  constructor(
    private readonly conversations: IConversationRepository,
    private readonly agent: AgentRunner,
    private readonly xarid: XaridXizmati,
    private readonly purchases: IPurchaseRepository,
    private readonly settings: RuntimeSettings,
    private readonly audit: IAuditRepository,
    private readonly clock: IClock,
    private readonly accounts: ITelegramAccountRepository,
    /** Testlar uchun almashtiriladi. Berilmasa — `stop()` bilan uziladigan pauza. */
    private readonly pause?: (ms: number) => Promise<void>,
  ) {}

  private stopAbort = new AbortController();

  private async kut(ms: number): Promise<void> {
    if (this.pause) return this.pause(ms);
    await sleep(ms, this.stopAbort.signal).catch(() => undefined);
  }

  start(): void {
    if (this.timer) return;
    this.stopping = false;
    this.stopAbort = new AbortController();
    log.info('Eslatma kuzatuvchisi ishga tushdi');
    void this.tick();
    this.timer = setInterval(() => void this.tick(), CHECK_INTERVAL_MS);
  }

  /**
   * Ketayotgan partiyani KUTADI: eslatma bosqichi agent chaqiruvidan OLDIN
   * belgilanadi, SIGTERM shu ikki qadam orasida kesmasin. `stopping` partiyani
   * keyingi nomzodga o'tkazmaydi, ya'ni faqat boshlangan bittasi tugaydi.
   */
  async stop(): Promise<void> {
    this.stopping = true;
    this.stopAbort.abort();
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.inflight;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const partiya = this.tekshir()
      .then(() => undefined)
      .catch((err: unknown) => {
        log.error({ err }, 'Eslatma tsiklida xato');
      })
      .finally(() => {
        this.running = false;
        this.inflight = null;
      });
    this.inflight = partiya;
    await partiya;
  }

  /** @returns nechta eslatma yuborilgani */
  async tekshir(): Promise<number> {
    const runtime = await this.settings.get();
    if (!runtime.eslatmaYoqilgan || runtime.killSwitch) return 0;

    // Yakshanba uchun maxsus qoida yo'q: operatorning `weekdays` sozlamasi qo'llanadi.
    const window = {
      start: runtime.windowStart,
      end: runtime.windowEnd,
      weekdays: runtime.weekdays,
      timeZone: config.TIMEZONE,
    };
    const first = evaluateWindow(this.clock.now(), window);
    if (!first.allowed) {
      log.debug({ reason: first.reason }, 'Eslatma vaqti emas');
      return 0;
    }

    const candidates = await this.conversations.findEslatmaNomzodlari(CANDIDATE_LIMIT);
    if (!candidates.length) return 0;

    let processed = 0;
    let sent = 0;
    for (const candidate of candidates) {
      if (processed >= BATCH) break;
      if (this.stopping) break;
      if (!evaluateWindow(this.clock.now(), window).allowed) {
        log.info('Eslatma oynasi tugadi');
        break;
      }

      const tekshiruv = async (): Promise<{ stage: typeof candidate.stage } | null> => {
        const conversation = await this.conversations.findById(candidate.conversationId);
        if (!conversation || !canAgentReply(conversation)) return null;
        const purchase = await this.xarid.joriyXarid(candidate.clientId);
        if (!purchase || purchase.id !== candidate.purchaseId) return null;
        // Eslatma akkaunt kvotasiga sanaladi: sig'im yo'q bo'lsa belgilamaymiz,
        // keyingi tsiklda qayta uriniladi.
        if (!conversation.telegramAccountId) return null;
        const account = await this.accounts.findById(conversation.telegramAccountId);
        if (!account || !canSend(account, this.clock.now(), this.clock.todayIso())) return null;
        const ok = eslatmaKerakmi(
          {
            stage: purchase.stage,
            remindedStages: purchase.remindedStages,
            lastOutboundAt: conversation.lastOutboundAt,
            lastInboundAt: conversation.lastInboundAt,
          },
          this.clock.now(),
          runtime.eslatmaSoat,
        );
        return ok ? { stage: purchase.stage } : null;
      };

      if (!(await tekshiruv())) continue;

      if (processed > 0) {
        // Ketma-ket eslatmalar spam bo'lib ko'rinmasin. Pauza faqat haqiqiy
        // yuborishdan oldin: o'tkazib yuborilganlar oynani yemaydi.
        await this.kut(
          randomBetween(runtime.minDelaySec, Math.max(runtime.minDelaySec, runtime.maxDelaySec)) * 1000,
        );
        if (this.stopping) break;
        // Pauza ichida mijoz javob yozib ulgurgan bo'lishi mumkin — qayta o'qiymiz.
      }
      const hozir = processed > 0 ? await tekshiruv() : { stage: candidate.stage };
      if (!hozir) continue;
      const { stage } = hozir;

      try {
        // Bosqich agent chaqiruvidan OLDIN belgilanadi: yiqilish yoki qayta
        // ishga tushish ikkinchi eslatmaga olib kelmasin. Agent kill switch
        // yoki oyna sababli yubormasa, bosqich belgili qoladi (qayta urinish yo'q).
        await this.purchases.addRemindedStage(candidate.purchaseId, stage);
        processed += 1;
        const result = await this.agent.nudge(candidate.conversationId, stage);
        if (result.sent) {
          sent += 1;
          await this.audit
            .record({
              actor: 'system',
              action: 'eslatma.sent',
              entity: 'conversation',
              entityId: candidate.conversationId,
              payload: { stage },
            })
            .catch((err: unknown) => log.warn({ err }, 'Eslatma yozuvi yozilmadi'));
        }
      } catch (err) {
        if (err instanceof AbortedError || err instanceof StaleTurnError) {
          log.info({ conversationId: candidate.conversationId }, 'Eslatma uzildi');
          continue;
        }
        log.error({ err, conversationId: candidate.conversationId }, 'Eslatma yiqildi');
      }
    }
    if (processed) log.info({ processed, sent }, 'Eslatma tsikli tugadi');
    return sent;
  }
}
