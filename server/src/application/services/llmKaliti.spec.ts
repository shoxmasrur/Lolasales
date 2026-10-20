import { LlmKaliti, LLM_SETTINGS_KEY } from '@/application/services/llmKaliti';
import { decrypt } from '@/shared/crypto';
import type { ISettingsRepository } from '@/domain/repositories/ISupportRepositories';

/** Qo'lda ishga tushiriladi: npm run test:llm-kaliti --workspace=server */
let failed = 0;
function eq(nom: string, actual: unknown, kutilgan: unknown): void {
  const a = JSON.stringify(actual); const k = JSON.stringify(kutilgan);
  if (a === k) console.log(`✓ ${nom}`);
  else { failed += 1; console.log(`✗ ${nom}: ${a} (kutilgan ${k})`); }
}

function xotiradagiSozlamalar(boshlangich: Record<string, unknown> = {}) {
  const saqlangan = { ...boshlangich };
  const repo: ISettingsRepository = {
    get: async <T>(key: string) => (saqlangan[key] ?? null) as T | null,
    set: async (key: string, value: unknown) => { saqlangan[key] = value; },
    all: async () => saqlangan,
  };
  return { repo, saqlangan };
}

// ── Kalit yo'q ────────────────────────────────────────────────────────
{
  const { repo } = xotiradagiSozlamalar();
  const k = new LlmKaliti(repo, { envKey: undefined, envBaseUrl: 'https://api.openai.com/v1' });
  eq('kalit yo\'q → null', await k.openAiKey(), null);
  eq('hasKey false', await k.hasOpenAiKey(), false);
}

// ── Bazadagi kalit .env dagidan ustun ─────────────────────────────────
{
  const { repo, saqlangan } = xotiradagiSozlamalar();
  const k = new LlmKaliti(repo, { envKey: 'env-dagi-kalit', envBaseUrl: 'https://api.openai.com/v1' });
  eq('.env dagi kalit ishlatiladi', await k.openAiKey(), 'env-dagi-kalit');
  // Faqat `.env` dagi kalit bo'lsa — manba shuni aytadi (panel «o'chirish»
  // tugmasini shu holatda ko'rsatmasligi kerak, `llmKaliti.ts` izohiga
  // qarang).
  eq('manba env', await k.kalitManbasi(), 'env');

  await k.setOpenAiKey('bazadagi-kalit', 'admin@xonsaroy.uz');
  eq('baza ustun', await k.openAiKey(), 'bazadagi-kalit');
  eq('manba baza', await k.kalitManbasi(), 'baza');
  // Kalit OCHIQ saqlanmaydi — bazani o'qigan odam uni ko'rmasligi kerak.
  const yozilgan = saqlangan[LLM_SETTINGS_KEY] as { openaiKeyEnc: string };
  eq('shifrlangan saqlanadi', yozilgan.openaiKeyEnc === 'bazadagi-kalit', false);
  eq('shifr ochilganda asl kalit', decrypt(yozilgan.openaiKeyEnc), 'bazadagi-kalit');
}

// ── Manba: hech qanday kalit bo'lmasa ──────────────────────────────────
{
  const { repo } = xotiradagiSozlamalar();
  const k = new LlmKaliti(repo, { envKey: undefined, envBaseUrl: 'https://api.openai.com/v1' });
  eq('manba yo\'q', await k.kalitManbasi(), null);
}

// ── hasOpenAiKey() buzuq shifrda 500 emas, false qaytaradi ─────────────
{
  const { repo } = xotiradagiSozlamalar({
    [LLM_SETTINGS_KEY]: { openaiKeyEnc: 'buzuq-shifr-matni' },
  });
  const k = new LlmKaliti(repo, { envKey: undefined, envBaseUrl: 'https://api.openai.com/v1' });
  eq('buzuq shifrda hasKey false (otilmaydi)', await k.hasOpenAiKey(), false);
}

// ── O'chirish ─────────────────────────────────────────────────────────
{
  const { repo } = xotiradagiSozlamalar();
  const k = new LlmKaliti(repo, { envKey: undefined, envBaseUrl: 'https://api.openai.com/v1' });
  await k.setOpenAiKey('kalit');
  await k.setOpenAiKey(null);
  eq('o\'chirilgandan keyin null', await k.openAiKey(), null);
}

console.log(failed ? `${failed} ta xato` : 'Hammasi o\'tdi');
process.exit(failed ? 1 : 0);
