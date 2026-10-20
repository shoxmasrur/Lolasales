import type { IHolidayRepository } from '@/domain/repositories/IHolidayRepository';
import type { ITalabnomaSukuti } from '@/domain/services/ITalabnomaSukuti';
import { PgQamrovRepository } from '@/infrastructure/db/repositories/PgQamrovRepository';
import { PgClientRepository } from '@/infrastructure/db/repositories/PgClientRepository';
import { PgContractRepository } from '@/infrastructure/db/repositories/PgContractRepository';
import { PgContractSyncRepository } from '@/infrastructure/db/repositories/PgContractSyncRepository';
import { PgContractPaymentRepository } from '@/infrastructure/db/repositories/PgContractPaymentRepository';
import { XonsaroyContractGateway } from '@/infrastructure/contracts/XonsaroyContractGateway';
import { ContractSyncService } from '@/application/services/ContractSyncService';
import { AppLogCleaner } from '@/application/services/AppLogCleaner';
import { agentFailureReason } from '@/application/services/agentFailure';
import { PgConversationRepository } from '@/infrastructure/db/repositories/PgConversationRepository';
import { PgNomalumSuhbatRepository } from '@/infrastructure/db/repositories/PgNomalumSuhbatRepository';
import { PgMessageRepository } from '@/infrastructure/db/repositories/PgMessageRepository';
import { PgPaymentPromiseRepository } from '@/infrastructure/db/repositories/PgPaymentPromiseRepository';
import { PgCourseRepository } from '@/infrastructure/db/repositories/PgCourseRepository';
import { PgPurchaseRepository } from '@/infrastructure/db/repositories/PgPurchaseRepository';
import { XaridXizmati } from '@/application/services/XaridXizmati';
import { KartaYuboruvchi } from '@/application/services/KartaYuboruvchi';
import { PgPaymentCheckRepository } from '@/infrastructure/db/repositories/PgPaymentCheckRepository';
import { PaymentCheckService } from '@/application/services/PaymentCheckService';
import { MissedMessageSync } from '@/application/services/MissedMessageSync';
import { PgCampaignRepository } from '@/infrastructure/db/repositories/PgCampaignRepository';
import { PgTelegramAccountRepository } from '@/infrastructure/db/repositories/PgTelegramAccountRepository';
import { PgUserRepository } from '@/infrastructure/db/repositories/PgUserRepository';
import { PgRoleRepository } from '@/infrastructure/db/repositories/PgRoleRepository';
import { PgApiTokenRepository } from '@/infrastructure/db/repositories/PgApiTokenRepository';
import {
  PgAgentRuleRepository,
  PgClientProfileRepository,
  PgLessonRepository,
} from '@/infrastructure/db/repositories/PgAgentKnowledgeRepository';
import { PgAppLogRepository } from '@/infrastructure/db/repositories/PgAppLogRepository';
import { PgAgentUsageRepository } from '@/infrastructure/db/repositories/PgAgentUsageRepository';
import { PgClientPhoneBlockRepository } from '@/infrastructure/db/repositories/PgClientPhoneBlockRepository';
import { QamrovTekshiruvchi } from '@/application/services/QamrovTekshiruvchi';
import { BlockClientPhoneUseCase } from '@/application/usecases/clients/BlockClientPhone';
import { PromptComposer } from '@/application/services/PromptComposer';
import { AuthContext } from '@/presentation/http/middleware/auth';
import {
  PgAuditRepository,
  PgImportBatchRepository,
  PgSettingsRepository,
  PgStatsRepository,
} from '@/infrastructure/db/repositories/PgSupportRepositories';

