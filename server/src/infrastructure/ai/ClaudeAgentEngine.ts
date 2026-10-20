import { query } from '@anthropic-ai/claude-agent-sdk';

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
import { resolveAgentAuth } from '@/infrastructure/ai/agentAuth';
import { config } from '@/shared/config';
import { AbortedError, AppError } from '@/shared/errors';
import { childLogger } from '@/shared/logger';

const log = childLogger('agent');

const TURN_LOG: Record<TurnMode, string> = {
  first: 'Birinchi murojaat tayyorlandi',
  reply: 'Agent javob berdi',
  nudge: 'Eslatma tayyorlandi',
  operator: 'Operator topshirig\'i bo\'yicha xabar tayyorlandi',
  receipt_confirmed: 'Chek tasdig\'i uchun rahmat tayyorlandi',
  receipt_rejected: 'Rad etilgan chek bo\'yicha xabar tayyorlandi',
};

/**
 * Claude Agent SDK ustidagi adapter.
 *
 * Agent hech qanday faylga yoki terminalga tegmaydi (`tools: []`) — u faqat
 * berilgan kontekst asosida matn ishlab chiqaradi va JSON sxema bo'yicha
 * tuzilgan javob qaytaradi. Bu "raqam o'ylab topish" xavfini kamaytiradi.
 */
export class ClaudeAgentEngine implements IAgentEngine {
  constructor(private readonly persona: PromptPersona = DEFAULT_PERSONA) {}

