import type { Conversation } from '@/domain/entities/Conversation';
import { canAgentReply } from '@/domain/entities/Conversation';
import type { Message } from '@/domain/entities/Message';
import { readableBody } from '@/domain/entities/Message';
import { keyingiKurs, sotuvdagiKurslar } from '@/domain/entities/Course';
import type { XaridBosqichi } from '@/domain/entities/Purchase';
import {
  chekJavobiHolati,
  RECEIPT_REVIEW_REASON,
  type PaymentCheck,
} from '@/domain/entities/PaymentCheck';
import type { ClientType } from '@/domain/entities/AgentMemory';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { IPaymentCheckRepository } from '@/domain/repositories/IPaymentCheckRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { ICourseRepository } from '@/domain/repositories/ICourseRepository';
import type {
  AgentUsageMode,
  IAgentUsageRepository,
} from '@/domain/repositories/IAgentUsageRepository';
import type {
  AgentKnowledgeBlocks,
  AgentSalesContext,
  AgentTurnInput,
  AgentTurnOutput,
  IAgentEngine,
  TurnMode,
} from '@/domain/services/IAgentEngine';
import type {
  IClientProfileRepository,
  ILessonRepository,
} from '@/domain/repositories/IAgentKnowledgeRepository';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { PromptComposer } from '@/application/services/PromptComposer';
import type { IClock, IEventBus } from '@/domain/services/support';
import type { MessageDispatcher } from '@/application/services/MessageDispatcher';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { XaridXizmati } from '@/application/services/XaridXizmati';
import type { KartaYuboruvchi } from '@/application/services/KartaYuboruvchi';
import type { StyleVersion } from '@/domain/entities/UslubVersiyasi';
import { uslubTamgasi } from '@/application/services/uslubTamgasi';
import { llmTamgasi } from '@/application/services/llmTamgasi';
import type { AgentEngineFactory, TanlanganDvigatel } from '@/application/services/AgentEngineFactory';
import type { AccountLabels } from '@/application/services/AccountLabels';
import { hisoblaNarx } from '@/domain/services/llmNarxi';
import { agentKartaYuborsinmi } from '@/domain/services/karta';
import { MAXFIY_SABAB, maxfiyQiymatBormi, tarixMatni } from '@/domain/services/maxfiyQiymat';
import { personaNameOf } from '@/domain/entities/TelegramAccount';
import { mavzudanTashqari, TASHQARI_JAVOBI } from '@/domain/services/mavzudanTashqari';
import {
  AbortedError,
  NomalumMijozXatosi,
  NotFoundError,
  StaleTurnError,
} from '@/shared/errors';
import { randomBetween, sleep } from '@/shared/datetime';
import { childLogger } from '@/shared/logger';
import { kontekst } from '@/shared/logContext';

const log = childLogger('agent-runner');

/**
 * Navbat nima uchun uzilgani. `operator` — "Agent" tugmasi o'chirilgan;
 * `stale` — mijoz yangi xabar yubordi va tayyor bo'layotgan javob eskirdi.
 */
export type AbortReason = 'operator' | 'stale';

/**
 * `client_profiles.client_type` bazada hali eski tasnifni qabul qiladi
 * (14-vazifada migratsiya bilan almashadi). Sotuv tasnifi (`tez_qaror` va
 * h.k.) bazaga yozilsa CHECK yiqiladi va xulosa ham yo'qoladi — shuning
 * uchun faqat baza qabul qiladigan qiymat yoziladi, qolgani `null`.
 */
const SAQLANADIGAN_TURLAR: ReadonlySet<string> = new Set([
  'qochoq', 'tajovuzkor', 'qiynalayotgan', 'yaxshi_niyatli',
]);

function isClientType(value: string | null | undefined): value is ClientType {
  return Boolean(value && SAQLANADIGAN_TURLAR.has(value));
}

const HISTORY_LIMIT = 20;

export interface AgentTurnResult {
  readonly sent: boolean;
  readonly reply: string | null;
  readonly escalated: boolean;
  /** Shu navbatda tizim karta xabarini yubordi. */
  readonly cardSent: boolean;
}

const YUBORILMADI: AgentTurnResult = { sent: false, reply: null, escalated: false, cardSent: false };

/** Navbat qaysi rejimda narx daftariga yoziladi (`agent_usage.mode` CHECK'i eski qiymatlarni biladi). */
const USAGE_MODE: Record<TurnMode, AgentUsageMode> = {
  first: 'first',
  reply: 'reply',
  nudge: 'nudge',
  operator: 'operator',
  receipt_confirmed: 'thanks',
  receipt_rejected: 'operator',
};

/** Modeldan keyingi qo'llash parametrlari. */
interface ApplyOptions {
  /** `false` — qo'lda tasdiqlash rejimi: javob qoralama bo'lib qoladi, karta ketmaydi. */
  readonly autoSend: boolean;
  /**
   * Shu navbatda `sendCard` qo'llanadimi. Faqat mijoz bilan jonli suhbatda
   * (`reply`) va operator topshirig'ida — birinchi murojaat, eslatma va chek
   * natijasi xabarlarida karta ketmaydi.
   */
  readonly kartaRuxsat: boolean;
  /** Birinchi murojaatgina kunlik kvotani sarflaydi. */
  readonly coldOutreach: boolean;
  /** Shu navbatda HAQIQATAN ishlatilgan dvigatel — `llmTamgasi` shundan yozadi. */
  readonly ishlatilgan?: TanlanganDvigatel;
  readonly fallback?: boolean;
}

