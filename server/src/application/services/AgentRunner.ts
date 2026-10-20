import type { Conversation, ConversationState } from '@/domain/entities/Conversation';
import { canAgentNudge, canAgentReply } from '@/domain/entities/Conversation';
import { kechikkanSumma, missedMonths } from '@/domain/entities/Contract';
import { agentUchunHolat, faqatYoziladiganlar, yoziladimi } from '@/domain/entities/shartnomaHolati';
import type { Message } from '@/domain/entities/Message';
import { readableBody } from '@/domain/entities/Message';
import type { PaymentPromise } from '@/domain/entities/PaymentPromise';
import {
  chekJavobiHolati,
  RECEIPT_REVIEW_REASON,
  type PaymentCheck,
} from '@/domain/entities/PaymentCheck';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { IPaymentPromiseRepository } from '@/domain/repositories/IPaymentPromiseRepository';
import type { IPaymentCheckRepository } from '@/domain/repositories/IPaymentCheckRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type {
  AgentUsageMode,
  IAgentUsageRepository,
} from '@/domain/repositories/IAgentUsageRepository';
import type {
  AgentDebtContext,
  AgentKnowledgeBlocks,
  AgentTurnInput,
  AgentTurnOutput,
  IAgentEngine,
} from '@/domain/services/IAgentEngine';
import type { ClientType } from '@/domain/entities/AgentMemory';
import type {
  IClientProfileRepository,
  ILessonRepository,
} from '@/domain/repositories/IAgentKnowledgeRepository';
import type { PromptComposer } from '@/application/services/PromptComposer';
import type { IClock, IEventBus } from '@/domain/services/support';
import type { MessageDispatcher } from '@/application/services/MessageDispatcher';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { IContractPaymentRepository } from '@/domain/repositories/IContractPaymentRepository';
import type { StyleVersion } from '@/domain/entities/UslubVersiyasi';
import { uslubTamgasi } from '@/application/services/uslubTamgasi';
import { llmTamgasi } from '@/application/services/llmTamgasi';
import type { AgentEngineFactory, TanlanganDvigatel } from '@/application/services/AgentEngineFactory';
import { hisoblaNarx } from '@/domain/services/llmNarxi';
import type { ContractSyncService } from '@/application/services/ContractSyncService';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { IHolidayRepository } from '@/domain/repositories/IHolidayRepository';
import type { OylikEslatmaMalumoti } from '@/domain/services/oylikEslatma';
import { personaNameOf } from '@/domain/entities/TelegramAccount';
import { bayramKuni, ishKuniga } from '@/domain/entities/bayram';
import { stageForOverdueDays } from '@/domain/policies/EscalationPolicy';
import { config } from '@/shared/config';
import {
  AbortedError,
  CrmUnavailableError,
  NomalumMijozXatosi,
  NotFoundError,
  StaleTurnError,
} from '@/shared/errors';
import { randomBetween, sleep, toIsoDate, zonedParts } from '@/shared/datetime';
import { mavzudanTashqari, TASHQARI_JAVOBI } from '@/domain/services/mavzudanTashqari';
import { childLogger } from '@/shared/logger';
import { kontekst } from '@/shared/logContext';
import type { AccountLabels } from '@/application/services/AccountLabels';

const log = childLogger('agent-runner');

/**
 * Navbat nima uchun uzilgani. `operator` — "Agent" tugmasi o'chirilgan;
 * `stale` — mijoz yangi xabar yubordi va tayyor bo'layotgan javob eskirdi.
 */
export type AbortReason = 'operator' | 'stale';

const CLIENT_TYPES: ReadonlySet<string> = new Set([
  'qochoq', 'tajovuzkor', 'qiynalayotgan', 'yaxshi_niyatli',
]);

function isClientType(value: string | null | undefined): value is ClientType {
  return Boolean(value && CLIENT_TYPES.has(value));
}
const HISTORY_LIMIT = 20;

/**
 * Ichki hisob qaydining turi (`meta.kind`).
 *
 * NEGA OPERATOR TOPSHIRIG'IDAN AJRATILADI: ikkalasi ham `note`, lekin
 * topshiriq agentga VAZIFA beradi, bu esa raqamlar farqi haqidagi xabar.
 * Qayd promptga tushsa, agent uni operatorning gapi deb o'qiydi va ichki
 * hisobni (ikkita turli summani) mijozga aytib yuborishi mumkin —
 * holbuki qayd aynan shunday chalkashlikni yozib qo'yish uchun yozilgan.
 */
const HISOB_QAYDI = 'crm_farqi';

function hisobQaydimi(m: Message): boolean {
  return m.direction === 'note' && (m.meta as { kind?: string } | undefined)?.kind === HISOB_QAYDI;
}

/** Promptga tushadigan to'lanmagan oylar soni — ro'yxat uzun bo'lsa agent chalg'iydi. */
const UNPAID_MONTHS_LIMIT = 6;
/** Oxirgi to'lovlar — "men to'ladim" e'tiroziga javob berish uchun shuncha yetadi. */
const RECENT_PAYMENTS_LIMIT = 3;
const VALID_STATES: ReadonlySet<string> = new Set([
  'contacted', 'negotiating', 'promised', 'agreed', 'refused', 'unreachable', 'escalated',
]);

/**
 * Suhbatning ochiq kelishuvi promptga QAYSI ko'rinishda tushadi.
 *
 * Ikki ko'rinish bor va ular BIR VAQTDA to'lmaydi:
 *
 *   • `broken` — sanasi o'tgan va hech narsa kelmagan va'da. Bu bosim
 *     asosi: agent uni suhbatda aniq eslatadi.
 *   • `open` — hali kuchdagi kelishuv. Bu esa TAKRORLAMASLIK asosi:
 *     mijoz sanani allaqachon aytgan, undan qayta so'rash uni
 *     eshitmaganday ko'rinadi.
 *
 * Ikkalasi birga berilsa, agent bitta xabarda ham ayblab, ham
 * "kelishuvimiz kuchda" deb yozardi — shuning uchun tanlov shu yerda,
 * bitta joyda qilinadi.
 *
 * `partial` va'da HECH QACHON buzilgan hisoblanmaydi: pul KELGAN,
 * bor-yo'g'i to'liq emas. Uni "va'da berdingiz, lekin to'lamadingiz"
 * deb ko'rsatish mijozga ochiq nohaqlik bo'lardi — u to'lagan pulini
 * ko'rsatib javob qaytaradi va bosim asosi teskarisiga aylanadi.
 */
export function vadaKorinishi(
  active: PaymentPromise | null,
  now: Date,
): {
  broken: { amount: number; date: string } | null;
  open: { amount: number; date: string; paid: number } | null;
} {
  if (!active) return { broken: null, open: null };

  const date = toIsoDate(active.promisedDate) ?? '';
  // Solishtiruv SANA bo'yicha, vaqt tamg'asi bo'yicha emas. Tamg'a bilan
  // taqqoslaganda kelishilgan kunning o'zi ham "o'tgan" bo'lib chiqardi
  // (sana yarim tunda boshlanadi) va mijoz aytgan kuni ertalab
  // "va'da bergan edingiz, lekin to'lamadingiz" degan xabar olardi —
  // holbuki kun hali tugamagan. `evaluatePromise` ham xuddi shu
  // chegaradan foydalanadi: kelishilgan kun — eslatma kuni, ayblov kuni
  // emas.
  const bugun = zonedParts(now, config.TIMEZONE).isoDate;
  const buzilgan = active.status === 'pending' && bugun > date;

  return buzilgan
    ? { broken: { amount: active.amount, date }, open: null }
    : { broken: null, open: { amount: active.amount, date, paid: active.paidAmount } };
}

export interface AgentTurnResult {
  readonly sent: boolean;
  readonly reply: string | null;
  readonly escalated: boolean;
  readonly promiseRecorded: boolean;
}

/**
 * Agentning bitta "navbatini" boshqaradi: kontekst yig'ish → model chaqiruvi →
 * natijani qo'llash (xabar yuborish, va'dani yozish, holatni yangilash).
 *
 * Yon ta'sirlarning barchasi shu yerda — IAgentEngine sof qoladi.
 */
export class AgentRunner {
  /**
   * Hozir ishlab turgan navbatlar — suhbat bo'yicha.
   *
   * NEGA REYESTR KERAK: "Agent" tugmasi HTTP so'rovi bilan keladi, navbat
   * esa butunlay boshqa joyda (debouncer taymeri, va'da kuzatuvchisi)
   * ketayotgan bo'ladi. Ikkalasini bog'laydigan yagona narsa —
   * `conversationId`. Reyestrsiz tugma faqat bazadagi bayroqni
   * o'zgartirardi va ketayotgan javob oxirigacha yozilib, mijozga
   * yuborilardi: operator agentni o'chirgan bo'lsa ham.
   *
   * `Set` — bitta suhbatda bir vaqtda bir nechta navbat bo'lishi mumkin
   * (masalan va'da eslatmasi bilan kiruvchi xabar ustma-ust tushsa).
   * Hammasi to'xtatilishi kerak, faqat oxirgisi emas.
   */
  private readonly inFlight = new Map<string, Set<AbortController>>();

