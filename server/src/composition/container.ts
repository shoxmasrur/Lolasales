import { EslatmaKuzatuvchi } from '@/application/services/EslatmaKuzatuvchi';
import { PgClientRepository } from '@/infrastructure/db/repositories/PgClientRepository';
import { AppLogCleaner } from '@/application/services/AppLogCleaner';
import { agentFailureReason } from '@/application/services/agentFailure';
import { PgConversationRepository } from '@/infrastructure/db/repositories/PgConversationRepository';
import { PgMessageRepository } from '@/infrastructure/db/repositories/PgMessageRepository';
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
import { ClaudeTuzilganLlm } from '@/infrastructure/ai/ClaudeTuzilganLlm';
import { personaNameOf } from '@/domain/entities/TelegramAccount';
import { SttTaqqoslash } from '@/application/services/SttTaqqoslash';
import { ClaudeImageClassifier } from '@/infrastructure/vision/ClaudeImageClassifier';
import { LocalMediaStorage } from '@/infrastructure/storage/LocalMediaStorage';
import { XlsxLeadParser } from '@/infrastructure/import/XlsxLeadParser';
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
import { IncomingMediaProcessor } from '@/application/services/IncomingMediaProcessor';
import { OutreachScheduler } from '@/application/services/OutreachScheduler';
import { AccountAssigner } from '@/application/services/AccountAssigner';
import { AccountLabels } from '@/application/services/AccountLabels';
import { AccountChecker } from '@/application/services/AccountChecker';
import { SpamStatusWatcher } from '@/application/services/SpamStatusWatcher';
import { TelegramConnectionWatcher } from '@/application/services/TelegramConnectionWatcher';
import { SessiyaOgohlantiruvchi } from '@/application/services/SessiyaOgohlantiruvchi';

import { LoginUseCase } from '@/application/usecases/auth/LoginUseCase';
import { ImportLeadsUseCase } from '@/application/usecases/import/ImportLeadsUseCase';
import { MijozYaratuvchi } from '@/application/services/MijozYaratuvchi';
import { IzohYiguvchi } from '@/application/services/IzohYiguvchi';
import { StartConversationUseCase } from '@/application/usecases/messaging/StartConversationUseCase';
import { HandleIncomingMessageUseCase } from '@/application/usecases/messaging/HandleIncomingMessageUseCase';
import { SendManualMessageUseCase } from '@/application/usecases/messaging/SendManualMessageUseCase';
import { EditMessageUseCase } from '@/application/usecases/messaging/EditMessageUseCase';
import { DeleteMessageUseCase } from '@/application/usecases/messaging/DeleteMessageUseCase';
import { RetryAgentTurnUseCase } from '@/application/usecases/messaging/RetryAgentTurnUseCase';
import { InstructAgentUseCase } from '@/application/usecases/messaging/InstructAgentUseCase';
import { CreateCampaignUseCase } from '@/application/usecases/campaigns/CreateCampaignUseCase';

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
  const parser = new XlsxLeadParser();

  // ─── Repozitoriylar ─────────────────────────────────────────────────────
  const clients = new PgClientRepository();
  const conversations = new PgConversationRepository();
  const messages = new PgMessageRepository();
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
  // Mijozdan uzilgan raqamlar. Import shu ro'yxatga qarab ishlaydi:
  // uzilgan raqam qayta bog'lanmaydi.
  const phoneBlocks = new PgClientPhoneBlockRepository();

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

  // Mijozning ketma-ket xabarlarini bitta javobga birlashtiradi va bir suhbat
  // uchun ikkita agent chaqiruvi bir vaqtda ketishiga yo'l qo'ymaydi.
  const replyDebouncer = new ReplyDebouncer(
    agent,
    config.AGENT_REPLY_DEBOUNCE_MS,
    async (conversationId, err) => {
      await conversations.update(conversationId, {
        needsHuman: true,
        humanKind: 'agent_error',
        humanReason: agentFailureReason(err, clock.now()),
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
  // Reklama (kiruvchi), guruh va Excel raqamlari — hammasi shu yerda mijoz bo'ladi.
  const mijozYaratuvchi = new MijozYaratuvchi(clients, xaridXizmati, events);
  const importLeads = new ImportLeadsUseCase(parser, mijozYaratuvchi, courses, importBatches, clients, phoneBlocks);
  // "Bu raqam mijozniki emas" tugmasi ortidagi amal.
  const blockClientPhone = new BlockClientPhoneUseCase(clients, phoneBlocks, conversations, audit, paymentChecks);
  const startConversation = new StartConversationUseCase(
    clients, conversations, resolver, agent, audit, events, telegram, messages,
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
    clients, conversations, messages, replyDebouncer, settings, mediaProcessor, events,
    paymentCheckService, sttTaqqoslash,
    // Notanish yozuvchi — reklama leadi.
    mijozYaratuvchi,
    telegramAccounts,
    // Chek kelganda faol xarid `chek_keldi` bosqichiga o'tadi.
    xaridXizmati,
  );
  // Ommaviy suhbat boshlash — kampaniya rejalashtiruvchisi bilan bir xil
  // himoya ostida (ish oynasi, tasodifiy pauza, spam cheklovida to'xtash).
  const bulkStartPlanner = new BulkStartPlanner(clients, telegramAccounts, settings, clock);
  const bulkStart = new BulkConversationStart(
    startConversation, settings, events, clock, bulkStartPlanner, clients, telegramAccounts,
    accountLabels, bulkJobStore,
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

  // Ikkala ommaviy vazifa deploydan keyin davom etadi.
  const bulkJobResumer = new BulkJobResumer(bulkJobs, clock, [bulkLookup, bulkStart], bulkJobStore);
  const createCampaign = new CreateCampaignUseCase(campaigns, clients, settings, audit, events);
  // Kanal izohlaridan lead: faqat o'qiydi, birinchi xabar kampaniya orqali.
  const izohYiguvchi = new IzohYiguvchi(telegram, clients, mijozYaratuvchi, createCampaign, settings, audit, clock);

  // ─── Fon jarayonlari ────────────────────────────────────────────────────
  const scheduler = new OutreachScheduler(
    campaigns, telegramAccounts, startConversation, settings, audit, events, clock,
  );
  // Jim qolgan mijozga bosqichiga bitta eslatma.
  const eslatmaKuzatuvchi = new EslatmaKuzatuvchi(
    conversations, agent, xaridXizmati, purchases, settings, audit, clock, telegramAccounts,
  );

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
      clients, conversations, messages, campaigns,
      telegramAccounts, users, roles, apiTokens, importBatches, settingsRepo, audit, stats,
      agentRules, lessons, clientProfiles, appLog, paymentChecks, agentUsage, phoneBlocks,
      llmModels, bulkJobs, courses, purchases,
    },
    services: {
      telegram, resolver, dispatcher, agent, scheduler, accountLabels,
      speechToText, sttTaqqoslash, mediaStorage, mediaProcessor, assigner, spamWatcher, accountChecker, connectionWatcher, promptComposer,
      bulkLookup, bulkStart, bulkStartPlanner,
      appLogCleaner,
      paymentCheckService, missedSync, xulosaBoti, llmKaliti,
      bulkJobStore, bulkJobResumer,
      mijozYaratuvchi, izohYiguvchi,
      xaridXizmati, kartaYuboruvchi, eslatmaKuzatuvchi,
    },
    useCases: {
      login, importLeads, startConversation,
      handleIncoming, sendManual, editMessage, deleteMessage, retryAgentTurn, instructAgent, createCampaign,
      blockClientPhone,
    },
  };
}

export type Container = ReturnType<typeof createContainer>;