/**
 * Agentning bitta "navbatini" boshqaradi: kontekst yig'ish → model chaqiruvi →
 * natijani qo'llash (xabar, kurs, bosqich, karta, eskalatsiya, xotira).
 *
 * Yon ta'sirlarning barchasi shu yerda — IAgentEngine sof qoladi.
 */
export class AgentRunner {
  /**
   * Hozir ishlab turgan navbatlar — suhbat bo'yicha. "Agent" tugmasi HTTP
   * so'rovi bilan keladi, navbat esa boshqa joyda ketayotgan bo'ladi;
   * ikkalasini `conversationId` bog'laydi.
   */
  private readonly inFlight = new Map<string, Set<AbortController>>();

  /**
   * Debouncer buferini so'raydigan manba. Konstruktorda emas: `ReplyDebouncer`
   * o'zi `AgentRunner` ni oladi va bog'liqlik halqa hosil qiladi.
   */
  private pending: { hasPending(conversationId: string): boolean } | null = null;

  /** Halqani yopadi — `container` da debouncer qurilgandan keyin chaqiriladi. */
  setPendingReplies(source: { hasPending(conversationId: string): boolean }): void {
    this.pending = source;
  }

  constructor(
    /** Akkauntga qarab dvigatel (Claude yoki OpenAI) tanlaydi. */
    private readonly engines: AgentEngineFactory,
    private readonly clients: IClientRepository,
    private readonly conversations: IConversationRepository,
    private readonly messages: IMessageRepository,
    private readonly dispatcher: MessageDispatcher,
    private readonly settings: RuntimeSettings,
    private readonly audit: IAuditRepository,
    private readonly events: IEventBus,
    private readonly clock: IClock,
    private readonly prompt: PromptComposer,
    private readonly lessons: ILessonRepository,
    private readonly profiles: IClientProfileRepository,
    private readonly accounts: ITelegramAccountRepository,
    /** Jurnalga akkaunt nomini yozish uchun. */
    private readonly accountLabels: AccountLabels,
    /** Ochiq chek tekshiruvi bormi — javob ohangi shunga bog'liq. */
    private readonly paymentChecks: IPaymentCheckRepository,
    /** Chaqiruv narxi daftari — `npm run agent-cost` shundan o'qiydi. */
    private readonly usageLog: IAgentUsageRepository,
    private readonly courses: ICourseRepository,
    private readonly xarid: XaridXizmati,
    private readonly karta: KartaYuboruvchi,
  ) {}

  /**
   * Model chaqiruvining narxini yozib qo'yadi — model tugagan zahoti,
   * to'xtatish tekshiruvidan OLDIN: javob ketmasa ham tokenlar sarflangan.
   */
  private async trackUsage(
    conversationId: string,
    mode: AgentUsageMode,
    output: AgentTurnOutput,
    ishlatilgan: TanlanganDvigatel,
  ): Promise<void> {
    const u = output.usage;
    if (!u) return;
    // Claude narxni o'zi beradi; OpenAI faqat tokenlarni — narx `llm_models` tarifidan.
    const costUsd = u.costUsd === 0 && ishlatilgan.llmModel ? hisoblaNarx(u, ishlatilgan.llmModel) : u.costUsd;
    await this.usageLog
      .record({
        conversationId,
        mode,
        model: u.model,
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        cacheReadTokens: u.cacheReadTokens,
        cacheWriteTokens: u.cacheWriteTokens,
        costUsd,
        durationMs: u.durationMs,
      })
      .catch((err) => log.warn({ err, conversationId }, 'Agent narxini yozib bo\'lmadi'));
  }

  /**
   * Shu suhbatda ketayotgan navbatlarni DARHOL uzadi. `reason` xato TURIGA
   * aylanadi (`operator` → `AbortedError`, `stale` → `StaleTurnError`).
   *
   * @returns nechta navbat uzilgani — jurnal uchun.
   */
  abort(conversationId: string, reason: AbortReason = 'operator'): number {
    const set = this.inFlight.get(conversationId);
    if (!set?.size) return 0;
    const count = set.size;
    for (const controller of [...set]) controller.abort(reason);
    log.info({ conversationId, count, reason }, 'Ketayotgan agent navbati to\'xtatildi');
    return count;
  }