  /**
   * Debouncer buferini so'raydigan manba.
   *
   * Konstruktorda emas, alohida o'rnatiladi: `ReplyDebouncer` o'zi
   * `AgentRunner` ni oladi, ya'ni bog'liqlik halqa hosil qiladi va
   * ikkalasini bir vaqtda qurib bo'lmaydi.
   */
  private pending: { hasPending(conversationId: string): boolean } | null = null;

  private paymentClaimWatch: ((conversationId: string) => Promise<unknown>) | null = null;

  /**
   * Mijoz "to'ladim" degan, CRM'da to'lov hali yo'q — kuzatuvni ochuvchi.
   * `PaymentCheckService` o'zi `AgentRunner` ga bog'liq, shuning uchun
   * konstruktorda emas, `container` da keyin ulanadi.
   */
  setPaymentClaimWatch(open: (conversationId: string) => Promise<unknown>): void {
    this.paymentClaimWatch = open;
  }

  /** Halqani yopadi — `container` da debouncer qurilgandan keyin chaqiriladi. */
  setPendingReplies(source: { hasPending(conversationId: string): boolean }): void {
    this.pending = source;
  }

  constructor(
    /** Akkauntga qarab dvigatel (Claude yoki OpenAI) tanlaydi. */
    private readonly engines: AgentEngineFactory,
    private readonly clients: IClientRepository,
    private readonly contracts: IContractRepository,
    private readonly conversations: IConversationRepository,
    private readonly messages: IMessageRepository,
    private readonly promises: IPaymentPromiseRepository,
    private readonly dispatcher: MessageDispatcher,
    private readonly settings: RuntimeSettings,
    private readonly audit: IAuditRepository,
    private readonly events: IEventBus,
    private readonly clock: IClock,
    private readonly prompt: PromptComposer,
    private readonly lessons: ILessonRepository,
    private readonly profiles: IClientProfileRepository,
    private readonly payments: IContractPaymentRepository,
    private readonly contractSync: ContractSyncService,
    private readonly accounts: ITelegramAccountRepository,
    /** Jurnalga akkaunt nomini yozish uchun. */
    private readonly accountLabels: AccountLabels,
    /** Ochiq kvitansiya tekshiruvi bormi — javob ohangi shunga bog'liq. */
    private readonly paymentChecks: IPaymentCheckRepository,
    /** Chaqiruv narxi daftari — `npm run agent-cost` shundan o'qiydi. */
    private readonly usageLog: IAgentUsageRepository,
    /** Bayram kunlari — agent "bugun to'lang" demasligi uchun. */
    private readonly holidays: IHolidayRepository,
  ) {}

