import type { LlmModel, LlmProvider } from '@/domain/entities/LlmModel';
import type { TelegramAccount } from '@/domain/entities/TelegramAccount';
import type { ILlmModelRepository } from '@/domain/repositories/ILlmModelRepository';
import type { IAgentEngine } from '@/domain/services/IAgentEngine';
import { ClaudeAgentEngine } from '@/infrastructure/ai/ClaudeAgentEngine';
import { OpenAiAgentEngine } from '@/infrastructure/ai/OpenAiAgentEngine';
import type { LlmKaliti } from '@/application/services/llmKaliti';
import { config } from '@/shared/config';
import { childLogger } from '@/shared/logger';

const log = childLogger('engine-factory');

export interface TanlanganDvigatel {
  readonly engine: IAgentEngine;
  /**
   * `LlmProvider` (jadval qatorlari) dan KENGROQ: standart yo'l doim
   * `'claude'`, jadvalda esa faqat `'openai'` qatorlari bo'ladi — shu
   * ikkisi bir xil ma'noda emas, shuning uchun bu yerda alohida.
   */
  readonly provider: 'claude' | LlmProvider;
  readonly model: string;
  /** Narx `llm_models` dagi tarifdan hisoblanadi; standart yo'lda `null`. */
  readonly llmModel: LlmModel | null;
}

/**
 * Akkauntga qarab dvigatelni tanlaydi.
 *
 * Har qanday shubhali holatda STANDART yo'lga tushadi (Claude): model
 * biriktirilmagan, o'chirilgan, topilmadi yoki kalit yo'q. Sabab oddiy —
 * mijoz javobsiz qolgandan ko'ra boshqa model bilan javob olgani yaxshi,
 * va bu holat suhbat yorlig'ida baribir ko'rinadi.
 */
export class AgentEngineFactory {
  private readonly claude = new ClaudeAgentEngine();

  constructor(
    private readonly models: ILlmModelRepository,
    private readonly kalit: LlmKaliti,
  ) {}

  standart(): TanlanganDvigatel {
    return { engine: this.claude, provider: 'claude', model: config.AGENT_MODEL, llmModel: null };
  }

  async forAccount(account: TelegramAccount | null): Promise<TanlanganDvigatel> {
    if (!account?.llmModelId) return this.standart();

    const model = await this.models.findById(account.llmModelId);
    if (!model || !model.isEnabled) {
      log.warn({ akkaunt: account.label, llmModelId: account.llmModelId }, 'Model topilmadi yoki o\'chirilgan — standart dvigatel');
      return this.standart();
    }
    // Jadvaldan Claude tanlash YOLG'ON TANLOV bo'lardi: `ClaudeAgentEngine`
    // model nomini konstruktordan olmaydi, u doim `config.AGENT_MODEL`ni
    // ishlatadi. Qator biriktirilsa dvigatel baribir o'zgarmay qolardi-yu,
    // narx TANLANGAN qatorning tarifidan hisoblanardi — hisobot buziladi.
    // Shu sabab jadvalda faqat `openai` qatorlari bo'ladi (113-migratsiya);
    // boshqa provayder — shubhali holat, standart yo'lga tushamiz.
    if (model.provider !== 'openai') {
      log.warn({ akkaunt: account.label, provider: model.provider }, 'Jadvaldagi provayder OpenAI emas — standart dvigatel');
      return this.standart();
    }

    const apiKey = await this.kalit.openAiKey();
    if (!apiKey) {
      log.warn({ akkaunt: account.label }, 'OpenAI kaliti yo\'q — standart dvigatel');
      return this.standart();
    }

    return {
      engine: new OpenAiAgentEngine({ apiKey, model: model.model, baseUrl: await this.kalit.baseUrl() }),
      provider: 'openai',
      model: model.model,
      llmModel: model,
    };
  }
}