  /**
   * Bitta navbatni reyestrga qo'yib bajaradi. `external` — ommaviy ishning
   * "To'xtatish"i; ikkala manba bitta kontrollerga yig'iladi.
   */
  private async withAbort<T>(
    conversationId: string,
    external: AbortSignal | undefined,
    fn: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const controller = new AbortController();
    const forward = (): void => controller.abort();

    if (external?.aborted) controller.abort();
    else external?.addEventListener('abort', forward);

    const set = this.inFlight.get(conversationId) ?? new Set<AbortController>();
    set.add(controller);
    this.inFlight.set(conversationId, set);

    try {
      return await fn(controller.signal);
    } catch (err) {
      // Navbatni eskirgani uchun O'ZIMIZ uzdik — xato turini shu yerda almashtiramiz.
      if (controller.signal.aborted && controller.signal.reason === 'stale') {
        throw new StaleTurnError();
      }
      throw err;
    } finally {
      external?.removeEventListener('abort', forward);
      set.delete(controller);
      if (!set.size) this.inFlight.delete(conversationId);
    }
  }

  /**
   * Navbatni akkauntga biriktirilgan dvigatel bilan bajaradi; u yiqilsa
   * standart dvigatelga (Claude) BIR MARTA qaytadi. `AbortedError` qaytishga
   * sabab bo'lmaydi — u navbatni ataylab to'xtatgani.
   */
  private async navbat<T>(
    conversation: Conversation,
    chaqir: (engine: IAgentEngine) => Promise<T>,
  ): Promise<{ output: T; ishlatilgan: TanlanganDvigatel; fallback: boolean }> {
    const account = conversation.telegramAccountId
      ? await this.accounts.findById(conversation.telegramAccountId)
      : null;

    // Bu yerga faqat OTILGAN xato yetadi (baza yoki shifr) — standart yo'lga buriladi.
    let tanlangan: TanlanganDvigatel;
    try {
      tanlangan = await this.engines.forAccount(account);
    } catch (err) {
      log.warn(
        { conversationId: conversation.id, err },
        'Dvigatel tanlanmadi — standart dvigatelga o\'tildi',
      );
      tanlangan = this.engines.standart();
    }

    try {
      return { output: await chaqir(tanlangan.engine), ishlatilgan: tanlangan, fallback: false };
    } catch (err) {
      if (err instanceof AbortedError || tanlangan.provider === 'claude') throw err;
      log.warn(
        { conversationId: conversation.id, provider: tanlangan.provider, model: tanlangan.model, err },
        'LLM xato berdi — standart dvigatelga qaytildi',
      );
      const standart = this.engines.standart();
      return { output: await chaqir(standart.engine), ishlatilgan: standart, fallback: true };
    }
  }

  /** Rejimga mos engine metodi. */
  private static chaqiruv(engine: IAgentEngine, mode: TurnMode, input: AgentTurnInput): Promise<AgentTurnOutput> {
    switch (mode) {
      case 'first':
        return engine.composeFirstContact(input);
      case 'reply':
        return engine.respond(input);
      case 'nudge':
        return engine.composeNudge(input);
      case 'operator':
        return engine.composeOperatorTurn(input);
      case 'receipt_confirmed':
        return engine.composeReceiptConfirmed(input);
      case 'receipt_rejected':
        return engine.composeReceiptRejected(input);
    }
  }

  /**
   * Kontekst, bilim va tarixni yig'ib modelni chaqiradi. Model tugagach narx
   * yoziladi, keyin to'xtatish tekshiriladi: tayyor matn operator tugmani
   * bosgandan keyin mijozga YETIB BORMASLIGI kerak.
   */
  private async modelNavbati(
    conversation: Conversation,
    mode: TurnMode,
    signal: AbortSignal,
    extra: Omit<Partial<AgentTurnInput>, 'history'> & { history?: Message[] },
  ): Promise<{ output: AgentTurnOutput; context: AgentSalesContext; ishlatilgan: TanlanganDvigatel; fallback: boolean }> {
    const context = await this.buildContext(conversation.clientId);
    const knowledge = await this.buildKnowledge(conversation);
    const { history, ...rest } = extra;

    const input: AgentTurnInput = {
      conversationId: conversation.id,
      clientId: conversation.clientId,
      knowledge,
      context,
      history: history ? this.toHistory(history) : [],
      incoming: null,
      sessionId: conversation.agentSessionId,
      signal,
      receiptPending: false,
      ...rest,
    };

    this.events.publish({ type: 'agent.thinking', conversationId: conversation.id, on: true });
    try {
      const { output, ishlatilgan, fallback } = await this.navbat(conversation, (engine) =>
        AgentRunner.chaqiruv(engine, mode, input),
      );
      await this.trackUsage(conversation.id, USAGE_MODE[mode], output, ishlatilgan);
      if (signal.aborted) throw new AbortedError('Agent navbati to\'xtatildi');
      return { output, context, ishlatilgan, fallback };
    } finally {
      this.events.publish({ type: 'agent.thinking', conversationId: conversation.id, on: false });
    }
  }

  /** Mijoz bizni bloklagan yoki akkaunti o'chirilgan — tizim tashabbusi bilan yozilmaydi. */
  private async bloklanganmi(conversation: Conversation): Promise<boolean> {
    const client = await this.clients.findById(conversation.clientId);
    return client?.telegramStatus === 'blocked' || client?.telegramStatus === 'deactivated';
  }

