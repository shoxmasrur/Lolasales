import type {
  AgentTurnInput,
  AgentTurnOutput,
  IAgentEngine,
} from '@/domain/services/IAgentEngine';
import {
  AGENT_OUTPUT_SCHEMA,
  buildSystemPrompt,
  DEFAULT_PERSONA,
  type PromptPersona,
} from '@/infrastructure/ai/prompt/systemPrompt';
import { buildUserPrompt, type TurnMode } from '@/infrastructure/ai/prompt/userPrompt';
import { parseAgentOutput, toTurnOutput } from '@/infrastructure/ai/agentOutput';
import { AbortedError, AppError } from '@/shared/errors';
import { childLogger } from '@/shared/logger';
import { providerXatosiniTozala } from '@/shared/providerXatosi';

const log = childLogger('agent-openai');

// undici (Node'ning `fetch`i) standart so'rov muddati ~300 soniya — bu
// vaqtda navbat (bitta suhbatning bitta burilishi) shuncha band qolib
// ketishi mumkin, agar OpenAI ulanishni ochiq ushlab, javob bermasa.
// 120 soniya — real javoblar (hatto uzun promptlarda ham) bundan ancha
// tez kelishini kutamiz, shu bilan birga vaqtinchalik sekinlikka ham joy
// qoldiradi.
const SOROV_MUDDATI_MS = 120_000;

/**
 * OpenAI ustidagi adapter — endi bitta global `.env` ga bog'liq emas.
 *
 * Kalit, model va manzil KONSTRUKTORDAN keladi (`OpenAiEngineOptions`),
 * `config` dan emas: har bir Telegram akkaunt o'z modelida ishlashi
 * mumkin, kalit esa bazadan shifrlangan holda o'qiladi (`LlmKaliti`).
 * Qaysi dvigatelni (Claude yoki OpenAI, qaysi model bilan) qo'llashni
 * tanlash — `AgentEngineFactory` ishi, bu klass faqat unga berilgan
 * qiymatlar bilan ishlaydi.
 *
 * NEGA SDK EMAS, `fetch`: yangi bog'liqlik qo'shish — bu qaror qat'iy.
 * Bitta HTTP so'rov uchun paket kerak emas.
 *
 * System prompt, foydalanuvchi prompti va javob sxemasi hozirgi agent
 * bilan AYNAN bir xil (`buildSystemPrompt`, `buildUserPrompt`,
 * `AGENT_OUTPUT_SCHEMA`) — ikkala dvigatel bir xil "aql" bilan ishlaydi,
 * farq faqat model va provayderda.
 */
export interface OpenAiEngineOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl: string;
  readonly persona?: PromptPersona;
}

export class OpenAiAgentEngine implements IAgentEngine {
  private readonly persona: PromptPersona;

  constructor(private readonly opts: OpenAiEngineOptions) {
    this.persona = opts.persona ?? DEFAULT_PERSONA;
  }