  async composeFirstContact(input: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput> {
    return this.run({ ...input, incoming: null }, 'first');
  }

  async respond(input: AgentTurnInput): Promise<AgentTurnOutput> {
    return this.run(input, 'reply');
  }

  async composeNudge(input: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput> {
    return this.run({ ...input, incoming: null }, 'nudge');
  }

  async composeOperatorTurn(input: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput> {
    return this.run({ ...input, incoming: null }, 'operator');
  }

  async composeReceiptConfirmed(input: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput> {
    return this.run({ ...input, incoming: null }, 'receipt_confirmed');
  }

  async composeReceiptRejected(input: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput> {
    return this.run({ ...input, incoming: null }, 'receipt_rejected');
  }

  private async run(input: AgentTurnInput, mode: TurnMode): Promise<AgentTurnOutput> {
    // Chaqiruvdan OLDIN tekshiramiz: model so'rovi pul turadi va soniyalar
    // oladi. Operator "To'xtatish"ni allaqachon bosgan bo'lsa, keraksizligi
    // ma'lum bo'lgan javobni yozdirish — sof isrof. Ommaviy ishda bu farq
    // yuzlab mijozga ko'payadi, shuning uchun `query()` umuman boshlanmaydi.
    if (input.signal?.aborted) {
      throw new AbortedError('Agent javobi to\'xtatildi');
    }

    const systemPrompt = buildSystemPrompt(this.persona, input.knowledge.companyName ?? '', input.knowledge);
    const userPrompt = buildUserPrompt(input, mode, new Date());

    const started = Date.now();
    let structured: unknown;
    let sessionId: string | null = input.sessionId;
    let usage: AgentTurnOutput['usage'];
    let resultText = '';

    // SDK signalni emas, butun `AbortController` ni kutadi — shuning uchun
    // o'zimizniki yaratamiz va tashqi signalni unga uzatamiz.
    const controller = new AbortController();
    const forwardAbort = () => controller.abort();
    input.signal?.addEventListener('abort', forwardAbort);

    try {
      const response = query({
        prompt: userPrompt,
        options: {
          model: config.AGENT_MODEL,
          systemPrompt,
          env: resolveAgentAuth().env,
          outputFormat: { type: 'json_schema', schema: AGENT_OUTPUT_SCHEMA },
          abortController: controller,
          // Agent hech qanday asbobga muhtoj emas — faqat matn ishlab chiqaradi.
          tools: [],
          // 1 ta navbat juda tor: model ba'zan tuzilgan javobni alohida qadamda
          // beradi va `error_max_turns` bilan uziladi.
          maxTurns: 4,
          // Foydalanuvchining shaxsiy CLAUDE.md / sozlamalari agentga aralashmasin.
          settingSources: [],
          persistSession: false,
          permissionMode: 'bypassPermissions',
        },
      });

      for await (const message of response) {
        if (message.type === 'system' && 'session_id' in message) {
          sessionId = (message as { session_id?: string }).session_id ?? sessionId;
        }
        if (message.type === 'result') {
          sessionId = message.session_id ?? sessionId;
          structured = 'structured_output' in message ? message.structured_output : undefined;
          resultText = 'result' in message ? (message.result ?? '') : '';
          // Kesh maydonlari SDK turida e'lon qilinmagan bo'lishi mumkin,
          // lekin javobda keladi. Ular narxning katta qismini tushuntiradi
          // (bizning system prompt katta va deyarli o'zgarmaydi), shuning
          // uchun turdan qat'i nazar o'qib olamiz.
          const u = message.usage as
            | { cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
            | undefined;
          usage = {
            model: config.AGENT_MODEL,
            inputTokens: message.usage?.input_tokens ?? 0,
            outputTokens: message.usage?.output_tokens ?? 0,
            cacheReadTokens: u?.cache_read_input_tokens ?? 0,
            cacheWriteTokens: u?.cache_creation_input_tokens ?? 0,
            costUsd: message.total_cost_usd ?? 0,
            durationMs: Date.now() - started,
          };

          // Navbat limitiga urilgan bo'lsa ham, tuzilgan javob bo'lsa — yaroqli.
          if (message.subtype !== 'success' && !structured) {
            throw new AppError(`Agent javob bera olmadi: ${message.subtype}`, 502, 'AGENT_FAILED');
          }
          if (message.subtype !== 'success') {
            log.warn({ subtype: message.subtype }, 'Agent limitga urildi, lekin javob olindi');
          }
        }
      }
    } catch (err) {
      // To'xtatilgan bo'lsa SDK o'zining xom `AbortError` ini tashlaydi. Uni
      // yuqori qatlam oddiy nosozlikdan ajrata olmaydi va "agent buzildi" deb
      // qayta urinishi mumkin edi — shuning uchun bu yerda `AbortedError` ga
      // aylantiramiz. Boshqa har qanday xato o'zgarishsiz ko'tariladi: haqiqiy
      // nosozlikni "to'xtatildi" deb yashirish uni butunlay ko'rinmas qilardi.
      if (input.signal?.aborted) {
        throw new AbortedError('Agent javobi to\'xtatildi');
      }
      throw err;
    } finally {
      // Tinglovchi HAR QANDAY yo'lda — muvaffaqiyat, xato, to'xtatish —
      // olib tashlanishi shart. `input.signal` uzoq yashaydi: ommaviy ishda
      // BITTA signal yuzlab mijoz uchun ulashiladi. Har chaqiruvda qo'shilgan
      // tinglovchi olib tashlanmasa, ular butun ish davomida to'planadi va
      // Node `MaxListenersExceededWarning` beradi. `{ once: true }` bu yerda
      // yordam bermaydi: odatdagi (to'xtatilmagan) yo'lda tinglovchi umuman
      // ishga tushmaydi, ya'ni o'zi hech qachon o'chmaydi.
      input.signal?.removeEventListener('abort', forwardAbort);
    }

    // Sikl oxirigacha yetgan bo'lsa ham to'xtatishni qayta tekshiramiz:
    // signal so'nggi xabardan keyin kelgan bo'lishi mumkin. Yarim yozilgan
    // yoki keraksiz bo'lib qolgan javob mijozga HECH QACHON ketmasligi kerak,
    // shuning uchun tahlil qilmasdan turib to'xtaymiz.
    if (input.signal?.aborted) {
      throw new AbortedError('Agent javobi to\'xtatildi');
    }

    const parsed = parseAgentOutput(structured, resultText);

    log.info(
      {
        conversationId: input.conversationId,
        ms: Date.now() - started,
        stage: parsed.stage,
        sendCard: parsed.sendCard === true,
        escalate: Boolean(parsed.escalate),
        costUsd: usage?.costUsd,
      },
      TURN_LOG[mode],
    );

    return toTurnOutput(parsed, sessionId, usage);
  }
}