  /**
   * Birinchi murojaat matnini yaratib yuboradi (guruh kommenti yoki raqam).
   * `external` — ommaviy ish "To'xtatish"i.
   */
  async firstContact(conversationId: string, external?: AbortSignal): Promise<AgentTurnResult> {
    return this.withAbort(conversationId, external, async (signal) => {
      const conversation = await this.requireConversation(conversationId);
      const { output, context, ishlatilgan, fallback } = await this.modelNavbati(conversation, 'first', signal, {});
      // Yagona joy, xabar NOTANISH odamga ketadi — kunlik kvota shunga.
      return this.apply(conversation, context, output, { autoSend: true, coldOutreach: true, kartaRuxsat: false, ishlatilgan, fallback });
    });
  }

  /** Mijozning kiruvchi xabariga javob beradi. */
  async reply(conversationId: string, incoming: string): Promise<AgentTurnResult> {
    return this.withAbort(conversationId, undefined, async (signal) => {
      const conversation = await this.requireConversation(conversationId);

      if (!canAgentReply(conversation)) {
        log.info({ conversationId, state: conversation.state }, 'Agent javob bermadi (o\'chirilgan yoki yakunlangan)');
        return YUBORILMADI;
      }

      const runtime = await this.settings.get();

      // Sotuvga aloqasi yo'q topshiriq (masala, kod, tarjima) — modelni
      // umuman chaqirmaymiz. Qo'lda tasdiqlash rejimida va global
      // to'xtatishda qo'riqchi ISHLAMAYDI — u yerda javobni operator hal qiladi.
      const tashqari = runtime.agentAutoReply && !runtime.killSwitch
        ? mavzudanTashqari(incoming)
        : { tashqarimi: false as const, sabab: undefined };
      if (tashqari.tashqarimi) {
        const oxirgilar = await this.messages.recentByConversation(conversationId, 4);
        const oxirgiChiquvchi = [...oxirgilar].reverse().find((m) => m.direction === 'out');
        if (oxirgiChiquvchi?.meta?.guard === 'mavzudan_tashqari') {
          log.info({ conversationId, sabab: tashqari.sabab }, 'Mavzudan tashqari — takroran javob berilmadi');
          return YUBORILMADI;
        }

        await this.dispatcher.send({
          conversation,
          body: TASHQARI_JAVOBI,
          author: 'agent',
          simulateTyping: true,
          meta: { guard: 'mavzudan_tashqari', sabab: tashqari.sabab },
        });
        log.info({ conversationId, sabab: tashqari.sabab }, 'Mavzudan tashqari topshiriq — model chaqirilmadi');
        return { sent: true, reply: TASHQARI_JAVOBI, escalated: false, cardSent: false };
      }

      const history = await this.messages.recentByConversation(conversationId, HISTORY_LIMIT);
      const openCheck = await this.paymentChecks.findOpenByConversation(conversationId);
      const receiptReview = chekJavobiHolati(openCheck, this.clock.now());

      const { output, context, ishlatilgan, fallback } = await this.modelNavbati(conversation, 'reply', signal, {
        history,
        incoming,
        receiptPending: receiptReview !== null,
        receiptReview,
      });

      // Model ishlayotganda mijoz yana yozgan bo'lsa, tayyor matn ESKIRGAN —
      // buferdagi yangi xabarlar uchun keyingi navbat albatta keladi.
      // Holat ham, sessiya ham saqlanmaydi.
      if (this.pending?.hasPending(conversationId)) {
        log.info({ conversationId }, 'Javob eskirdi — yangi xabar kutmoqda, yuborilmadi');
        return YUBORILMADI;
      }

      // Chek qoidasi bilan yozilgan javob ham eskirishi mumkin: model
      // ishlayotganda menejer chekni tasdiqlagan/rad etgan bo'lsa, mijoz
      // "Chekni oldim… tekshirib chiqamiz" ni rahmatdan KEYIN olardi.
      if (receiptReview && openCheck) {
        const hozirgi = await this.paymentChecks.findOpenByConversation(conversationId);
        const ochiq = hozirgi?.id === openCheck.id && hozirgi.kind === 'receipt_review' && hozirgi.status === 'reviewing';
        if (!ochiq) {
          log.info(
            { conversationId, checkId: openCheck.id },
            'Javob eskirdi — chek tekshiruvi shu orada yopildi, yuborilmadi',
          );
          return YUBORILMADI;
        }
      }

      const result = await this.apply(conversation, context, output, {
        autoSend: runtime.agentAutoReply, coldOutreach: false, kartaRuxsat: true, ishlatilgan, fallback,
      });
      if (receiptReview === 'new' && openCheck) await this.chekQabulQilindi(conversation.id, openCheck, result);
      return result;
    });
  }

