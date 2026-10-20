import type { Interlocutor } from '@/domain/entities/AgentMemory';
import type { AgentTurnOutput } from '@/domain/services/IAgentEngine';
import { childLogger } from '@/shared/logger';

/**
 * Modelning xom javobini tizim tushunadigan ko'rinishga keltirish.
 *
 * NEGA ALOHIDA MODUL: bu qadam ikkala engine uchun ham bir xil bo'lishi
 * kerak. Aks holda solishtiruvda modelning emas, tozalash mantig'ining
 * farqi ko'rinardi — masalan bittasi ortiqcha teglarni olib tashlab,
 * ikkinchisi qoldirsa, gap sifat haqida emas, kod haqida bo'lib qolardi.
 */
const log = childLogger('agent-output');

export interface RawAgentOutput {
  reply?: string | null;
  replySecond?: string | null;
  state?: string | null;
  promise?: { amount?: number; date?: string; quote?: string } | null;
  escalate?: string | null;
  note?: string | null;
  lesson?: { lesson?: string; evidence?: string | null } | null;
  clientMemory?: {
    clientType?: string | null;
    summary?: string | null;
    whatWorks?: string | null;
  } | null;
  interlocutor?: { name?: string | null; gender?: string | null; relation?: string | null } | null;
  paymentClaim?: boolean | null;
}

/**
 * Model ba'zan tuzilgan javob ichiga o'zining ichki belgilarini
 * (`</note>`, `</invoke>` kabi) qo'shib yuboradi. Bu matn mijozga ketmasligi kerak.
 */
export function sanitize(text: string | null | undefined): string | null {
  if (!text) return null;
  const cleaned = text
    .replace(/<\/?[a-zA-Z_][\w-]*\s*\/?>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  return cleaned || null;
}

function hasClientMemory(memory: RawAgentOutput['clientMemory']): boolean {
  if (!memory) return false;
  return Boolean(memory.clientType || memory.summary?.trim() || memory.whatWorks?.trim());
}

/**
 * Ism ham, kimligi ham bo'lmasa suhbatdosh saqlanmaydi: "boshqa odam yozadi"
 * degan quruq belgidan agent murojaatni tuza olmaydi.
 */
export function toInterlocutor(raw: RawAgentOutput['interlocutor']): Interlocutor | null {
  const name = sanitize(raw?.name);
  const relation = sanitize(raw?.relation);
  if (!raw || (!name && !relation)) return null;
  return {
    name,
    gender: raw.gender === 'male' || raw.gender === 'female' ? raw.gender : null,
    relation,
  };
}

export function parseAgentOutput(structured: unknown, fallbackText: string): RawAgentOutput {
  if (structured && typeof structured === 'object') return structured as RawAgentOutput;

  // Zaxira yo'l: model JSON'ni matn ichida qaytargan bo'lsa.
  const match = /\{[\s\S]*\}/.exec(fallbackText);
  if (match) {
    try {
      return JSON.parse(match[0]) as RawAgentOutput;
    } catch {
      /* pastdagi zaxiraga o'tamiz */
    }
  }

  log.warn({ fallbackText: fallbackText.slice(0, 200) }, 'Agent tuzilgan javob qaytarmadi');
  return { reply: fallbackText.trim() || null, state: 'negotiating' };
}

export function toTurnOutput(
  parsed: RawAgentOutput,
  sessionId: string | null,
  usage: AgentTurnOutput['usage'],
): AgentTurnOutput {
  return {
    reply: sanitize(parsed.reply),
    replySecond: sanitize(parsed.replySecond),
    sessionId,
    promise:
      parsed.promise && parsed.promise.amount && parsed.promise.date
        ? {
            amount: Number(parsed.promise.amount),
            promisedDate: parsed.promise.date,
            quote: sanitize(parsed.promise.quote),
          }
        : null,
    nextState: parsed.state ?? null,
    escalate: parsed.escalate ? { reason: sanitize(parsed.escalate) ?? 'sabab ko\'rsatilmagan' } : null,
    internalNote: sanitize(parsed.note),
    lesson:
      parsed.lesson?.lesson && sanitize(parsed.lesson.lesson)
        ? { lesson: sanitize(parsed.lesson.lesson)!, evidence: sanitize(parsed.lesson.evidence) }
        : null,
    clientMemory: hasClientMemory(parsed.clientMemory)
      ? {
          clientType: parsed.clientMemory!.clientType ?? null,
          summary: sanitize(parsed.clientMemory!.summary),
          whatWorks: sanitize(parsed.clientMemory!.whatWorks),
        }
      : null,
    interlocutor: toInterlocutor(parsed.interlocutor),
    paymentClaim: parsed.paymentClaim === true,
    usage,
  };
}