  /**
   * Model chaqiruvining narxini yozib qo'yadi.
   *
   * MODEL TUGAGAN ZAHOTI chaqiriladi — `apply()` dan ham, to'xtatish
   * tekshiruvidan ham OLDIN. Sabab: operator "To'xtatish"ni bosgan
   * bo'lsa javob mijozga ketmaydi, lekin tokenlar allaqachon sarflangan
   * va pul to'langan. Faqat yuborilgan javoblarni sanasak, hisob
   * haqiqiy xarajatdan past chiqardi va solishtiruv yolg'on bo'lardi.
   *
   * Yozuv yiqilsa navbat to'xtamaydi: narx daftari mijozga javob
   * berishdan muhimroq emas.
   */
  private async trackUsage(
    conversationId: string,
    mode: AgentUsageMode,
    output: AgentTurnOutput,
    /** Shu navbatda HAQIQATAN ishlatilgan dvigatel — narx shundan chiqadi. */
    ishlatilgan: TanlanganDvigatel,
  ): Promise<void> {
    const u = output.usage;
    if (!u) return;
    // `ClaudeAgentEngine` narxni o'zi hisoblab beradi (`costUsd` to'ldirilgan
    // keladi). `OpenAiAgentEngine` esa faqat tokenlarni qaytaradi — narx
    // panelda kiritilgan `llm_models` tarifidan shu yerda hisoblanadi.
    // `ishlatilgan.llmModel` standart yo'lda (Claude) doim `null`.
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
   * Shu suhbatda ketayotgan navbatlarni DARHOL uzadi.
   *
   * `reason` xato TURIGA aylanadi (`operator` → `AbortedError`,
   * `stale` → `StaleTurnError`). Yuqoridagi qatlamlar signalni ko'rmaydi,
   * faqat xatoni ko'radi — sabab esa ularga kerak: operatorga "agent
   * o'chirilgan" deb yozib qo'yish, aslida mijoz shunchaki yozishda davom
   * etganda, yolg'on bo'lardi.
   *
   * Operator "Agent" tugmasini o'chirganda chaqiriladi. Bazadagi bayroqning
   * o'zi kelasi navbatlarni to'xtatadi, lekin AYNAN SHU PAYT yozilayotgan
   * javobga ta'sir qilmasdi — u tugab, mijozga ketardi. Endi model
   * chaqiruvi yarim yo'lda uziladi va yozilgan matn yuborilmaydi.
   *
   * @returns nechta navbat uzilgani — jurnal uchun.
   */
  abort(conversationId: string, reason: AbortReason = 'operator'): number {
    const set = this.inFlight.get(conversationId);
    if (!set?.size) return 0;
    // Nusxa bo'yicha yuramiz: `abort()` `finally` ni uyg'otib, to'plamni
    // aylanish davomida o'zgartirishi mumkin.
    const count = set.size;
    for (const controller of [...set]) controller.abort(reason);
    log.info({ conversationId, count, reason }, 'Ketayotgan agent navbati to\'xtatildi');
    return count;
  }

  /**
   * Bitta navbatni reyestrga qo'yib bajaradi.
   *
   * `external` — ommaviy ishning "To'xtatish"i (birinchi murojaatda
   * beriladi). Ikkala manba ham bitta kontrollerga yig'iladi, shunda
   * quyidagi kod faqat bitta signalni biladi.
   *
   * Tinglovchi `finally` da olib tashlanadi: ommaviy ishda BITTA signal
   * yuzlab mijoz uchun ulashiladi va tozalanmasa tinglovchilar to'planib
   * qolardi.
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
      // Navbatni eskirgani uchun O'ZIMIZ uzdik — uzilishdan chiqqan
      // istalgan xato aynan shu qarorning natijasi. Xato turini shu
      // yerda almashtiramiz, chunki quyida `AbortedError` ni kim
      // otgani (model, SDK yoki quyidagi tekshiruvlar) muhim emas.
      if (controller.signal.aborted && controller.signal.reason === 'stale') {
        throw new StaleTurnError();
      }
      throw err;
    } finally {
      external?.removeEventListener('abort', forward);
      set.delete(controller);
      // Bo'sh to'plam qolmasin — uzoq ishlagan serverda ular sekin-asta
      // to'planib, xotirada suhbatlar ro'yxatini ushlab turardi.
      if (!set.size) this.inFlight.delete(conversationId);
    }
  }

  /**
   * Navbatni akkauntga biriktirilgan dvigatel bilan bajaradi; u yiqilsa
   * standart dvigatelga (Claude) qaytadi.
   *
   * Qaytish FAQAT bir marta va faqat standart bo'lmagan dvigateldan:
   * standart ham yiqilsa xato yuqoriga ketadi va suhbat odamga
   * topshiriladi — cheksiz urinish mijozni javobsiz ushlab turardi.
   *
   * `AbortedError` qaytishga sabab bo'lmaydi: u operator yoki tizim
   * navbatni ataylab to'xtatgani, qayta urinish uni bekor qilardi.
   */
  private async navbat<T>(
    conversation: Conversation,
    chaqir: (engine: IAgentEngine) => Promise<T>,
  ): Promise<{ output: T; ishlatilgan: TanlanganDvigatel; fallback: boolean }> {
    const account = conversation.telegramAccountId
      ? await this.accounts.findById(conversation.telegramAccountId)
      : null;

    // `forAccount` KUTILGAN holatlarni (model biriktirilmagan, o'chirilgan,
    // kalit yo'q) o'zi standart yo'lga buradi — ular xato OTMAYDI. Bu yerga
    // faqat OTILGAN xato yetadi: masalan `PgLlmModelRepository.findById`
    // bazaga bora olmadi yoki `LlmKaliti` ichidagi `decrypt()` buzuq
    // shifr/almashgan `ENCRYPTION_KEY` sababli yiqildi. Shuni ham
    // ushlamasak, butun navbat (va suhbat) shu joyda yiqilib, operatorga
    // topshirilardi — holbuki standart (Claude) dvigatel bilan baribir
    // javob berish mumkin edi.
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

  /**
   * Birinchi murojaat matnini yaratib yuboradi.
   *
   * `external` — ommaviy ish "To'xtatish"i. Faqat SHU vazifada bor: qolgan
   * uchtasi kiruvchi xabar yoki taymer bilan boshlanadi, ya'ni ommaviy
   * ishga aloqasi yo'q. Suhbat tugmasi esa to'rttasida ham ishlaydi —
   * u `withAbort` reyestri orqali keladi.
   */
  async firstContact(conversationId: string, external?: AbortSignal): Promise<AgentTurnResult> {
    // Butun navbat reyestrga qo'yiladi — ish BOSHLANISHIDAN oldin, aks
    // holda kontekst yig'ish paytida bosilgan tugma sezilmay qolardi.
    // Ichkarida faqat qo'shma `signal` ishlatiladi: ommaviy ishning
    // "To'xtatish"i ham, operator tugmasi ham unga yig'ilgan.
    return this.withAbort(conversationId, external, async (signal) => {
      const conversation = await this.requireConversation(conversationId);
      const { context, contractId } = await this.buildContext(conversation.clientId, conversation.createdAt);

      const knowledge = await this.buildKnowledge(conversation);
      const bayram = await this.bugungiBayram();

      this.events.publish({ type: 'agent.thinking', conversationId, on: true });
      try {
        const { output, ishlatilgan, fallback } = await this.navbat(conversation, (engine) =>
          engine.composeFirstContact({
            conversationId,
            clientId: conversation.clientId,
            contractId,
            stage: conversation.stage,
            conversationState: conversation.state,
            knowledge,
            context,
            history: [],
            sessionId: conversation.agentSessionId,
            signal,
            brokenPromise: null,
            bayram,
            openPromise: null,
            receiptPending: false,
            // Birinchi murojaatda sukut rejimi bo'lmaydi — bu maydon faqat 'nudge' da ma'noli.
            nudgeAttempt: null,
            nudgeLast: null,
            paymentReceived: null,
          }),
        );

        await this.trackUsage(conversationId, 'first', output, ishlatilgan);

        // Model tugagan, lekin `apply()` hali xabarni YUBORMAGAN — oxirgi
        // tekshiruv aynan shu tirqish uchun. Javob operator tugmani
        // bosishidan bir necha millisekund oldin tayyor bo'lishi mumkin;
        // shundan keyin yaratilgan matn mijozga YETIB BORMASLIGI kerak.
        if (signal.aborted) throw new AbortedError('Birinchi murojaat to\'xtatildi');

        // Yagona joy, xabar NOTANISH odamga ketadi — kunlik kvota shunga.
        return await this.apply(conversation, contractId, output, true, true, ishlatilgan, fallback);
      } finally {
        this.events.publish({ type: 'agent.thinking', conversationId, on: false });
      }
    });
  }

  /**
   * Kelishilgan kunning ertalabidagi yumshoq eslatma.
   *
   * Mijozdan yangi xabar kelmaydi — bu yagona joy, agent suhbatni O'ZI
   * boshlaydi (birinchi murojaatdan tashqari). Shu sababli bu yerda ham
   * `canAgentReply` tekshiriladi: operator qo'lga olgan yoki yakunlangan
   * suhbatga tizim o'zboshimchalik bilan yozmaydi.
   */
  async promiseReminder(conversationId: string, promise: PaymentPromise): Promise<AgentTurnResult> {
    return this.withAbort(conversationId, undefined, async (signal) => {
      const conversation = await this.requireConversation(conversationId);

      if (!canAgentReply(conversation)) {
        log.info({ conversationId, state: conversation.state }, 'Eslatma yuborilmadi (agent o\'chirilgan)');
        return { sent: false, reply: null, escalated: false, promiseRecorded: false };
      }

      // Bizni bloklagan mijozga eslatma yuborib bo'lmaydi: `USER_IS_BLOCKED`
      // qaytadi, xabar `failed` bo'lib qoladi va jurnalda shovqin to'planadi.
      // Tekshiruv AGENT CHAQIRUVIDAN oldin — model bekorga sarflanmasin.
      //
      // `canAgentReply` buni ushlamaydi: u suhbat holatiga qaraydi, bloklash
      // esa MIJOZDA belgilanadi.
      const client = await this.clients.findById(conversation.clientId);
      if (client?.telegramStatus === 'blocked' || client?.telegramStatus === 'deactivated') {
        log.info(
          { conversationId, clientId: client.id, holat: client.telegramStatus },
          'Eslatma yuborilmadi (mijoz bloklagan yoki akkaunti o\'chirilgan)',
        );
        return { sent: false, reply: null, escalated: false, promiseRecorded: false };
      }

      const runtime = await this.settings.get();
      const { context, contractId } = await this.buildContext(conversation.clientId, conversation.createdAt);

      // Qayd navbatni TO'XTATMAYDI: u operator uchun qo'shimcha ma'lumot,
      // mijozga ketadigan xabardan muhimroq emas.
      await this.qaydEtCrmFarqi(conversation, context, promise).catch((err) =>
        log.warn({ conversationId, err }, 'CRM farqi qaydi yozilmadi'),
      );

      const history = await this.messages.recentByConversation(conversationId, HISTORY_LIMIT);
      const knowledge = await this.buildKnowledge(conversation);
      const bayram = await this.bugungiBayram();

      this.events.publish({ type: 'agent.thinking', conversationId, on: true });
      try {
        const { output, ishlatilgan, fallback } = await this.navbat(conversation, (engine) =>
          engine.composePromiseReminder({
            conversationId,
            clientId: conversation.clientId,
            contractId,
            stage: conversation.stage,
            conversationState: conversation.state,
            knowledge,
            context,
            history: this.toHistory(history),
            sessionId: conversation.agentSessionId,
            signal,
            brokenPromise: null,
            bayram,
            openPromise: {
              amount: promise.amount,
              date: toIsoDate(promise.promisedDate) ?? '',
              paid: promise.paidAmount,
            },
            receiptPending: false,
            paymentReceived: null,
            // Va'da kunidagi eslatmada sukut rejimi bo'lmaydi — bu maydon faqat 'nudge' da ma'noli.
            nudgeAttempt: null,
            nudgeLast: null,
          }),
        );

        await this.trackUsage(conversationId, 'reminder', output, ishlatilgan);

        // Eslatma tayyor, lekin hali YUBORILMAGAN. Operator shu oraliqda
        // agentni o'chirgan bo'lsa — matn mijozga ketmasligi kerak.
        if (signal.aborted) throw new AbortedError('Va\'da eslatmasi to\'xtatildi');

        return await this.apply(conversation, contractId, output, runtime.agentAutoReply, false, ishlatilgan, fallback);
      } finally {
        this.events.publish({ type: 'agent.thinking', conversationId, on: false });
      }
    });
  }

  /**
   * Sukutdan keyingi qayta murojaat.
   *
   * `promiseReminder` bilan bir xil naqsh: mijozdan yangi xabar kelmaydi,
   * shuning uchun ruxsat va bloklash tekshiruvi AGENT CHAQIRUVIDAN
   * OLDIN — model bekorga sarflanmasin.
   *
   * Tekshiruv `canAgentReply` EMAS, `canAgentNudge`: buzilgan va'dali
   * suhbat `needs_human` ostida turadi va `canAgentReply` uni rad etardi,
   * ya'ni kuzatuvchi o'tkazgan nomzod aynan shu yerda yiqilardi.
   *
   * Buzilgan va'da bo'lsa prompt uni o'zi topib, boshqa ssenariy bandiga
   * o'tadi: shu sababli bu yerda ikki xil metod emas, bitta metod.
   */
  async silenceNudge(
    conversationId: string,
    attempt: number,
    /**
     * Shu urinish oxirgisimi — chegara (`silenceNudgeMax`) sozlamadan
     * keladi va uni faqat kuzatuvchi biladi. Prompt shu bayroqqa qarab
     * yopuvchi jumlani qo'shadi.
     */
    last: boolean,
  ): Promise<AgentTurnResult> {
    return this.withAbort(conversationId, undefined, async (signal) => {
      const conversation = await this.requireConversation(conversationId);

      if (!canAgentNudge(conversation)) {
        log.info(
          { conversationId, state: conversation.state },
          'Qayta murojaat yuborilmadi (agent o\'chirilgan)',
        );
        return { sent: false, reply: null, escalated: false, promiseRecorded: false };
      }

      // `findSilent` bu suhbatni allaqachon chetlaydi — bu poyga holati
      // uchun zaxira: nomzod tanlangandan keyin chek kelgan bo'lishi mumkin.
      const openCheck = await this.paymentChecks.findOpenByConversation(conversationId);
      if (chekJavobiHolati(openCheck, this.clock.now())) {
        log.info({ conversationId, checkId: openCheck?.id }, 'Chek tekshiruvda — qayta murojaat yo\'q');
        return { sent: false, reply: null, escalated: false, promiseRecorded: false };
      }

      const client = await this.clients.findById(conversation.clientId);
      if (client?.telegramStatus === 'blocked' || client?.telegramStatus === 'deactivated') {
        log.info(
          { conversationId, clientId: client.id, holat: client.telegramStatus },
          'Qayta murojaat yuborilmadi (mijoz bloklagan yoki akkaunti o\'chirilgan)',
        );
        return { sent: false, reply: null, escalated: false, promiseRecorded: false };
      }

      const runtime = await this.settings.get();
      const { context, contractId } = await this.buildContext(conversation.clientId, conversation.createdAt);
      const history = await this.messages.recentByConversation(conversationId, HISTORY_LIMIT);
      const active = await this.promises.findActiveByConversation(conversationId);
      const korinish = vadaKorinishi(active, this.clock.now());

      // Ochiq va'da yo'q bo'lsa, buzilgani bazadan alohida o'qiladi.
      //
      // NEGA: `findActiveByConversation` faqat `pending`/`partial` ni
      // qaytaradi. Va'dani `PromiseWatcher` `broken` qilgan zahoti u
      // "ochiq" bo'lmay qoladi va `vadaKorinishi` ikkala maydonni ham
      // NULL beradi — ya'ni promptga hech qanday va'da tushmaydi va agent
      // so'zini buzgan mijozga "xabarimni ko'rdingizmi?" deb yozadi.
      // Aynan shu — bu funksiya chiqarishi mumkin bo'lgan eng qimmat xato.
      //
      // `findLatestByConversation` HOLATIDAN qat'iy nazar ENG OXIRGI
      // va'dani qaytaradi (izohiga qarang). "Buzilgan" ssenariysi shu
      // yerda, o'qishdan KEYIN tekshiriladi: faqat ENG OXIRGI va'da ham
      // `broken` bo'lsagina ishlatiladi. Aks holda (masalan, iyunda
      // buzilib, avgustda yangisi bajarilgan bo'lsa) `brokenPromise` NULL
      // qoladi — mijoz eskirgan, allaqachon yopilgan da'vo bilan
      // ayblanmasligi kerak.
      //
      // `openPromise` bu yerda TO'LDIRILMAYDI: ochiq va'dasi bor mijozga
      // kuzatuvchi baribir yozmaydi, ikkalasini birga berish esa
      // `vadaKorinishi` ataylab yopgan ziddiyatni qaytarardi.
      let broken = korinish.broken;
      if (!broken && !korinish.open) {
        const oxirgi = await this.promises.findLatestByConversation(conversationId);
        if (oxirgi && oxirgi.status === 'broken') {
          broken = { amount: oxirgi.amount, date: toIsoDate(oxirgi.promisedDate) ?? '' };
        }
      }

      const knowledge = await this.buildKnowledge(conversation);
      const bayram = await this.bugungiBayram();

      this.events.publish({ type: 'agent.thinking', conversationId, on: true });
      try {
        const { output, ishlatilgan, fallback } = await this.navbat(conversation, (engine) =>
          engine.composeSilenceNudge({
            conversationId,
            clientId: conversation.clientId,
            contractId,
            stage: conversation.stage,
            conversationState: conversation.state,
            knowledge,
            context,
            history: this.toHistory(history),
            sessionId: conversation.agentSessionId,
            signal,
            brokenPromise: broken,
            bayram,
            openPromise: korinish.open,
            receiptPending: false,
            paymentReceived: null,
            nudgeAttempt: attempt,
            nudgeLast: last,
          }),
        );

        await this.trackUsage(conversationId, 'nudge', output, ishlatilgan);

        if (signal.aborted) throw new AbortedError('Qayta murojaat to\'xtatildi');

        return await this.apply(conversation, contractId, output, runtime.agentAutoReply, false, ishlatilgan, fallback);
      } finally {
        this.events.publish({ type: 'agent.thinking', conversationId, on: false });
      }
    });
  }

  /**
   * Yangi oylik to'lov sanasi kelganda eslatma (`OylikEslatmaWatcher`).
   *
   * `silenceNudge` bilan bir xil naqsh: mijozdan yangi xabar kelmaydi,
   * shuning uchun ruxsat, chek va bloklash tekshiruvi model chaqiruvidan
   * OLDIN. `canAgentReply` — buzilgan va'dali (`needs_human`) suhbatga
   * oylik eslatma yozilmaydi: u yerda operator bor.
   */
  async monthlyReminder(conversationId: string, malumot: OylikEslatmaMalumoti): Promise<AgentTurnResult> {
    return this.withAbort(conversationId, undefined, async (signal) => {
      const yoq = { sent: false, reply: null, escalated: false, promiseRecorded: false };
      const conversation = await this.requireConversation(conversationId);

      if (!canAgentReply(conversation)) {
        log.info({ conversationId, state: conversation.state }, 'Oylik eslatma yuborilmadi (agent o\'chirilgan)');
        return yoq;
      }

      const openCheck = await this.paymentChecks.findOpenByConversation(conversationId);
      if (chekJavobiHolati(openCheck, this.clock.now())) {
        log.info({ conversationId, checkId: openCheck?.id }, 'Chek tekshiruvda — oylik eslatma yo\'q');
        return yoq;
      }

      const client = await this.clients.findById(conversation.clientId);
      if (client?.telegramStatus === 'blocked' || client?.telegramStatus === 'deactivated') {
        log.info({ conversationId, clientId: client.id }, 'Oylik eslatma yuborilmadi (mijoz bloklagan)');
        return yoq;
      }

      const runtime = await this.settings.get();
      const { context, contractId } = await this.buildContext(conversation.clientId, conversation.createdAt);
      const history = await this.messages.recentByConversation(conversationId, HISTORY_LIMIT);

      const knowledge = await this.buildKnowledge(conversation);
      const bayram = await this.bugungiBayram();

      this.events.publish({ type: 'agent.thinking', conversationId, on: true });
      try {
        const { output, ishlatilgan, fallback } = await this.navbat(conversation, (engine) =>
          engine.composeMonthlyReminder({
            conversationId,
            clientId: conversation.clientId,
            contractId,
            stage: conversation.stage,
            conversationState: conversation.state,
            knowledge,
            context,
            history: this.toHistory(history),
            sessionId: conversation.agentSessionId,
            signal,
            brokenPromise: null,
            bayram,
            openPromise: null,
            receiptPending: false,
            paymentReceived: null,
            // Oylik eslatmada sukut rejimi bo'lmaydi — bu maydon faqat 'nudge' da ma'noli.
            nudgeAttempt: null,
            nudgeLast: null,
            oylikEslatma: malumot,
          }),
        );

        await this.trackUsage(conversationId, 'oylik_eslatma', output, ishlatilgan);

        if (signal.aborted) throw new AbortedError('Oylik eslatma to\'xtatildi');

        return await this.apply(conversation, contractId, output, runtime.agentAutoReply, false, ishlatilgan, fallback);
      } finally {
        this.events.publish({ type: 'agent.thinking', conversationId, on: false });
      }
    });
  }

  /**
   * Kelib tushgan to'lov uchun rahmat.
   *
   * `promiseReminder` bilan bir xil naqsh: mijozdan yangi xabar kelmaydi,
   * shuning uchun `canAgentReply` tekshiriladi — operator qo'lga olgan
   * yoki yakunlangan suhbatga tizim o'zboshimchalik bilan yozmaydi.
   */
  async paymentThanks(
    conversationId: string,
    /**
     * Ochiq va'da. NULL — mijoz va'da bermasdan to'lagan va to'lovi
     * kvitansiya orqali tasdiqlangan: solishtiradigan kelishuv yo'q.
     */
    promise: PaymentPromise | null,
    received: NonNullable<AgentTurnInput['paymentReceived']>,
  ): Promise<AgentTurnResult> {
    return this.withAbort(conversationId, undefined, async (signal) => {
      const conversation = await this.requireConversation(conversationId);

      if (!canAgentReply(conversation)) {
        log.info({ conversationId, state: conversation.state }, 'Rahmat yuborilmadi (agent o\'chirilgan)');
        return { sent: false, reply: null, escalated: false, promiseRecorded: false };
      }

      const runtime = await this.settings.get();
      const { context, contractId } = await this.buildContext(conversation.clientId, conversation.createdAt);

      // Va'da NULL bo'lsa solishtiradigan kelishuv yo'q: mijoz va'dasiz
      // to'lagan va rahmat kvitansiya bo'yicha aytilyapti.
      if (promise) {
        await this.qaydEtCrmFarqi(conversation, context, promise).catch((err) =>
          log.warn({ conversationId, err }, 'CRM farqi qaydi yozilmadi'),
        );
      }

      const history = await this.messages.recentByConversation(conversationId, HISTORY_LIMIT);

      const knowledge = await this.buildKnowledge(conversation);
      const bayram = await this.bugungiBayram();

      this.events.publish({ type: 'agent.thinking', conversationId, on: true });
      try {
        const { output, ishlatilgan, fallback } = await this.navbat(conversation, (engine) =>
          engine.composePaymentThanks({
            conversationId,
            clientId: conversation.clientId,
            contractId,
            stage: conversation.stage,
            conversationState: conversation.state,
            knowledge,
            context,
            history: this.toHistory(history),
            sessionId: conversation.agentSessionId,
            signal,
            brokenPromise: null,
            bayram,
            openPromise: promise
              ? {
                  amount: promise.amount,
                  date: toIsoDate(promise.promisedDate) ?? '',
                  paid: promise.paidAmount,
                }
              : null,
            receiptPending: false,
            paymentReceived: received,
            // Rahmat xabarida sukut rejimi bo'lmaydi — bu maydon faqat 'nudge' da ma'noli.
            nudgeAttempt: null,
            nudgeLast: null,
          }),
        );

        await this.trackUsage(conversationId, 'thanks', output, ishlatilgan);

        // Rahmat matni tayyor, lekin hali YUBORILMAGAN — o'chirilgan agent
        // nomidan mijozga hech narsa ketmasligi kerak.
        if (signal.aborted) throw new AbortedError('To\'lov uchun rahmat to\'xtatildi');

        return await this.apply(conversation, contractId, output, runtime.agentAutoReply, false, ishlatilgan, fallback);
      } finally {
        this.events.publish({ type: 'agent.thinking', conversationId, on: false });
      }
    });
  }

  /**
   * Operator chekni tasdiqladi ("To'lov qabul qilindi") — rahmat.
   *
   * `paymentThanks` bilan bir xil naqsh: mijozdan yangi xabar kelmaydi,
   * shuning uchun `canAgentReply` tekshiriladi. Tugmani operator o'zi
   * bosgani uchun xabar `agentAutoReply` ga qaramay DARHOL yuboriladi
   * (`operatorTurn` dagidek).
   */
  async receiptConfirmedThanks(
    conversationId: string,
    confirmed: NonNullable<AgentTurnInput['receiptConfirmed']>,
  ): Promise<AgentTurnResult> {
    return this.withAbort(conversationId, undefined, async (signal) => {
      const conversation = await this.requireConversation(conversationId);

      if (!canAgentReply(conversation)) {
        log.info(
          { conversationId, state: conversation.state },
          'Chek tasdig\'i uchun rahmat yuborilmadi (agent o\'chirilgan yoki suhbat yakunlangan)',
        );
        return { sent: false, reply: null, escalated: false, promiseRecorded: false };
      }

      const { context, contractId } = await this.buildContext(conversation.clientId, conversation.createdAt);
      const history = await this.messages.recentByConversation(conversationId, HISTORY_LIMIT);
      const knowledge = await this.buildKnowledge(conversation);
      const bayram = await this.bugungiBayram();

      this.events.publish({ type: 'agent.thinking', conversationId, on: true });
      try {
        const { output, ishlatilgan, fallback } = await this.navbat(conversation, (engine) =>
          engine.composeReceiptConfirmed({
            conversationId,
            clientId: conversation.clientId,
            contractId,
            stage: conversation.stage,
            conversationState: conversation.state,
            knowledge,
            context,
            history: this.toHistory(history),
            sessionId: conversation.agentSessionId,
            signal,
            brokenPromise: null,
            bayram,
            openPromise: null,
            receiptPending: false,
            receiptReview: null,
            receiptConfirmed: confirmed,
            paymentReceived: null,
            // Rahmat xabarida sukut rejimi bo'lmaydi — bu maydon faqat 'nudge' da ma'noli.
            nudgeAttempt: null,
            nudgeLast: null,
          }),
        );

        // Narx daftarida rahmat bilan bir qatorda: `agent_usage.mode`
        // CHECK'i yangi qiymatni bilmaydi va bu baribir rahmat xabari.
        await this.trackUsage(conversationId, 'thanks', output, ishlatilgan);

        if (signal.aborted) throw new AbortedError('Chek tasdig\'i uchun rahmat to\'xtatildi');

        return await this.apply(conversation, contractId, output, true, false, ishlatilgan, fallback);
      } finally {
        this.events.publish({ type: 'agent.thinking', conversationId, on: false });
      }
    });
  }

  /**
   * Operator topshirig'i bo'yicha xabar.
   *
   * Topshiriq bu yerga PARAMETR bo'lib emas, tarixdagi qayd bo'lib keladi:
   * `InstructAgentUseCase` uni avval bazaga yozadi. Shunda ishlatilgan
   * matn aynan operator chatda ko'rgan qayd bo'ladi, keyingi javoblarda esa
   * agent o'sha maqsadni tarixdan ko'raveradi.
   *
   * Xabar `agentAutoReply` ga qaramay DARHOL yuboriladi: tugmani operator
   * o'zi bosgan, ya'ni tasdiq allaqachon berilgan.
   */
  async operatorTurn(conversationId: string): Promise<AgentTurnResult> {
    return this.withAbort(conversationId, undefined, async (signal) => {
      const conversation = await this.requireConversation(conversationId);

      if (!canAgentReply(conversation)) {
        log.info(
          { conversationId, state: conversation.state },
          'Operator topshirig\'i bajarilmadi (agent o\'chirilgan yoki suhbat yakunlangan)',
        );
        return { sent: false, reply: null, escalated: false, promiseRecorded: false };
      }

      const history = await this.messages.recentByConversation(conversationId, HISTORY_LIMIT);
      const topshiriq = [...history]
        .reverse()
        .find((m) => m.direction === 'note' && !hisobQaydimi(m));
      if (!topshiriq) {
        log.warn({ conversationId }, 'Operator topshirig\'i tarixda topilmadi');
        return { sent: false, reply: null, escalated: false, promiseRecorded: false };
      }

      const { context, contractId } = await this.buildContext(conversation.clientId, conversation.createdAt);
      const active = await this.promises.findActiveByConversation(conversationId);
      const korinish = vadaKorinishi(active, this.clock.now());

      // `silenceNudge` dagi sabab bilan: `broken` bo'lgan va'da "ochiq" emas
      // va `vadaKorinishi` uni ko'rmaydi. Operator esa aynan shu holatda eng
      // ko'p yozadi — agent buzilgan va'dani bilmay "xabarimni ko'rdingizmi"
      // deb yozib qo'ymasin.
      let broken = korinish.broken;
      if (!broken && !korinish.open) {
        const oxirgi = await this.promises.findLatestByConversation(conversationId);
        if (oxirgi && oxirgi.status === 'broken') {
          broken = { amount: oxirgi.amount, date: toIsoDate(oxirgi.promisedDate) ?? '' };
        }
      }
      const openCheck = await this.paymentChecks.findOpenByConversation(conversationId);
      const receiptReview = chekJavobiHolati(openCheck, this.clock.now());
      const knowledge = await this.buildKnowledge(conversation);
      const bayram = await this.bugungiBayram();

      this.events.publish({ type: 'agent.thinking', conversationId, on: true });
      try {
        const { output, ishlatilgan, fallback } = await this.navbat(conversation, (engine) =>
          engine.composeOperatorTurn({
            conversationId,
            clientId: conversation.clientId,
            contractId,
            stage: conversation.stage,
            conversationState: conversation.state,
            knowledge,
            context,
            history: this.toHistory(history),
            sessionId: conversation.agentSessionId,
            signal,
            brokenPromise: broken,
            bayram,
            openPromise: korinish.open,
            receiptPending: openCheck?.kind === 'crm_watch',
            receiptReview,
            paymentReceived: null,
            // Operator topshirig'ida sukut rejimi bo'lmaydi — bu maydon faqat 'nudge' da ma'noli.
            nudgeAttempt: null,
            nudgeLast: null,
            operatorInstruction: readableBody(topshiriq),
          }),
        );

        await this.trackUsage(conversationId, 'operator', output, ishlatilgan);

        if (signal.aborted) throw new AbortedError('Operator topshirig\'i to\'xtatildi');

        const result = await this.apply(conversation, contractId, output, true, false, ishlatilgan, fallback);
        // Chekka hali javob berilmagan edi (kill switch, eskalatsiya yoki
        // agent xatosi paytida kelgan) — topshiriq qoidasi agentga chekni
        // olganini aytishni buyurdi. Belgi qo'yiladi, lekin suhbat qayta
        // operatorga CHIQARILMAYDI: operator uni hozirgina agentga qaytardi.
        if (receiptReview === 'new' && openCheck && result.sent) {
          await this.paymentChecks.markAcknowledged(openCheck.id, this.clock.now());
        }
        return result;
      } finally {
        this.events.publish({ type: 'agent.thinking', conversationId, on: false });
      }
    });
  }

  /** Mijozning kiruvchi xabariga javob beradi. */
  async reply(conversationId: string, incoming: string): Promise<AgentTurnResult> {
    return this.withAbort(conversationId, undefined, async (signal) => {
      const conversation = await this.requireConversation(conversationId);

      if (!canAgentReply(conversation)) {
        log.info({ conversationId, state: conversation.state }, 'Agent javob bermadi (o\'chirilgan yoki yakunlangan)');
        return { sent: false, reply: null, escalated: false, promiseRecorded: false };
      }

      const runtime = await this.settings.get();

      // To'lovga aloqasi yo'q topshiriq (masala, kod, tarjima) — modelni
      // umuman chaqirmaymiz. Qoida sifatida uch marta yozib ko'rildi
      // (114-116 migratsiyalari), model arzimas hisobni ("5+9") baribir
      // yechib berardi: rad etish unga mantiqsiz tuyuladi.
      //
      // Qo'lda tasdiqlash rejimida va global to'xtatishda qo'riqchi
      // ISHLAMAYDI — u yerda javobni operator hal qiladi.
      const tashqari = runtime.agentAutoReply && !runtime.killSwitch
        ? mavzudanTashqari(incoming)
        : { tashqarimi: false as const, sabab: undefined };
      if (tashqari.tashqarimi) {
        // Ketma-ket sinovda bir xil jumlani qaytarib turmaymiz — bir marta
        // aytilgan, mijoz eshitgan.
        const oxirgilar = await this.messages.recentByConversation(conversationId, 4);
        const oxirgiChiquvchi = [...oxirgilar].reverse().find((m) => m.direction === 'out');
        if (oxirgiChiquvchi?.meta?.guard === 'mavzudan_tashqari') {
          log.info({ conversationId, sabab: tashqari.sabab }, 'Mavzudan tashqari — takroran javob berilmadi');
          return { sent: false, reply: null, escalated: false, promiseRecorded: false };
        }

        await this.dispatcher.send({
          conversation,
          body: TASHQARI_JAVOBI,
          author: 'agent',
          simulateTyping: true,
          meta: { guard: 'mavzudan_tashqari', sabab: tashqari.sabab },
        });
        log.info({ conversationId, sabab: tashqari.sabab }, 'Mavzudan tashqari topshiriq — model chaqirilmadi');
        return { sent: true, reply: TASHQARI_JAVOBI, escalated: false, promiseRecorded: false };
      }

      const { context, contractId } = await this.buildContext(conversation.clientId, conversation.createdAt);
      const history = await this.messages.recentByConversation(conversationId, HISTORY_LIMIT);
      const active = await this.promises.findActiveByConversation(conversationId);
      // To'lov tekshiruvi ochiq bo'lsa agent "to'lovingiz tushdi" ham,
      // "qachon to'laysiz" ham deya olmaydi — natijani kutamiz. Da'vo
      // kuzatuvi (`receiptPending`) va chek (`receiptReview`) boshqa-boshqa
      // qoida oladi.
      const openCheck = await this.paymentChecks.findOpenByConversation(conversationId);
      const receiptReview = chekJavobiHolati(openCheck, this.clock.now());
      const now = this.clock.now();
      const korinish = vadaKorinishi(active, now);
      const knowledge = await this.buildKnowledge(conversation);
      const bayram = await this.bugungiBayram();

      this.events.publish({ type: 'agent.thinking', conversationId, on: true });
      try {
        const { output, ishlatilgan, fallback } = await this.navbat(conversation, (engine) =>
          engine.respond({
            conversationId,
            clientId: conversation.clientId,
            contractId,
            stage: conversation.stage,
            conversationState: conversation.state,
            knowledge,
            context,
            history: this.toHistory(history),
            incoming,
            sessionId: conversation.agentSessionId,
            signal,
            brokenPromise: korinish.broken,
            bayram,
            openPromise: korinish.open,
            receiptPending: openCheck?.kind === 'crm_watch',
            receiptReview,
            paymentReceived: null,
            // Mijoz xabariga javobda sukut rejimi bo'lmaydi — bu maydon faqat 'nudge' da ma'noli.
            nudgeAttempt: null,
            nudgeLast: null,
          }),
        );

        await this.trackUsage(conversationId, 'reply', output, ishlatilgan);

        // Javob tayyor, lekin `apply()` uni hali YUBORMAGAN. Tekshiruv
        // quyidagi va'da yozuvidan ham OLDIN: navbat uzilayotgan bo'lsa,
        // hech qachon yuborilmaydigan javob uchun bazada holat
        // o'zgartirilmasligi kerak.
        if (signal.aborted) throw new AbortedError('Mijoz xabariga javob to\'xtatildi');

        // Model soniyalab ishlaydi. Shu orada mijoz yana yozgan bo'lsa,
        // tayyor matn ALLAQACHON ESKIRGAN: u bir-ikki xabar oldingi
        // savolga javob beradi. Uni yuborsak, buferdagi yangi xabarlar
        // uchun keyingi navbat o'sha tasdiqni va o'sha savolni qaytadan
        // yozadi — mijoz ketma-ket ikkita bir xil xabar oladi.
        //
        // Odatda bunga yetib kelmaymiz: `push()` navbatni shu zahoti
        // uzadi. Bu — oxirgi to'siq, uzilish kech qolgan holat uchun
        // (model uzilishni sezmay javobni qaytarib ulgurgan bo'lsa).
        //
        // Shart AYNAN bufer bo'yicha: buferda xabar borligi keyingi
        // navbat albatta bo'lishini kafolatlaydi. Javob talab
        // qilmaydigan xabarga qarab tashlasak, o'rniga hech narsa
        // kelmasdi va mijoz umuman javobsiz qolardi.
        //
        // Holat ham, sessiya ham saqlanmaydi: yuborilmagan javob suhbat
        // uchun umuman bo'lmagan hisoblanadi.
        if (this.pending?.hasPending(conversationId)) {
          log.info({ conversationId }, 'Javob eskirdi — yangi xabar kutmoqda, yuborilmadi');
          return { sent: false, reply: null, escalated: false, promiseRecorded: false };
        }

        // Chek qoidasi bilan yozilgan javob ham eskirishi mumkin: model
        // ishlayotganda operator "To'lov qabul qilindi" tugmasini bosgan
        // bo'lsa, mijoz rahmatdan keyin "Chekni oldim… tekshirib chiqadi" ni
        // olardi. Tugma o'z rahmatini yozadi — bu javob yuborilmaydi.
        if (receiptReview && openCheck) {
          const hozirgi = await this.paymentChecks.findOpenByConversation(conversationId);
          const ochiq = hozirgi?.id === openCheck.id && hozirgi.kind === 'receipt_review' && hozirgi.status === 'reviewing';
          if (!ochiq) {
            log.info(
              { conversationId, checkId: openCheck.id },
              'Javob eskirdi — chek tekshiruvi shu orada yopildi, yuborilmadi',
            );
            return { sent: false, reply: null, escalated: false, promiseRecorded: false };
          }
        }

        // Buzilgan va'dani yopamiz — yangi va'da o'rniga keladi. Qisman
        // to'langani `recordPromise` da "cancelled" bo'lib yopiladi:
        // pul kelgan va'dani "buzilgan" deb yozish hisobotni buzardi.
        if (korinish.broken && output.promise && active) {
          await this.promises.updateStatus(active.id, 'broken');
        }

        const result = await this.apply(conversation, contractId, output, runtime.agentAutoReply, false, ishlatilgan, fallback);
        if (receiptReview === 'new' && openCheck) await this.chekQabulQilindi(conversation.id, openCheck, result);
        return result;
      } finally {
        this.events.publish({ type: 'agent.thinking', conversationId, on: false });
      }
    });
  }

  /**
   * Agent chekka birinchi marta javob berdi — endi operator navbati.
   *
   * Javobdan KEYIN qo'yiladi: oldin qo'yilsa `canAgentReply` yopilib,
   * mijoz "Chekni oldim" ni umuman olmasdi. Agent yiqilsa bu yerga
   * yetilmaydi — `agent_error` eskalatsiyasi ishlaydi, `acknowledged_at`
   * bo'sh qoladi va keyingi javob yana `'new'` bo'ladi.
   *
   * Agent o'zi boshqa sabab bilan eskalatsiya qilgan bo'lsa, uning sababi
   * ustidan yozilmaydi — operator baribir suhbatni ochadi va tugmani ko'radi.
   */
  private async chekQabulQilindi(
    conversationId: string,
    check: PaymentCheck,
    result: AgentTurnResult,
  ): Promise<void> {
    // Belgi yozilmadi — tekshiruv shu orada yopilgan (tugma yoki suhbat
    // yopildi). Ochiq tekshiruvsiz eskalatsiya operatorga bo'sh ish bo'lardi.
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
    // Ichki hisob qaydi promptga TUSHMAYDI (`hisobQaydimi` izohiga qarang).
    return messages.filter((m) => !hisobQaydimi(m)).map((m) => ({
      // `note` — operatorning topshirig'i: agent uni ko'radi, lekin o'z
      // xabari deb emas (salomlashuv hisobi va prompt qatori shunga bog'liq).
      role:
        m.direction === 'in'
          ? ('client' as const)
          : m.direction === 'note'
            ? ('operator' as const)
            : ('agent' as const),
      // Ovozli xabar bo'lsa — uning transkripti ko'rsatiladi.
      text: readableBody(m),
      at: m.createdAt,
      // O'chirish tahrirdan USTUN: o'chirilgan xabar tahrirlangan ham
      // bo'lishi mumkin, lekin mijozda undan hech narsa qolmagan.
      holat: m.revokedAt ? ('ochirilgan' as const) : m.editedAt ? ('tuzatilgan' as const) : undefined,
    }));
  }

  /** Akkauntning uslub versiyasi; akkaunt yo'q bo'lsa — v1. */
  private async uslubi(conversation: Conversation): Promise<StyleVersion> {
    if (!conversation.telegramAccountId) return 'v1';
    const account = await this.accounts.findById(conversation.telegramAccountId);
    return account?.styleVersion ?? 'v1';
  }

  /** Model natijasini bazaga va Telegramga qo'llaydi. */
  private async apply(
    conversation: Conversation,
    contractId: string | null,
    output: AgentTurnOutput,
    autoSend = true,
    /** Birinchi murojaatgina kunlik kvotani sarflaydi. */
    coldOutreach = false,
    /** Shu navbatda HAQIQATAN ishlatilgan dvigatel — `llmTamgasi` shundan yozadi. */
    ishlatilgan?: TanlanganDvigatel,
    fallback = false,
  ): Promise<AgentTurnResult> {
    let sent = false;
    // Tamg'a shu yerda o'qiladi: `apply` `buildKnowledge` dan alohida
    // chaqiriladi, shuning uchun uslubni o'zi so'raydi (pastdagi `uslubi`).
    const style = await this.uslubi(conversation);

    if (output.reply) {
      // `ishlatilgan` HAR DOIM keladi — sakkiz chaqiruvchi ham `navbat(...)`
      // orqali o'tadi. Standart qiymat faqat tur xavfsizligi uchun; ishlatilsa
      // ham (`?? this.engines.standart()`), tamg'a "standart" deb yozadi va bu
      // hisobotda darhol ko'zga tashlanadi — qaysi chaqiruv `navbat`ni
      // chetlab o'tganini topish oson bo'ladi.
      //
      // `output.reply` YO'Q bo'lganda BUTUNLAY hisoblanmaydi (shart ICHIGA
      // ko'chirilgan): `this.engines` bu holatlarda umuman kerak emas —
      // masalan `apply()` to'g'ridan-to'g'ri (`navbat`siz) sinaladigan
      // testlarda `engines` to'ldirilmagan bo'lishi mumkin, javob esa yo'q.
      const dvigatel = ishlatilgan ?? this.engines.standart();

      if (autoSend) {
        await this.dispatcher.send({
          conversation,
          body: output.reply,
          author: 'agent',
          simulateTyping: true,
          coldOutreach,
          meta: llmTamgasi(uslubTamgasi({ note: output.internalNote, model: true }, style), dvigatel, fallback),
        });
        sent = true;

        // Uzun javob ikkiga bo'lingan — ikkinchi qismi alohida xabar bo'lib ketadi.
        // Orasida qisqa pauza: odam yozayotgandek ko'rinsin.
        //
        // Ikkinchi qism kvotani QAYTA sarflamaydi va u bilan cheklanmaydi:
        // bu bitta murojaatning davomi. Aks holda kvota aynan shu yerda
        // tugab, mijoz yarim xabar olib qolishi mumkin edi.
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
          meta: llmTamgasi(uslubTamgasi({ note: output.internalNote }, style), dvigatel, fallback),
        });
        this.events.publish({
          type: 'message.created',
          conversationId: conversation.id,
          messageId: draft.id,
        });
      }
    }

    const promiseRecorded = output.promise ? await this.recordPromise(conversation, contractId, output) : false;

    await this.captureMemory(conversation, output);

    if (output.paymentClaim) this.watchPaymentClaim(conversation.id);

    const escalated = Boolean(output.escalate);
    const nextState: ConversationState | undefined =
      output.nextState && VALID_STATES.has(output.nextState)
        ? (output.nextState as ConversationState)
        : undefined;

    await this.conversations.update(conversation.id, {
      ...(nextState ? { state: escalated ? 'escalated' : nextState } : {}),
      ...(escalated ? { needsHuman: true, humanReason: output.escalate?.reason ?? null } : {}),
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
        payload: { reason: output.escalate?.reason },
      });
    }