  /**
   * Mijoz jim qolganda bitta yumshoq eslatma (`stage` — eslatma qaysi
   * bosqich uchun). Ruxsat, chek va bloklash tekshiruvi model chaqiruvidan
   * OLDIN — model bekorga sarflanmasin.
   */
  async nudge(conversationId: string, stage: XaridBosqichi): Promise<AgentTurnResult> {
    return this.withAbort(conversationId, undefined, async (signal) => {
      const conversation = await this.requireConversation(conversationId);

      if (!canAgentReply(conversation)) {
        log.info({ conversationId, state: conversation.state }, 'Eslatma yuborilmadi (agent o\'chirilgan)');
        return YUBORILMADI;
      }

      if (await this.bloklanganmi(conversation)) {
        log.info({ conversationId }, 'Eslatma yuborilmadi (mijoz bloklagan yoki akkaunti o\'chirilgan)');
        return YUBORILMADI;
      }

      const runtime = await this.settings.get();

      // Kuzatuvchi bunday suhbatni chetlaydi — bu poyga uchun zaxira:
      // nomzod tanlangandan keyin chek kelgan bo'lishi mumkin.
      const openCheck = await this.paymentChecks.findOpenByConversation(conversationId);
      if (chekJavobiHolati(openCheck, this.clock.now())) {
        log.info({ conversationId, checkId: openCheck?.id }, 'Chek tekshiruvda — eslatma yo\'q');
        return YUBORILMADI;
      }
      const history = await this.messages.recentByConversation(conversationId, HISTORY_LIMIT);
      const { output, context, ishlatilgan, fallback } = await this.modelNavbati(conversation, 'nudge', signal, {
        history,
        nudgeStage: stage,
      });
      return this.apply(conversation, context, output, {
        autoSend: runtime.agentAutoReply, coldOutreach: false, kartaRuxsat: false, ishlatilgan, fallback,
      });
    });
  }

  /**
   * Operator topshirig'i bo'yicha xabar. Topshiriq tarixdagi qayd bo'lib
   * keladi (`InstructAgentUseCase` uni avval bazaga yozadi). Xabar
   * `agentAutoReply` ga qaramay DARHOL yuboriladi: tugmani operator bosgan.
   */
  async operatorTurn(conversationId: string): Promise<AgentTurnResult> {
    return this.withAbort(conversationId, undefined, async (signal) => {
      const conversation = await this.requireConversation(conversationId);

      if (!canAgentReply(conversation)) {
        log.info(
          { conversationId, state: conversation.state },
          'Operator topshirig\'i bajarilmadi (agent o\'chirilgan yoki suhbat yakunlangan)',
        );
        return YUBORILMADI;
      }

      const history = await this.messages.recentByConversation(conversationId, HISTORY_LIMIT);
      const topshiriq = [...history].reverse().find((m) => m.direction === 'note');
      if (!topshiriq) {
        log.warn({ conversationId }, 'Operator topshirig\'i tarixda topilmadi');
        return YUBORILMADI;
      }

      const openCheck = await this.paymentChecks.findOpenByConversation(conversationId);
      const receiptReview = chekJavobiHolati(openCheck, this.clock.now());
      const { output, context, ishlatilgan, fallback } = await this.modelNavbati(conversation, 'operator', signal, {
        history,
        receiptPending: receiptReview !== null,
        receiptReview,
        operatorInstruction: readableBody(topshiriq),
      });

      const result = await this.apply(conversation, context, output, {
        autoSend: true, coldOutreach: false, kartaRuxsat: true, ishlatilgan, fallback,
      });
      // Chekka hali javob berilmagan edi — topshiriq qoidasi agentga chekni
      // olganini aytishni buyurdi. Belgi qo'yiladi, suhbat operatorga qayta chiqarilmaydi.
      if (receiptReview === 'new' && openCheck && result.sent) {
        await this.paymentChecks.markAcknowledged(openCheck.id, this.clock.now());
      }
      return result;
    });
  }

  /**
   * Menejer chekni tasdiqladi — rahmat (bo'lib to'layotganga qolgan summa
   * bilan). Raqamlar chaqiruvchida (xariddan) hisoblanadi. Tugmani menejer
   * bosgani uchun `agentAutoReply` ga qaramay darhol yuboriladi.
   */
  async receiptConfirmedThanks(
    conversationId: string,
    confirmed: NonNullable<AgentTurnInput['receiptConfirmed']>,
  ): Promise<AgentTurnResult> {
    return this.withAbort(conversationId, undefined, async (signal) => {
      const conversation = await this.requireConversation(conversationId);
      if (!canAgentReply(conversation)) {
        log.info({ conversationId, state: conversation.state }, 'Chek tasdig\'i uchun rahmat yuborilmadi (agent o\'chirilgan)');
        return YUBORILMADI;
      }
      const history = await this.messages.recentByConversation(conversationId, HISTORY_LIMIT);
      const { output, context, ishlatilgan, fallback } = await this.modelNavbati(conversation, 'receipt_confirmed', signal, {
        history,
        receiptConfirmed: confirmed,
      });
      return this.apply(conversation, context, output, { autoSend: true, coldOutreach: false, kartaRuxsat: false, ishlatilgan, fallback });
    });
  }

  /** Menejer chekni rad etdi — agent sababga tayanib qayta chek so'raydi. */
  async receiptRejected(conversationId: string, reason: string): Promise<AgentTurnResult> {
    return this.withAbort(conversationId, undefined, async (signal) => {
      const conversation = await this.requireConversation(conversationId);
      if (!canAgentReply(conversation)) {
        log.info({ conversationId, state: conversation.state }, 'Rad etilgan chek bo\'yicha xabar yuborilmadi (agent o\'chirilgan)');
        return YUBORILMADI;
      }
      const history = await this.messages.recentByConversation(conversationId, HISTORY_LIMIT);
      const { output, context, ishlatilgan, fallback } = await this.modelNavbati(conversation, 'receipt_rejected', signal, {
        history,
        receiptRejected: { reason },
      });
      return this.apply(conversation, context, output, { autoSend: true, coldOutreach: false, kartaRuxsat: false, ishlatilgan, fallback });
    });
  }

