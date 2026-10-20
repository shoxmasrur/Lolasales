import { query } from '@anthropic-ai/claude-agent-sdk';

import type { ITuzilganLlm, TuzilganSorov } from '@/domain/services/ITuzilganLlm';
import { resolveAgentAuth } from '@/infrastructure/ai/agentAuth';
import { config } from '@/shared/config';
import { AbortedError, AppError } from '@/shared/errors';

/**
 * Noma'lum mijoz agenti uchun — `IAgentEngine` mijozga bog'langan kirishni talab qiladi.
 *
 * Sozlamalar `ClaudeAgentEngine.run` bilan aynan bir xil (asbobsiz, sessiyasiz,
 * foydalanuvchi sozlamalarisiz).
 */
export class ClaudeTuzilganLlm implements ITuzilganLlm {
  async generate(sorov: TuzilganSorov): Promise<unknown> {
    if (sorov.signal?.aborted) throw new AbortedError('Agent javobi to\'xtatildi');

    // SDK signalni emas, butun `AbortController` ni kutadi.
    const controller = new AbortController();
    const forwardAbort = () => controller.abort();
    sorov.signal?.addEventListener('abort', forwardAbort);

    let structured: unknown = null;
    try {
      const response = query({
        prompt: sorov.user,
        options: {
          model: config.AGENT_MODEL,
          systemPrompt: sorov.system,
          env: resolveAgentAuth().env,
          outputFormat: { type: 'json_schema', schema: sorov.schema },
          abortController: controller,
          tools: [],
          maxTurns: 4,
          settingSources: [],
          persistSession: false,
          permissionMode: 'bypassPermissions',
        },
      });

      for await (const message of response) {
        if (message.type !== 'result') continue;
        structured = 'structured_output' in message ? (message.structured_output ?? null) : null;
        if (message.subtype !== 'success' && !structured) {
          throw new AppError(`Agent javob bera olmadi: ${message.subtype}`, 502, 'AGENT_FAILED');
        }
      }
    } catch (err) {
      if (sorov.signal?.aborted) throw new AbortedError('Agent javobi to\'xtatildi');
      throw err;
    } finally {
      // Tinglovchi har qanday yo'lda olib tashlanadi (signal uzoq yashashi mumkin).
      sorov.signal?.removeEventListener('abort', forwardAbort);
    }

    if (sorov.signal?.aborted) throw new AbortedError('Agent javobi to\'xtatildi');
    return structured;
  }
}
