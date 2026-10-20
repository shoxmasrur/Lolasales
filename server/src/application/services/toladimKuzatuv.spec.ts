import { AgentRunner } from '@/application/services/AgentRunner';
import type { Conversation } from '@/domain/entities/Conversation';
import type { AgentTurnOutput } from '@/domain/services/IAgentEngine';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';

/**
 * Qo'lda ishga tushiriladi: npm run test:toladim-kuzatuv --workspace=server
 *
 * Mijoz "to'ladim" dedi, CRM'da to'lov hali yo'q — agent chek so'ramaydi,
 * `paymentClaim` qo'yadi va tizim CRM kuzatuvini ochadi. Kuzatuv javobni
 * kutmasdan ochiladi va uning xatosi agent javobini yiqitmaydi.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  ${izoh}`}`);
};

const conversation = { id: 'cv1', clientId: 'c1', state: 'negotiating' } as unknown as Conversation;

function build(): AgentRunner {
  const conversations = { update: async () => undefined } as unknown as IConversationRepository;
  const bosh = {} as never;
  return new AgentRunner(
    bosh, bosh, bosh, conversations, bosh, bosh,
    bosh, bosh, bosh, { publish: () => undefined } as never, bosh,
    bosh, bosh, bosh, bosh, bosh, bosh, bosh, bosh, bosh, bosh,
  );
}

function output(paymentClaim: boolean): AgentTurnOutput {
  return {
    reply: null,
    replySecond: null,
    sessionId: null,
    promise: null,
    nextState: null,
    escalate: null,
    internalNote: null,
    lesson: null,
    clientMemory: null,
    paymentClaim,
  };
}

type Apply = { apply(c: Conversation, contractId: string | null, o: AgentTurnOutput, autoSend: boolean): Promise<unknown> };
const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

async function main(): Promise<void> {
  const runner = build();
  const ochilgan: string[] = [];
  runner.setPaymentClaimWatch(async (id) => {
    ochilgan.push(id);
  });

  await (runner as unknown as Apply).apply(conversation, null, output(true), false);
  await flush();
  check("to'lov da'vosida kuzatuv ochiladi", ochilgan.length === 1 && ochilgan[0] === 'cv1', JSON.stringify(ochilgan));

  await (runner as unknown as Apply).apply(conversation, null, output(false), false);
  await flush();
  check("da'vo bo'lmasa kuzatuv ochilmaydi", ochilgan.length === 1);

  const xatoli = build();
  xatoli.setPaymentClaimWatch(async () => {
    throw new Error('CRM javob bermadi');
  });
  let yiqildi = false;
  try {
    await (xatoli as unknown as Apply).apply(conversation, null, output(true), false);
    await flush();
  } catch {
    yiqildi = true;
  }
  check('kuzatuv xatosi javobni yiqitmaydi', !yiqildi);

  console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
  process.exitCode = failed ? 1 : 0;
}

void main();