  /**
   * Agent chekka birinchi marta javob berdi — endi menejer navbati.
   * Javobdan KEYIN qo'yiladi: oldin qo'yilsa `canAgentReply` yopilib,
   * mijoz "Chekni oldim" ni umuman olmasdi.
   */
  private async chekQabulQilindi(
    conversationId: string,
    check: PaymentCheck,
    result: AgentTurnResult,
  ): Promise<void> {
    if (!(await this.paymentChecks.markAcknowledged(check.id, this.clock.now()))) {
      log.info({ conversationId, checkId: check.id }, 'Chek tekshiruvi allaqachon yopilgan — operatorga chiqarilmadi');
      return;
    }
    if (result.escalated) return;

    await this.conversations.update(conversationId, {
      needsHuman: true,
      humanKind: 'chek_tekshiruvi',
      humanReason: RECEIPT_REVIEW_REASON.tolov,
    });
    this.events.publish({ type: 'conversation.updated', conversationId });
    log.info({ conversationId, checkId: check.id }, 'Chekka javob berildi — operatorga o\'tdi');
  }

  /** Suhbat tarixini agent tushunadigan ko'rinishga keltiradi. */
  private toHistory(messages: Message[]): AgentTurnInput['history'] {
    return messages.map((m) => ({
      // `note` — operatorning topshirig'i: agent uni ko'radi, lekin o'z xabari deb emas.
      role:
        m.direction === 'in'
          ? ('client' as const)
          : m.direction === 'note'
            ? ('operator' as const)
            : ('agent' as const),
      // Tizimning karta/havola xabari modelga xom holda ko'rsatilmaydi (`maxfiyQiymat.ts`).
      text: tarixMatni(m.meta as Record<string, unknown> | undefined, readableBody(m)),
      at: m.createdAt,
      // O'chirish tahrirdan USTUN: o'chirilgan xabardan mijozda hech narsa qolmagan.
      holat: m.revokedAt ? ('ochirilgan' as const) : m.editedAt ? ('tuzatilgan' as const) : undefined,
    }));
  }

  /** Akkauntning uslub versiyasi; akkaunt yo'q bo'lsa — v1. */
  private async uslubi(conversation: Conversation): Promise<StyleVersion> {
    if (!conversation.telegramAccountId) return 'v1';
    const account = await this.accounts.findById(conversation.telegramAccountId);
    return account?.styleVersion ?? 'v1';
  }