import { AccountGate } from '@/infrastructure/telegram/AccountGate';
import { MtprotoTelegramGateway } from '@/infrastructure/telegram/MtprotoTelegramGateway';
import { BotApi } from '@/infrastructure/telegram/BotApi';
import { XulosaBoti } from '@/application/services/XulosaBoti';
import { AishaSpeechToText } from '@/infrastructure/stt/AishaSpeechToText';
import { XonzodaSpeechToText } from '@/infrastructure/stt/XonzodaSpeechToText';
import { NomalumMijozOchuvchi } from '@/application/services/NomalumMijozOchuvchi';
import { NomalumMijozAgenti } from '@/application/services/NomalumMijozAgenti';
import { NomalumHujjatQabul } from '@/application/services/NomalumHujjatQabul';
import { ShartnomaBoglovchi } from '@/application/services/ShartnomaBoglovchi';
import { JavobYonaltiruvchi } from '@/application/services/JavobYonaltiruvchi';
import { MijozgaBoglashUseCase } from '@/application/usecases/conversations/MijozgaBoglashUseCase';
import { ClaudeTuzilganLlm } from '@/infrastructure/ai/ClaudeTuzilganLlm';
import { personaNameOf } from '@/domain/entities/TelegramAccount';
import { SttTaqqoslash } from '@/application/services/SttTaqqoslash';
import { ClaudeImageClassifier } from '@/infrastructure/vision/ClaudeImageClassifier';
import { LocalMediaStorage } from '@/infrastructure/storage/LocalMediaStorage';
import { XlsxDebtorParser } from '@/infrastructure/import/XlsxDebtorParser';
import { SystemClock } from '@/infrastructure/support/SystemClock';
import { BcryptPasswordHasher } from '@/infrastructure/support/BcryptPasswordHasher';
import { JwtTokenService } from '@/infrastructure/support/JwtTokenService';
import { InMemoryEventBus } from '@/infrastructure/support/InMemoryEventBus';

import { RuntimeSettings } from '@/application/services/RuntimeSettings';
import { ClientTelegramResolver } from '@/application/services/ClientTelegramResolver';
import { MessageDispatcher } from '@/application/services/MessageDispatcher';
import { AgentRunner } from '@/application/services/AgentRunner';
import { AgentEngineFactory } from '@/application/services/AgentEngineFactory';
import { LlmKaliti } from '@/application/services/llmKaliti';
import { PgLlmModelRepository } from '@/infrastructure/db/repositories/PgLlmModelRepository';
import { ReplyDebouncer } from '@/application/services/ReplyDebouncer';
import { BulkTelegramLookup } from '@/application/services/BulkTelegramLookup';
import { PgBulkJobRepository } from '@/infrastructure/db/repositories/PgBulkJobRepository';
import { BulkJobStore } from '@/application/services/BulkJobStore';
import { BulkJobResumer } from '@/application/services/BulkJobResumer';
import { BulkConversationStart } from '@/application/services/BulkConversationStart';
import { BulkStartPlanner } from '@/application/services/BulkStartPlanner';
import { config } from '@/shared/config';
import { CrmUnavailableError } from '@/shared/errors';
import { IncomingMediaProcessor } from '@/application/services/IncomingMediaProcessor';
import { OutreachScheduler } from '@/application/services/OutreachScheduler';
import { AccountAssigner } from '@/application/services/AccountAssigner';
import { AccountLabels } from '@/application/services/AccountLabels';
import { AccountChecker } from '@/application/services/AccountChecker';
import { SpamStatusWatcher } from '@/application/services/SpamStatusWatcher';
import { TelegramConnectionWatcher } from '@/application/services/TelegramConnectionWatcher';
import { SessiyaOgohlantiruvchi } from '@/application/services/SessiyaOgohlantiruvchi';

import { LoginUseCase } from '@/application/usecases/auth/LoginUseCase';
import { ImportDebtorFileUseCase } from '@/application/usecases/import/ImportDebtorFileUseCase';
import { ImportPhoneFileUseCase } from '@/application/usecases/import/ImportPhoneFileUseCase';
import { StartConversationUseCase } from '@/application/usecases/messaging/StartConversationUseCase';
import { HandleIncomingMessageUseCase } from '@/application/usecases/messaging/HandleIncomingMessageUseCase';
import { SendManualMessageUseCase } from '@/application/usecases/messaging/SendManualMessageUseCase';
import { EditMessageUseCase } from '@/application/usecases/messaging/EditMessageUseCase';
import { DeleteMessageUseCase } from '@/application/usecases/messaging/DeleteMessageUseCase';
import { RetryAgentTurnUseCase } from '@/application/usecases/messaging/RetryAgentTurnUseCase';
import { InstructAgentUseCase } from '@/application/usecases/messaging/InstructAgentUseCase';
import { BulkRecontact } from '@/application/services/BulkRecontact';
import { PgRecontactRepository } from '@/infrastructure/db/repositories/PgRecontactRepository';
import { PgRecontactTopicRepository } from '@/infrastructure/db/repositories/PgRecontactTopicRepository';
import { CreateCampaignUseCase } from '@/application/usecases/campaigns/CreateCampaignUseCase';
import { CreateClientFromContract } from '@/application/usecases/clients/CreateClientFromContract';

