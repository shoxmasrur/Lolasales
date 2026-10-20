import { config } from '@/shared/config';

/** Claude Code obuna tokenlari shu prefiks bilan boshlanadi (API kaliti — `sk-ant-api…`). */
export const OAUTH_PREFIX = 'sk-ant-oat';

export type AgentAuthMode = 'api' | 'subscription' | 'none';

export interface AgentAuth {
  readonly env: Record<string, string | undefined>;
  readonly mode: AgentAuthMode;
}

/**
 * Avtorizatsiya qaysi sozlamalardan aniqlanadi. Sukut — `config`; test
 * o'z qiymatlarini beradi va `.env` ga bog'liq bo'lmaydi.
 */
export interface AgentAuthSource {
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly CLAUDE_CODE_OAUTH_TOKEN?: string | undefined;
  readonly AGENT_AUTH_MODE: 'auto' | 'api' | 'subscription';
}

/**
 * Agent (va rasm tasnifchisi) qanday avtorizatsiya qilishini aniqlaydi.
 *
 * Ikki xil hisob varianti bor va ular turli muhit o'zgaruvchisini talab qiladi:
 *   • API kalit (`sk-ant-api…`)  → ANTHROPIC_API_KEY, so'rov bo'yicha to'lov
 *   • Obuna tokeni (`sk-ant-oat…`) → CLAUDE_CODE_OAUTH_TOKEN, Claude Code obunasi
 *
 * `AGENT_AUTH_MODE=auto` (sukut) bo'lganda tur kalit prefiksidan aniqlanadi —
 * shunda tokenni noto'g'ri o'zgaruvchiga yozib qo'yish xatoga olib kelmaydi.
 *
 * NEGA ALOHIDA FAYL: ilgari bu `ClaudeAgentEngine` ichida edi va rasm
 * tasnifchisi uni ko'rmasdi — prodda obuna tokeni `x-api-key` sarlavhasida
 * yuborilib, 11-sentabrdan beri 53 ta chaqiruvning hammasi 401 oldi.
 */
export function resolveAgentAuth(source: AgentAuthSource = config): AgentAuth {
  const apiKey = source.ANTHROPIC_API_KEY?.trim();
  const oauthToken = source.CLAUDE_CODE_OAUTH_TOKEN?.trim();

  // Obuna tokeni ANTHROPIC_API_KEY ga yozilgan bo'lsa ham to'g'ri joyga yo'naltiramiz.
  const token = oauthToken || (apiKey?.startsWith(OAUTH_PREFIX) ? apiKey : undefined);
  const key = apiKey && !apiKey.startsWith(OAUTH_PREFIX) ? apiKey : undefined;

  const preferSubscription =
    source.AGENT_AUTH_MODE === 'subscription' || (source.AGENT_AUTH_MODE === 'auto' && Boolean(token));

  if (preferSubscription && token) {
    return { mode: 'subscription', env: { CLAUDE_CODE_OAUTH_TOKEN: token, ANTHROPIC_API_KEY: undefined } };
  }
  if (key) {
    return { mode: 'api', env: { ANTHROPIC_API_KEY: key, CLAUDE_CODE_OAUTH_TOKEN: undefined } };
  }
  return { mode: 'none', env: {} };
}