  /**
   * Model natijasini bazaga va Telegramga qo'llaydi. Tartib:
   * 1) javob (`reply`, 2–4 s pauza, `replySecond`); 2) `courseId` (faqat
   * sotuvdagi kurs); 3) `installment`; 4) `stage`; 5) `sendCard` → karta;
   * 6) `escalate`; 7) saboq, xotira, suhbatdosh.
   */
  private async apply(
    conversation: Conversation,
    context: AgentSalesContext,
    output: AgentTurnOutput,
    opts: ApplyOptions,
  ): Promise<AgentTurnResult> {
    let sent = false;
    const style = await this.uslubi(conversation);

    // 0. Chiqish himoyasi: model karta raqami yoki yopiq havolani o'zi yozgan
    // bo'lsa javob HECH QAYERGA ketmaydi (qoralama ham emas), karta ham yo'q —
    // suhbat menejerga o'tadi.
    const maxfiy = maxfiyQiymatBormi(output.reply) || maxfiyQiymatBormi(output.replySecond);
    if (maxfiy) log.warn({ conversationId: conversation.id }, MAXFIY_SABAB);
    const kartaSorovi = output.sendCard && opts.kartaRuxsat && !output.escalate && !maxfiy;

    // 1. Javob.
    if (output.reply && !maxfiy) {
      // `ishlatilgan` HAR DOIM keladi (`navbat` orqali); standart qiymat faqat tur xavfsizligi uchun.
      const dvigatel = opts.ishlatilgan ?? this.engines.standart();
      const fallback = opts.fallback ?? false;

      if (opts.autoSend) {
        await this.dispatcher.send({
          conversation,
          body: output.reply,
          author: 'agent',
          simulateTyping: true,
          coldOutreach: opts.coldOutreach,
          meta: llmTamgasi(uslubTamgasi({ note: output.internalNote, model: true }, style), dvigatel, fallback),
        });
        sent = true;

        // Ikkinchi qism kvotani QAYTA sarflamaydi — bu bitta murojaatning davomi.
        if (output.replySecond) {
          await sleep(randomBetween(2_000, 4_000));
          await this.dispatcher
            .send({
              conversation,
              body: output.replySecond,
              author: 'agent',
              simulateTyping: true,
              meta: llmTamgasi(uslubTamgasi({ model: true, part: 2 }, style), dvigatel, fallback),
            })
            .catch((err) =>
              log.warn(
                {
                  ...kontekst({ akkaunt: this.accountLabels.labelOf(conversation.telegramAccountId) }),
                  conversationId: conversation.id,
                  err,
                },
                'Ikkinchi xabar yuborilmadi',
              ),
            );
        }
      } else {
        // Qo'lda tasdiqlash rejimi: qoralama sifatida saqlanadi.
        const draft = await this.messages.create({
          conversationId: conversation.id,
          direction: 'out',
          author: 'agent',
          body: output.reply,
          status: 'draft',
          meta: {
            ...llmTamgasi(uslubTamgasi({ note: output.internalNote }, style), dvigatel, fallback),
            // Operator qoralamani tasdiqlaganda karta ham kerakligini ko'rsin.
            ...(kartaSorovi ? { sendCard: true } : {}),
          },
        });
        this.events.publish({ type: 'message.created', conversationId: conversation.id, messageId: draft.id });
      }
    }

    const clientId = conversation.clientId;
    // Xarid yangilanishi javobni BUZMAYDI: xabar allaqachon ketgan, xato faqat jurnalga.
    const xaridQadam = async (nom: string, fn: () => Promise<unknown>): Promise<void> => {
      try {
        await fn();
      } catch (err) {
        log.warn({ conversationId: conversation.id, clientId, err }, `Xarid yangilanmadi (${nom})`);
      }
    };

    // 2. Kurs — faqat sotuvdagi kurs. Model boshqa id yozsa (eski kurs, o'ylab topilgan) tashlanadi.
    const courseId = output.courseId;
    if (courseId && context.coursesOnSale.some((k) => k.course.id === courseId)) {
      await xaridQadam('kurs', () => this.xarid.kursBelgila(clientId, courseId));
    } else if (courseId) {
      log.info({ conversationId: conversation.id, courseId }, 'Agent sotuvda yo\'q kursni ko\'rsatdi — e\'tiborsiz');
    }

    // 3. Bo'lib to'lash — faqat `true` qo'llanadi (izoh `XaridXizmati.bolibTolash` da).
    if (output.installment) await xaridQadam('bolib_tolash', () => this.xarid.bolibTolash(clientId));

    // 4. Bosqich — ruxsat etilgan o'tishni `bosqichOtishi` hal qiladi.
    const stage = output.stage;
    if (stage) await xaridQadam('bosqich', () => this.xarid.bosqich(clientId, stage, 'agent'));

    // 5. Karta — faqat `reply`/`operator` navbatida, eskalatsiyasiz, maxfiy
    // qiymatsiz va takror himoyasidan o'tsa (`agentKartaYuborsinmi`).
    // Qoralama rejimida karta o'zi ketmaydi — menejerga topshiriladi.
    let cardSent = false;
    let kartaXatosi: string | null = null;
    if (kartaSorovi) {
      const joriy = await this.xarid.joriyXarid(clientId).catch(() => null);
      if (!agentKartaYuborsinmi(joriy?.stage ?? null)) {
        log.info({ conversationId: conversation.id, stage: joriy?.stage }, 'Karta qayta yuborilmadi (takror himoyasi)');
      } else if (!opts.autoSend) {
        // Qo'lda tasdiqlash rejimi: javob qoralama, karta o'zi KETMAYDI —
        // aks holda operator "mana karta" ni tasdiqlaydi, karta esa kelmaydi.
        kartaXatosi = "Mijoz to'lashga rozi — kartani yuboring";
      } else {
        try {
          // Karta xabari ham dispatcher orqali ketadi: kill switch, oyna va
          // limitlar unga ham amal qiladi. `sent: false` bo'lsa `KartaYuboruvchi`
          // suhbatni o'zi menejerga o'tkazgan.
          cardSent = (await this.karta.yubor(conversation.id, clientId)).sent;
        } catch (err) {
          log.warn({ conversationId: conversation.id, err }, 'Karta yuborilmadi');
          kartaXatosi = `Karta yuborilmadi: ${err instanceof Error ? err.message : 'noma\'lum xato'}`;
        }
      }
    }

    // 7. Saboq, mijoz xotirasi, suhbatdosh.
    await this.captureMemory(conversation, output);

    // 6. Eskalatsiya (va karta xatosi) — suhbat menejerga o'tadi.
    const escalated = Boolean(output.escalate) || kartaXatosi !== null || maxfiy;
    const humanReason = maxfiy ? MAXFIY_SABAB : (output.escalate?.reason ?? kartaXatosi);

    // `conversations.state` endi agentga tegishli emas (14-vazifada o'chiriladi).
    // Faqat "new" → "contacted": suhbatlar ro'yxati va ommaviy ishlar birinchi
    // xabar ketgan suhbatni shu belgi bilan ajratadi.
    await this.conversations.update(conversation.id, {
      ...(sent && conversation.state === 'new' ? { state: 'contacted' as const } : {}),
      ...(escalated ? { needsHuman: true, humanReason } : {}),
      ...(output.sessionId ? { agentSessionId: output.sessionId } : {}),
      ...(output.internalNote ? { summary: output.internalNote } : {}),
    });

    this.events.publish({ type: 'conversation.updated', conversationId: conversation.id });
    this.events.publish({ type: 'stats.invalidate' });

    if (escalated) {
      await this.audit.record({
        actor: 'agent',
        action: 'conversation.escalated',
        entity: 'conversation',
        entityId: conversation.id,
        payload: { reason: humanReason },
      });
    }

    return { sent, reply: maxfiy ? null : output.reply, escalated, cardSent };
  }