  async composeFirstContact(input: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput> {
    return this.run({ ...input, incoming: null }, 'first');
  }

  async respond(input: AgentTurnInput): Promise<AgentTurnOutput> {
    return this.run(input, 'reply');
  }

  async composePromiseReminder(input: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput> {
    return this.run({ ...input, incoming: null }, 'reminder');
  }

  async composePaymentThanks(input: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput> {
    return this.run({ ...input, incoming: null }, 'thanks');
  }

  async composeSilenceNudge(input: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput> {
    return this.run({ ...input, incoming: null }, 'nudge');
  }

  async composeOperatorTurn(input: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput> {
    return this.run({ ...input, incoming: null }, 'operator');
  }

  async composeReceiptConfirmed(input: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput> {
    return this.run({ ...input, incoming: null }, 'receipt_confirmed');
  }

  async composeMonthlyReminder(input: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput> {
    return this.run({ ...input, incoming: null }, 'oylik_eslatma');
  }

  private async run(input: AgentTurnInput, mode: TurnMode): Promise<AgentTurnOutput> {
    const apiKey = this.opts.apiKey.trim();
    if (!apiKey) {
      throw new AppError(
        'OpenAI kaliti sozlanmagan — Sozlamalar sahifasidan kiriting',
        500,
        'OPENAI_KEY_MISSING',
      );
    }
    if (input.signal?.aborted) throw new AbortedError('Agent javobi to\'xtatildi');

    const systemPrompt = buildSystemPrompt(
      this.persona,
      input.stage,
      mode === 'first' ? 'new' : input.conversationState,
      input.knowledge,
    );
    const userPrompt = buildUserPrompt(input, mode, new Date());

    // Ikkita mustaqil sabab bilan to'xtashi kerak: foydalanuvchi/tizim
    // o'zi bekor qilsa (`input.signal`) VA javob juda uzoq kutilsa
    // (`timeoutSignal`) — `AbortSignal.any` ikkalasini bir signalga
    // birlashtiradi, birortasi tetiklansa so'rov to'xtaydi.
    const timeoutSignal = AbortSignal.timeout(SOROV_MUDDATI_MS);
    const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;

    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(`${this.opts.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.opts.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          // `strict: true` — sxemamiz buning talablariga allaqachon javob
          // beradi (`additionalProperties: false` va to'liq `required`).
          // Shunda model maydon o'ylab topa olmaydi va `toTurnOutput`
          // xaritasi ikkala engine uchun bir xil ishlaydi. Provayder
          // sxemani qabul qilmasa — xato matni buni aniq aytadi va
          // `strict` ni false ga o'zgartirish kifoya.
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'agent_javobi', strict: true, schema: AGENT_OUTPUT_SCHEMA },
          },
        }),
        signal,
      });
    } catch (err) {
      if (input.signal?.aborted) throw new AbortedError('Agent javobi to\'xtatildi');
      if (timeoutSignal.aborted) {
        throw new AppError(
          `OpenAI javob bermadi (timeout): ${SOROV_MUDDATI_MS / 1000} soniyada javob kelmadi`,
          504,
          'OPENAI_TIMEOUT',
        );
      }
      throw err;
    }

    if (!response.ok) {
      // Xato matnini KESMASDAN uzatamiz: bu yerda eng ko'p uchraydigan
      // muammo — noto'g'ri model nomi yoki kalit, va javobning o'zi
      // aynan nima xato ekanini aytadi. LEKIN MANBADA — shu yerda —
      // `providerXatosiniTozala` bilan tozalanadi: bu matn keyin
      // `AgentRunner.navbat()` da `log.warn({ err })` orqali jurnalga
      // (va paneldagi jurnal sahifasiga) ham tushadi, shuning uchun
      // tozalash chaqiruvchi tomonda emas, aynan shu yerda — xato
      // yaratilayotgan joyda bo'lishi shart (`providerXatosi.ts`
      // izohiga qarang).
      const body = await response.text().catch(() => '');
      throw new AppError(
        providerXatosiniTozala(`OpenAI javob bermadi (${response.status}): ${body.slice(0, 500)}`),
        502,
        'OPENAI_FAILED',
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
      };
    };

    const text = data.choices?.[0]?.message?.content ?? '';
    const parsed = parseAgentOutput(null, text);

    const cached = data.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    const prompt = data.usage?.prompt_tokens ?? 0;
    const usage: AgentTurnOutput['usage'] = {
      model: this.opts.model,
      // Keshdan o'qilganini kiruvchidan ayiramiz — Anthropic hisobida ular
      // allaqachon alohida keladi, ya'ni ikkala ustun bir xil ma'noda
      // bo'lishi uchun shu ayirish shart.
      inputTokens: Math.max(0, prompt - cached),
      outputTokens: data.usage?.completion_tokens ?? 0,
      cacheReadTokens: cached,
      cacheWriteTokens: 0,
      // Narxni bu yerda hisoblamaymiz: token narxi provayder tarifiga
      // bog'liq va uni kodga yozib qo'yish — eskirishi aniq bo'lgan raqam.
      // Solishtiruv tokenlar bo'yicha boradi, narx tarifga ko'paytiriladi.
      costUsd: 0,
      durationMs: Date.now() - started,
    };

    log.info(
      { conversationId: input.conversationId, ms: usage.durationMs, model: this.opts.model },
      'OpenAI javob berdi',
    );

    return toTurnOutput(parsed, null, usage);
  }
}