/**
 * Yagona kompozitsiya ildizi (composition root).
 *
 * Barcha konkret implementatsiyalar SHU YERDA interfeyslarga bog'lanadi.
 * Boshqa hech bir modul `new Pg...` yoki `new Mtproto...` chaqirmaydi —
 * shu sabab implementatsiyani almashtirish uchun faqat shu fayl o'zgaradi.
 */
export function createContainer() {
  // ─── Infratuzilma ───────────────────────────────────────────────────────
  const clock = new SystemClock();
  const events = new InMemoryEventBus();
  const hasher = new BcryptPasswordHasher();
  const tokens = new JwtTokenService();
  const parser = new XlsxDebtorParser();

  // ─── Repozitoriylar ─────────────────────────────────────────────────────
  const clients = new PgClientRepository();
  const contracts = new PgContractRepository();
  const contractSyncRepo = new PgContractSyncRepository();
  const contractPayments = new PgContractPaymentRepository();
  const conversations = new PgConversationRepository();
  const messages = new PgMessageRepository();
  const nomalumSuhbatlar = new PgNomalumSuhbatRepository();
  const promises = new PgPaymentPromiseRepository();
  const paymentChecks = new PgPaymentCheckRepository();
  const courses = new PgCourseRepository();
  const purchases = new PgPurchaseRepository();
  const campaigns = new PgCampaignRepository();
  const telegramAccounts = new PgTelegramAccountRepository();
  const users = new PgUserRepository();
  const roles = new PgRoleRepository();
  const apiTokens = new PgApiTokenRepository();
  const agentRules = new PgAgentRuleRepository();
  const lessons = new PgLessonRepository();
  const clientProfiles = new PgClientProfileRepository();
  const appLog = new PgAppLogRepository();
  const agentUsage = new PgAgentUsageRepository();
  const importBatches = new PgImportBatchRepository();
  const settingsRepo = new PgSettingsRepository();
  const audit = new PgAuditRepository();
  const stats = new PgStatsRepository();
  const llmModels = new PgLlmModelRepository();
  const xulosaBoti = new XulosaBoti(settingsRepo, new BotApi());
  // Akkaunt sessiyasi uzilsa — administratorga shu bot orqali darhol xabar.
  // Obuna `events` yaratilgan zahoti: `bootstrap` paytidagi uzilish ham ushlansin.
  const panelManzili = config.WEB_ORIGIN.split(',')[0]?.trim().replace(/\/$/, '') ?? '';
  new SessiyaOgohlantiruvchi(
    events, xulosaBoti, config.TIMEZONE,
    panelManzili && !panelManzili.includes('localhost') ? panelManzili : null,
  ).start();

  // ─── Tashqi xizmatlar ───────────────────────────────────────────────────
  const settings = new RuntimeSettings(settingsRepo);

  // Har akkauntning Telegramga so'rovlari shu navbatdan o'tadi: bir vaqtda
  // bitta operatsiya + orasida tasodifiy tanaffus. Sozlamalar dashboarddan
  // o'zgaradi, shuning uchun har safar qayta so'raladi.
  const accountGate = new AccountGate({
    delays: async () => {
      const s = await settings.get();
      return {
        messageMinSec: s.gateMessageMinSec,
        messageMaxSec: s.gateMessageMaxSec,
        otherMinSec: s.gateOtherMinSec,
        otherMaxSec: s.gateOtherMaxSec,
      };
    },
  });
  const telegram = new MtprotoTelegramGateway(telegramAccounts, accountGate, events);
  // OpenAI kaliti bazada shifrlangan saqlanadi, `.env` esa faqat zaxira
  // (`LlmKaliti` izohiga qarang) — shu sabab ikkalasi ham beriladi.
  const llmKaliti = new LlmKaliti(settingsRepo, {
    envKey: config.OPENAI_API_KEY,
    envBaseUrl: config.OPENAI_BASE_URL,
  });
  // Akkauntga qarab dvigatel tanlaydi: jadvalda OpenAI qatori biriktirilgan
  // bo'lsa — o'sha, aks holda standart (Claude). `AgentRunner` HAR BIR
  // navbatda shundan so'raydi — `ClaudeAgentEngine`ning bevosita nusxasi
  // konteynerda alohida ushlab turilmaydi, `AgentEngineFactory` o'zi
  // standart holat uchun ichida yaratadi.
  const engineFactory = new AgentEngineFactory(llmModels, llmKaliti);
  const speechToText = new AishaSpeechToText();
  // XonzodaAI — faqat Aisha bilan solishtirish uchun (kalit bo'lmasa o'chiq).
  const xonzodaStt = new XonzodaSpeechToText({
    apiKey: config.XONZODA_STT_API_KEY,
    baseUrl: config.XONZODA_STT_BASE_URL,
    timeoutMs: config.STT_TIMEOUT_MS,
  });
  const imageClassifier = new ClaudeImageClassifier();
  const mediaStorage = new LocalMediaStorage();

  // ─── Application xizmatlari ─────────────────────────────────────────────
  // Jurnal qatorlariga akkaunt nomini ("Madina") qo'shish uchun — akkaunt
  // ko'p bo'lganda qaysi birida muammo borligini id bo'yicha topib
  // bo'lmaydi.
  const xaridXizmati = new XaridXizmati(purchases, courses, events, audit, clock);
  const accountLabels = new AccountLabels(telegramAccounts);
  const assigner = new AccountAssigner(clients, telegramAccounts, audit, conversations);
  const resolver = new ClientTelegramResolver(clients, telegramAccounts, telegram, clock, assigner);
  const mediaProcessor = new IncomingMediaProcessor(mediaStorage, speechToText, imageClassifier);
  const dispatcher = new MessageDispatcher(
    messages, conversations, telegramAccounts, telegram, settings, events, clock, mediaStorage,
    clients, audit,
  );
  const kartaYuboruvchi = new KartaYuboruvchi(settings, courses, xaridXizmati, conversations, dispatcher, audit, events);
  // Tashqi shartnomalar bazasi — kechikkan to'lov, to'lov grafigi va
  // telefon raqamlarining manbai. Implementatsiyani almashtirish uchun
  // faqat shu qator o'zgaradi.
  // Mijozdan uzilgan raqamlar. Sinxronizatsiya ham, import ham shu
  // ro'yxatga qarab ishlaydi: uzilgan raqam qayta bog'lanmaydi.
  const phoneBlocks = new PgClientPhoneBlockRepository();
  // Bayramlar bazasi olib tashlangan: `evaluateWindow` har doim bo'sh ro'yxat oladi.
  const holidays: IHolidayRepository = { list: async () => [] };
  // Elektron talabnoma moduli olib tashlangan: hech qachon sukut qilmaydi.
  const talabnomaSukuti: ITalabnomaSukuti = { sukutdami: async () => false };
  const contractGateway = new XonsaroyContractGateway();
  const contractSync = new ContractSyncService(
    contractGateway, contractSyncRepo, clients, clock, config.CONTRACTS_SYNC_ENABLED,
    phoneBlocks,
  );

  // Obyekt cheklovi guard'i: bitta yozuv bo'yicha amallarda ko'rinmasa 404.
  const qamrovTekshiruvchi = new QamrovTekshiruvchi(new PgQamrovRepository());

  // Operator tanlagan mijozlarni CRM'dan darhol yangilash. Kechasigi
  // to'liq sinxronizatsiya bilan bir xil servisdan foydalanadi.
  // Ommaviy vazifalar holati bazada: deploy ularni yo'qotmaydi.
  const bulkJobs = new PgBulkJobRepository();
  const bulkJobStore = new BulkJobStore(bulkJobs, clock);

  const promptComposer = new PromptComposer(agentRules, lessons, clientProfiles);
  const agent = new AgentRunner(
    engineFactory, clients, conversations, messages,
    dispatcher, settings, audit, events, clock,
    promptComposer, lessons, clientProfiles,
    telegramAccounts, accountLabels, paymentChecks,
    agentUsage, courses, xaridXizmati, kartaYuboruvchi,
  );

  // Shartnoma raqami bo'yicha mijoz yaratish — operator tugmasi ham, noma'lum
  // suhbatni bog'lash ham shundan foydalanadi (shuning uchun agentdan oldin).
  const createClientFromContract = new CreateClientFromContract(
    clients, contracts, contractGateway, contractSync, audit, clock, config.CONTRACTS_SYNC_ENABLED,
  );

  // ─── Noma'lum mijozlar ──────────────────────────────────────────────────
  // Bog'liqlik tartibda quriladi: bog'lash → shartnoma tekshiruvchisi → agent.
  //
  // Bog'langandan keyingi asosiy agent javobi DEBOUNCER navbatiga qo'yiladi
  // (R15): (1) operator HTTP so'rovi model javobini kutib osilib qolmaydi;
  // (2) javob shu suhbatga kelgan yangi xabarlar bilan bir navbatda ketadi —
  // ikki parallel navbat bo'lmaydi. Mijoz endi noma'lum emas, shuning uchun
  // `JavobYonaltiruvchi` uni `AgentRunner` ga beradi.
  //
  // `replyDebouncer` pastroqda yaratiladi (u `javobYonaltiruvchi` ga, u esa shu
  // use case'ga bog'liq). Yopilish o'zgaruvchini CHAQIRILGAN paytda o'qiydi —
  // bu faqat ish vaqtida, konteyner qurilib bo'lgach sodir bo'ladi, TDZ yo'q.
  // `async`: `push` sinxron xato bersa ham u rad etilgan promise'ga aylanadi
  // va use case uni faqat jurnalga yozadi.
  const mijozgaBoglash = new MijozgaBoglashUseCase({
    clients, conversations, messages, nomalum: nomalumSuhbatlar, audit, events,
    agentReply: async (conversationId, text) => { replyDebouncer.push(conversationId, text); },
  });
  const shartnomaBoglovchi = new ShartnomaBoglovchi({
    contracts, clients, conversations, phoneBlocks, fromContract: createClientFromContract,
    nomalum: nomalumSuhbatlar, boglash: mijozgaBoglash, dispatcher, events,
  });
  const nomalumAgent = new NomalumMijozAgenti({
    llm: new ClaudeTuzilganLlm(),
    nomalum: nomalumSuhbatlar, conversations, messages, dispatcher, settings, events,
    // Asosiy agent bilan bir xil qoida (`AgentRunner.buildKnowledge`): akkauntning
    // o'z persona ismi, bo'lmasa umumiy sozlama — odam bitta akkauntdan ikki xil
    // ism ko'rmasin.
    personaName: async (conversationId) => {
      const [conversation, s] = await Promise.all([conversations.findById(conversationId), settings.get()]);
      const account = conversation?.telegramAccountId
        ? await telegramAccounts.findById(conversation.telegramAccountId)
        : null;
      return personaNameOf(account, s.personaName);
    },
    boglovchi: shartnomaBoglovchi,
  });
  // Kim javob berishi har navbatda qayta aniqlanadi: bog'langan suhbat
  // keyingi xabardanoq asosiy agentga o'tadi.
  const javobYonaltiruvchi = new JavobYonaltiruvchi(agent, nomalumAgent, async (conversationId) => {
    const conversation = await conversations.findById(conversationId);
    if (!conversation) return false;
    const client = await clients.findById(conversation.clientId);
    return Boolean(client?.nomalum);
  });

  // Mijozning ketma-ket xabarlarini bitta javobga birlashtiradi va bir suhbat
  // uchun ikkita agent chaqiruvi bir vaqtda ketishiga yo'l qo'ymaydi.
  // Noma'lum agent FAQAT shu yerdan chaqiriladi (suhbat bo'yicha navbat).
  const replyDebouncer = new ReplyDebouncer(
    javobYonaltiruvchi,
    config.AGENT_REPLY_DEBOUNCE_MS,
    async (conversationId, err) => {
      // CRM yiqilishi AGENT xatosi emas: model ham, Telegram ham joyida,
      // javob esa faqat aytiladigan summa tekshirilmagani uchun
      // yozilmadi. Turi ajratiladi, chunki operatorning ishi boshqacha —
      // "qayta urinish" emas, summani CRM'dan o'zi ko'rib javob yozish.
      const crm = err instanceof CrmUnavailableError;
      await conversations.update(conversationId, {
        needsHuman: true,
        humanKind: crm ? 'crm_xato' : 'agent_error',
        humanReason: crm
          ? `Shartnomalar bazasi javob bermadi (${config.CRM_RETRY_MAX} marta urinildi) — ` +
            'summani tekshirib, javobni qo\'lda yozing'
          : agentFailureReason(err, clock.now()),
      });
      events.publish({ type: 'conversation.updated', conversationId });
    },
  );

  // Halqani yopamiz: debouncer agentni chaqiradi, agent esa xabar
  // yuborishdan oldin "buferda javob kutayotgan xabar bormi?" deb
  // so'raydi. Bor bo'lsa tayyor javob eskirgan — u tashlanadi va
  // buferdagi xabarlarga birga javob beriladi.
  agent.setPendingReplies(replyDebouncer);

  // Bir nechta mijozni ketma-ket, pauza bilan tekshiradi (FLOOD_WAIT dan saqlanish).
  // Ommaviy vazifalar holati bazada: deploy ularni endi yo'qotmaydi.
  const bulkLookup = new BulkTelegramLookup(
    clients, resolver, events, config.TELEGRAM_LOOKUP_DELAY_MS, bulkJobStore,
  );

  // ─── Use case'lar ───────────────────────────────────────────────────────
  const login = new LoginUseCase(users, hasher, tokens, audit);
  const importDebtors = new ImportDebtorFileUseCase(parser, clients, contracts, importBatches);
  const importPhones = new ImportPhoneFileUseCase(parser, clients, contracts, importBatches, phoneBlocks);
  // "Bu raqam mijozniki emas" tugmasi ortidagi amal.
  const blockClientPhone = new BlockClientPhoneUseCase(clients, phoneBlocks, conversations, audit, paymentChecks);
  const startConversation = new StartConversationUseCase(
    clients, contracts, conversations, resolver, agent, audit, events, contractSync, telegram,
    settings, messages, talabnomaSukuti, clock,
  );
  // Chek tekshiruvi: menejer summani tasdiqlaydi yoki rad etadi; tasdiqda
  // xarid bosqichi va (qoida bajarilsa) guruh havolasi tizim tomonidan.
  const paymentCheckService = new PaymentCheckService(
    paymentChecks, conversations, purchases, courses, xaridXizmati,
    agent, dispatcher, audit, events, clock, settings,
  );
  // Ovozli xabarni XonzodaAI'ga ham yuboradi — faqat Aisha bilan solishtirish.
  const sttTaqqoslash = new SttTaqqoslash(xonzodaStt, mediaStorage, messages, events);
  const handleIncoming = new HandleIncomingMessageUseCase(
    clients, contracts, conversations, messages, replyDebouncer, settings, mediaProcessor, events,
    paymentCheckService, sttTaqqoslash,
    // Akkauntlar — o'zimizning Telegram hisoblarimiz noma'lum mijoz bo'lib
    // ochilmasin; soat — eski (deploydan keyingi) xabarni ajratish uchun.
    new NomalumMijozOchuvchi(clients, nomalumSuhbatlar, telegramAccounts, () => clock.now()),
    new NomalumHujjatQabul({
      nomalum: nomalumSuhbatlar, conversations, dispatcher, events,
      abortAgent: (id) => { nomalumAgent.abort(id, 'stale'); },
    }),
    // Chek kelganda faol xarid `chek_keldi` bosqichiga o'tadi.
    xaridXizmati,
  );
  // Ommaviy suhbat boshlash — kampaniya rejalashtiruvchisi bilan bir xil
  // himoya ostida (ish oynasi, tasodifiy pauza, spam cheklovida to'xtash).
  const bulkStartPlanner = new BulkStartPlanner(clients, telegramAccounts, settings, clock);
  const bulkStart = new BulkConversationStart(
    startConversation, settings, events, clock, bulkStartPlanner, clients, telegramAccounts,
    contracts, accountLabels, holidays, bulkJobStore,
  );

  const sendManual = new SendManualMessageUseCase(conversations, messages, dispatcher, audit);
  const editMessage = new EditMessageUseCase(conversations, messages, dispatcher, audit, clock);
  const deleteMessage = new DeleteMessageUseCase(conversations, messages, dispatcher, audit, clock);
  const retryAgentTurn = new RetryAgentTurnUseCase(
    conversations, messages, clients, agent, replyDebouncer, audit, events, clock,
  );
  const instructAgent = new InstructAgentUseCase(
    conversations, messages, clients, agent, replyDebouncer, settings, audit, events, clock,
  );

  // Qayta aloqa ro'yxati: operator jim qolgan suhbatlarni tanlaydi, agent
  // har biriga mavzu bo'yicha yozadi. Har mijoz uchun `instructAgent`
  // ishlatiladi — chatdagi 🤖 tugmasi bilan AYNAN bir yo'l.
  const recontactList = new PgRecontactRepository();
  const recontactTopics = new PgRecontactTopicRepository();
  const bulkRecontact = new BulkRecontact(
    instructAgent, recontactList, settings, holidays, events, clock, conversations, clients,
    talabnomaSukuti, undefined, bulkJobStore,
  );
  // Uchta ommaviy vazifa deploydan keyin davom etadi.
  const bulkJobResumer = new BulkJobResumer(
    bulkJobs, clock, [bulkLookup, bulkStart, bulkRecontact], bulkJobStore,
  );
  const createCampaign = new CreateCampaignUseCase(campaigns, contracts, settings, audit, events);

  // ─── Fon jarayonlari ────────────────────────────────────────────────────
  const scheduler = new OutreachScheduler(
    campaigns, telegramAccounts, startConversation, settings, audit, events, clock, holidays,
  );
  // Va'da kuzatuvchisi (`PromiseWatcher`) o'chirildi; sukut kuzatuvchisi
  // (`SilenceWatcher`) o'rniga 11-vazifada `EslatmaKuzatuvchi` keladi.

  const spamWatcher = new SpamStatusWatcher(telegramAccounts, telegram, audit, events);
  // Cheklovlarni uch manbadan yig'ib, akkaunt kartasiga chiqaradi.
  const accountChecker = new AccountChecker(telegramAccounts, clients, telegram, spamWatcher);
  // Uzilishda o'tkazib yuborilgan xabarlarni tiklaydi.
  const missedSync = new MissedMessageSync(telegram, telegramAccounts, handleIncoming, audit, clock);
  const connectionWatcher = new TelegramConnectionWatcher(
    telegramAccounts, telegram, clock,
    (accountId) => missedSync.afterReconnect(accountId),
  );
  const appLogCleaner = new AppLogCleaner(appLog);

  // Huquq tekshiruvi bazadan o'qiladi; kesh rol o'zgarganda tozalanadi.
  const auth = new AuthContext(tokens, users, apiTokens);

  return {
    clock, events, hasher, tokens, settings, auth,
    repositories: {
      clients, contracts, contractSyncRepo, contractPayments, conversations, messages, promises, campaigns,
      telegramAccounts, users, roles, apiTokens, importBatches, settingsRepo, audit, stats,
      agentRules, lessons, clientProfiles, appLog, paymentChecks, agentUsage, phoneBlocks, holidays,
      recontactList, recontactTopics, llmModels, bulkJobs, nomalumSuhbatlar, courses, purchases,
    },
    services: {
      telegram, resolver, dispatcher, agent, scheduler, accountLabels,
      speechToText, sttTaqqoslash, mediaStorage, mediaProcessor, assigner, spamWatcher, accountChecker, connectionWatcher, promptComposer,
      bulkLookup, bulkStart, bulkStartPlanner, contractGateway, contractSync,
      appLogCleaner,
      paymentCheckService, missedSync, bulkRecontact, xulosaBoti, llmKaliti,
      bulkJobStore, bulkJobResumer,
      nomalumAgent, shartnomaBoglovchi, javobYonaltiruvchi,
      qamrovTekshiruvchi, xaridXizmati, kartaYuboruvchi,
    },
    useCases: {
      login, importDebtors, importPhones, startConversation,
      handleIncoming, sendManual, editMessage, deleteMessage, retryAgentTurn, instructAgent, createCampaign,
      createClientFromContract, blockClientPhone, mijozgaBoglash,
    },
  };
}

export type Container = ReturnType<typeof createContainer>;