  /**
   * Qoidalar, saboqlar, mijoz xotirasi, agent ismi va kompaniya nomini yig'adi.
   * Ism suhbatning Telegram akkauntidan olinadi: mijoz uchun har raqam alohida odam.
   */
  private async buildKnowledge(conversation: Conversation): Promise<AgentKnowledgeBlocks> {
    const account = conversation.telegramAccountId
      ? await this.accounts.findById(conversation.telegramAccountId)
      : null;
    const style = account?.styleVersion ?? 'v1';

    const [rules, lessons, clientMemory, settings] = await Promise.all([
      this.prompt.renderSections(style),
      this.prompt.renderLessons(),
      this.prompt.renderClientMemory(conversation.clientId),
      this.settings.get(),
    ]);
    return {
      rules,
      lessons,
      clientMemory,
      personaName: personaNameOf(account, settings.personaName),
      companyName: settings.kompaniyaNomi,
    };
  }

  /**
   * Agent o'rgangan narsalarni saqlaydi. Saboq DARHOL promptga tushmaydi —
   * avval operator tasdiqlashi kerak.
   */
  private async captureMemory(conversation: Conversation, output: AgentTurnOutput): Promise<void> {
    if (output.lesson) {
      await this.lessons
        .recordProposal({
          lesson: output.lesson.lesson,
          conversationId: conversation.id,
          evidence: output.lesson.evidence,
        })
        .catch((err) => log.warn({ err }, 'Saboqni saqlab bo\'lmadi'));
    }

    if (output.clientMemory) {
      const type = output.clientMemory.clientType;
      await this.profiles
        .upsert(conversation.clientId, {
          clientType: isClientType(type) ? type : null,
          summary: output.clientMemory.summary,
          whatWorks: output.clientMemory.whatWorks,
        })
        .catch((err) => log.warn({ err }, 'Mijoz xotirasini saqlab bo\'lmadi'));
    }

    // Alohida saqlanadi: agent clientMemory'ni null qaytarib, suhbatdoshni aytishi mumkin.
    if (output.interlocutor) {
      await this.profiles
        .upsert(conversation.clientId, { interlocutor: output.interlocutor })
        .catch((err) => log.warn({ err }, 'Suhbatdoshni saqlab bo\'lmadi'));
    }
  }

  /** Mijoz, uning xaridi va sotuvdagi kurslar — agent tushunadigan ko'rinishda. */
  async buildContext(clientId: string): Promise<AgentSalesContext> {
    const client = await this.clients.findById(clientId);
    if (!client) throw new NotFoundError('Mijoz', clientId);

    const todayIso = this.clock.todayIso();
    const [all, purchase, tolanganlar, interlocutor] = await Promise.all([
      this.courses.list(),
      this.xarid.joriyXarid(clientId),
      this.xarid.tolanganKurslar(clientId),
      this.suhbatdosh(clientId),
    ]);

    const onSale = sotuvdagiKurslar(all, todayIso);
    const coursesOnSale = await Promise.all(
      onSale.map(async (course) => ({
        course,
        knowledge: (await this.courses.listKnowledge(course.id)).filter((k) => k.isEnabled),
      })),
    );

    return {
      clientName: client.fullName,
      clientFirstName: client.firstName,
      interlocutor,
      source: client.source,
      sourceGroup: client.sourceGroup,
      sourceComment: client.sourceComment,
      purchase: purchase
        ? {
            stage: purchase.stage,
            courseId: purchase.courseId,
            totalAmount: purchase.totalAmount,
            paidAmount: purchase.paidAmount,
            installment: purchase.installment,
          }
        : null,
      coursesOnSale,
      nextCourse: onSale.length ? null : keyingiKurs(all, todayIso),
      boughtCourses: tolanganlar
        .map((id) => all.find((c) => c.id === id)?.name ?? null)
        .filter((n): n is string => Boolean(n)),
    };
  }

  /** Profildagi suhbatdosh. Profil o'qilmasa murojaat mijozga qaytadi. */
  private async suhbatdosh(clientId: string): Promise<AgentSalesContext['interlocutor']> {
    try {
      return (await this.profiles.find(clientId))?.interlocutor ?? null;
    } catch (err) {
      log.warn({ err, clientId }, 'Suhbatdoshni o\'qib bo\'lmadi');
      return null;
    }
  }

  private async requireConversation(id: string): Promise<Conversation> {
    const conversation = await this.conversations.findById(id);
    if (!conversation) throw new NotFoundError('Suhbat', id);
    // Noma'lum mijozga asosiy agent YOZMAYDI — javobni `NomalumMijozAgenti` beradi.
    const client = await this.clients.findById(conversation.clientId);
    if (client?.nomalum) throw new NomalumMijozXatosi();
    return conversation;
  }
}