    return { sent, reply: output.reply, escalated, promiseRecorded };
  }

  /**
   * Va'dani qayd qiladi.
   *
   * Agent kelishuvdan keyingi xabarlarda ham o'sha va'dani qaytaraveradi —
   * u suhbat tarixida ko'rinib turadi. Shuning uchun bir xil va'dani qayta
   * yozmaymiz, o'zgargan bo'lsa esa eskisini bekor qilib, yangisini yozamiz.
   */
  private async recordPromise(
    conversation: Conversation,
    contractId: string | null,
    output: AgentTurnOutput,
  ): Promise<boolean> {
    const promise = output.promise;
    if (!promise) return false;

    const promisedDate = new Date(`${promise.promisedDate}T00:00:00Z`);
    if (Number.isNaN(promisedDate.getTime()) || promise.amount <= 0) return false;

    const active = await this.promises.findActiveByConversation(conversation.id);

    if (active) {
      const sameDate = toIsoDate(active.promisedDate) === promise.promisedDate;
      const sameAmount = Math.abs(active.amount - promise.amount) < 1;
      if (sameDate && sameAmount) return false; // o'sha va'da — qayta yozmaymiz

      // Kelishuv o'zgardi: eskisini yopamiz.
      await this.promises.updateStatus(active.id, 'cancelled');
    }

    await this.promises.create({
      conversationId: conversation.id,
      clientId: conversation.clientId,
      contractId,
      amount: promise.amount,
      promisedDate,
      quote: promise.quote,
    });

    await this.audit.record({
      actor: 'agent',
      action: active ? 'promise.updated' : 'promise.recorded',
      entity: 'conversation',
      entityId: conversation.id,
      payload: { amount: promise.amount, date: promise.promisedDate },
    });

    return true;
  }

  /** Bugun bayram bo'lsa — agent uchun tayyorlangan ma'lumot. */
  private async bugungiBayram(): Promise<AgentTurnInput['bayram']> {
    const bayramlar = await this.holidays.list();
    const bugun = this.clock.todayIso();
    const bayram = bayramKuni(bugun, bayramlar);
    if (!bayram) return null;

    const runtime = await this.settings.get();
    return {
      name: bayram.name,
      endsOn: bayram.endsOn,
      keyingiIshKuni: ishKuniga(bayram.endsOn, bayramlar, runtime.weekdays),
    };
  }

  /**
   * Qoidalar, saboqlar, mijoz xotirasi va agent ismini bazadan yig'adi.
   *
   * Ism suhbatning Telegram akkauntidan olinadi: mijoz uchun har raqam
   * alohida odam bo'lib ko'rinadi. Akkaunt topilmasa yoki unda ism
   * ko'rsatilmagan bo'lsa — umumiy sozlamadagi ism.
   */
  private async buildKnowledge(conversation: Conversation): Promise<AgentKnowledgeBlocks> {
    // Uslub akkauntdan kelishi kerak, shuning uchun avval o'shani o'qiymiz —
    // qolganlari baribir shu Promise.all ichida ketardi, qo'shimcha
    // kechikish yo'q.
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
    };
  }

  /**
   * Agent o'rgangan narsalarni saqlaydi.
   * Saboq DARHOL promptga tushmaydi — avval operator tasdiqlashi kerak,
   * aks holda agent o'zining tasodifiy xulosasini qoida qilib olib ketardi.
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

    // Alohida saqlanadi: agent clientMemory'ni null qaytarib, suhbatdoshni
    // aytishi mumkin — ular bir-biriga bog'liq emas.
    if (output.interlocutor) {
      await this.profiles
        .upsert(conversation.clientId, { interlocutor: output.interlocutor })
        .catch((err) => log.warn({ err }, 'Suhbatdoshni saqlab bo\'lmadi'));
    }
  }

  /**
   * CRM raqami va'da qoldig'idan farq qilsa — suhbatga ichki qayd.
   *
   * Mijozga CRM raqami aytiladi, va'da yozuvi esa O'ZGARMAYDI: unda
   * mijozning o'zi aytgan kelishuvi turadi va uni "to'g'rilash" mijoz
   * hech qachon aytmagan gapni unga yozib qo'yish bo'lardi.
   *
   * Farq odatda bitta to'lovning ikki marta sanalishidan chiqadi
   * (`vadaTolovi.ts` dagi oyna qoidasi). Uni operator ko'rishi kerak,
   * lekin mijozga hech narsa ketmasligi kerak — shuning uchun `note`:
   * bu yo'nalish Telegramga umuman chiqmaydi.
   *
   * Operatorga alohida xabar yuborilmaydi va suhbat operatorga
   * chiqarilmaydi: mijozga to'g'ri raqam allaqachon ketyapti, ya'ni
   * kutib turadigan ish yo'q.
   */
  private async qaydEtCrmFarqi(
    conversation: Conversation,
    context: AgentDebtContext,
    promise: PaymentPromise,
  ): Promise<void> {
    // Va'daning ochiq qoldig'i: kelishilgan summadan va'dadan KEYIN
    // kelgan to'lov ayiriladi. Manfiy bo'lsa nol — mijoz kelishilganidan
    // ko'p to'lagan.
    const qoldiq = Math.max(0, promise.amount - promise.paidAmount);

    // Va'da shartnomaga bog'langan bo'lsa — aynan o'sha shartnomaning
    // raqami bilan solishtiriladi. Bog'lanmagan eski yozuvlarda mijozning
    // jami kechikkan summasi olinadi: prompt ham aynan shu yig'indini
    // ko'radi.
    const shartnoma = promise.contractId ? await this.contracts.findById(promise.contractId) : null;
    const crm = shartnoma ? kechikkanSumma([shartnoma]) : context.debtSum;
    const nomer = shartnoma?.contractNo ?? context.contracts.map((c) => c.contractNo).join(', ');

    // 1 so'mdan kichik farq — yaxlitlash, qayd qilinmaydi.
    if (Math.abs(crm - qoldiq) < 1) return;

    const som = (n: number): string => `${n.toLocaleString('ru-RU')} so'm`;
    const qayd = await this.messages.create({
      conversationId: conversation.id,
      direction: 'note',
      author: 'system',
      body:
        `${nomer}: CRM bo'yicha ${som(crm)}, va'da qoldig'i ${som(qoldiq)}. ` +
        "Mijozga CRM raqami aytiladi, va'da yozuvi o'zgarmadi.",
      // `draft` EMAS: `recentByConversation` qoralamalarni tashlab ketadi,
      // qayd esa operator chatda ko'rishi kerak
      // (`InstructAgentUseCase` bilan bir xil sabab).
      status: 'sent',
      meta: { kind: HISOB_QAYDI, crm, vada: qoldiq, contractNo: nomer },
    });
    this.events.publish({
      type: 'message.created',
      conversationId: conversation.id,
      messageId: qayd.id,
    });
  }

  /** Mijozning to'lov holatini agent tushunadigan ko'rinishga keltiradi. */
  async buildContext(
    clientId: string,
    /** Suhbat boshlangan payt — undan keyingi to'lovlar promptda belgilanadi. */
    contactStartedAt: Date | null = null,
  ): Promise<{ context: AgentDebtContext; contractId: string | null }> {
    const client = await this.clients.findById(clientId);
    if (!client) throw new NotFoundError('Mijoz', clientId);

    let all = await this.contracts.findByClientId(clientId);

    // Javob berishdan oldin faktlar YANGI bo'lishi SHART — kesh ataylab
    // chetlab o'tiladi (`0` daqiqa).
    //
    // NEGA: mijozga aytiladigan summaning yagona manbai — CRM, bizdagi
    // nusxa esa faqat uning aksi. 2026-09-10 da eski aks bo'yicha
    // Boyirov Boyxonga 4 311 000 so'm aytildi, CRM'da o'sha payt
    // 4 811 000 turgan edi — 500 000 so'mlik farqni operator qo'lda
    // to'g'rilashga majbur bo'ldi. Har javobda summa chiqib qolishi
    // mumkin, shuning uchun shart AYRIM yo'llarda emas, hammasi
    // o'tadigan shu bitta joyda turadi.
    //
    // `CONTRACTS_FRESH_MINUTES` O'CHIRILMAYDI: u boshqa chaqiruvchilarda
    // (kuzatuvchilar, ommaviy ish) o'z ma'nosini saqlaydi — ular mijozga
    // raqam aytmaydi.
    //
    // Narxi: raqamli xabarga shartnoma boshiga bitta so'rov (~0,6 soniya).
    let anyRefreshed = false;
    for (const c of all) {
      // Holat SINXRONIZATSIYADAN OLDIN o'qiladi: xato bo'lsa yangisi
      // kelmaydi, qaror esa bizdagi oxirgi ma'lum holatga qarab
      // chiqariladi.
      const summagaKiradi = yoziladimi(c.virtualStatus);
      let xato: unknown = null;
      let outcome: string | null = null;
      try {
        const result = await this.contractSync.syncIfStale(c.id, 0);
        outcome = result?.outcome ?? null;
        if (outcome === 'ok') anyRefreshed = true;
      } catch (err) {
        xato = err;
      }

      // `error` — CRM javob bermadi yoki javobi tushunarsiz. Qolgan
      // natijalar to'xtatmaydi: `disabled` — integratsiya ataylab
      // o'chirilgan (tizim Excel bilan ishlaydi), `not_found` — CRM
      // shartnomani bilmaydi va qayta urinish buni o'zgartirmaydi.
      if (xato || outcome === 'error') {
        log.warn({ contractId: c.id, err: xato, outcome }, 'Javob oldidan shartnoma yangilanmadi');

        // Sotilmagan shartnomaning xatosi suhbatni TO'XTATMAYDI: u
        // `faqatYoziladiganlar` bilan baribir chiqib ketadi va mijozga
        // aytiladigan summaga umuman kirmaydi (bekor qilinayotgan
        // "Проц. отказ", puli qaytarilayotgan "К возврату"). Uni ham
        // to'siq qilsak, mijoz aloqasi yo'q shartnoma tufayli javobsiz
        // qolardi.
        if (summagaKiradi) {
          throw new CrmUnavailableError(
            `Shartnoma ${c.contractNo} CRM'dan yangilanmadi — summa tasdiqlanmadi`,
            c.contractNo,
          );
        }
      }
    }
    if (anyRefreshed) all = await this.contracts.findByClientId(clientId);

    // Agent FAQAT "Сотилди" shartnomalarini ko'radi. Bekor qilinayotgan
    // ("Проц. отказ") yoki puli qaytarilayotgan ("К возврату") shartnoma
    // yig'indiga qo'shilsa, mijozga aslida talab qilinmaydigan summa
    // aytilardi — va u buni darhol sezardi.
    //
    // Sinxronizatsiyadan KEYIN filtrlanadi: holat aynan o'sha yerda
    // yangilanadi.
    all = faqatYoziladiganlar(all);

    const primary = all[0] ?? null;
    const todayIso = this.clock.todayIso();

    // Grafik va to'lovlar HAR BIR shartnoma bo'yicha alohida tortiladi.
    //
    // Ilgari faqat birinchisiniki olinardi. Bir nechta shartnomali mijoz
    // ikkinchisi haqida "qaysi oy uchun?" yoki "men to'ladim-ku" desa,
    // agentda hech qanday fakt yo'q edi — u birinchi shartnomaning oylarini
    // aytib yuborardi. Qo'shimcha so'rovlar bir nechta shartnomasi bor
    // kam sonli mijozdagina ketadi: bittasida hammasi avvalgidek qoladi.
    const withSchedule = await Promise.all(
      all.map(async (c) => {
        const [unpaidMonths, recentPayments] = await Promise.all([
          this.payments.findUnpaidMonths(c.id, todayIso, UNPAID_MONTHS_LIMIT),
          this.payments.listRecentPayments(c.id, RECENT_PAYMENTS_LIMIT),
        ]);
        return {
          contractNo: c.contractNo,
          objectName: c.objectName,
          apartment: c.apartment,
          monthlyPayment: c.monthlyPayment,
          debtFirst: c.debtFirst,
          debtMonthly: c.debtMonthly,
          debtMeter: c.debtMeter,
          statusLabel: agentUchunHolat(c.virtualStatus),
          daysOverdue: c.daysOverdue,
          // Grafikdan sanalgan aniq son. Grafik hali sinxronlanmagan
          // bo'lsa (0) — eski taxminiy bo'linmaga qaytamiz.
          missedMonths: c.missedMonthsExact || missedMonths(c),
          unpaidMonths,
          recentPayments,
          nextPaymentDate: toIsoDate(c.nextPaymentDate),
          contractDate: toIsoDate(c.contractDate),
          completionDate: c.completionDate,
          paidTotal: c.paidTotal,
          warningCount: c.warningCount,
        };
      }),
    );

    // Mijozga kechikishning ikkala qismi ham aytiladi: boshlang'ich to'lov (`Долг 1 взнос`)
    // va oyma-oy to'lovlar (`Долг (мес.)`). Jami — SHU IKKALASINING
    // yig'indisi, eksportdagi `Долг (Общ)` emas: agent aytgan raqamlar
    // qo'shilganda jamiga to'g'ri kelishi shart.
    //
    // Yig'indi mijozning HAMMA shartnomasini qamraydi va shu holicha faqat
    // bitta shartnomali mijozga aytiladi. Bir nechta shartnomada esa agent
    // `contracts` dagi shartnoma-shartnoma taqsimotdan foydalanadi: mijoz
    // to'lovni shartnomasi bo'yicha biladi, yig'indi unga hech narsa
    // demaydi va aynan shu chalkashlikka olib kelgan edi.
    const debtFirst = all.reduce((sum, c) => sum + c.debtFirst, 0);
    const debtMonthly = all.reduce((sum, c) => sum + c.debtMonthly, 0);
    const daysOverdue = all.reduce((max, c) => Math.max(max, c.daysOverdue), 0);

    return {
      contractId: primary?.id ?? null,
      context: {
        clientName: client.fullName,
        clientFirstName: client.firstName,
        interlocutor: await this.suhbatdosh(clientId),
        contactStartedAt,
        contracts: withSchedule,
        debtFirst,
        debtMonthly,
        debtSum: debtFirst + debtMonthly,
        daysOverdue,
      },
    };
  }

  /**
   * Kuzatuv javobni KUTMASDAN ochiladi: `open()` CRM'ga boradi va to'lov
   * topilsa `paymentThanks` ni chaqiradi — u shu suhbatning navbatini
   * kutadi, ichkarida kutsak navbat o'z-o'zini to'sib qo'yardi.
   */
  private watchPaymentClaim(conversationId: string): void {
    if (!this.paymentClaimWatch) return;
    this.paymentClaimWatch(conversationId).catch((err) =>
      log.warn({ err, conversationId }, 'To\'lov da\'vosi kuzatuvga olinmadi'),
    );
  }

  /**
   * Profildagi suhbatdosh. Profil o'qilmasa murojaat shartnoma egasiga
   * qaytadi — bu javobni to'xtatadigan xato emas.
   */
  private async suhbatdosh(clientId: string): Promise<AgentDebtContext['interlocutor']> {
    try {
      return (await this.profiles.find(clientId))?.interlocutor ?? null;
    } catch (err) {
      log.warn({ err, clientId }, 'Suhbatdoshni o\'qib bo\'lmadi');
      return null;
    }
  }

  /** Kechikish kuniga qarab eskalatsiya bosqichini yangilaydi. */
  async syncStage(conversationId: string, daysOverdue: number): Promise<void> {
    const stage = stageForOverdueDays(daysOverdue);
    await this.conversations.update(conversationId, { stage });
  }

  private async requireConversation(id: string): Promise<Conversation> {
    const conversation = await this.conversations.findById(id);
    if (!conversation) throw new NotFoundError('Suhbat', id);
    // Noma'lum mijozga asosiy agent YOZMAYDI: uning konteksti shartnoma va
    // to'lovga qurilgan, begona odamga esa bu ma'lumot chiqmasligi kerak.
    // Javobni `NomalumMijozAgenti` beradi (`JavobYonaltiruvchi`).
    const client = await this.clients.findById(conversation.clientId);
    if (client?.nomalum) throw new NomalumMijozXatosi();
    return conversation;
  }
}
