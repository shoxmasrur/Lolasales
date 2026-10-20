import { ClaudeAgentEngine } from '@/infrastructure/ai/ClaudeAgentEngine';
import { resolveAgentAuth } from '@/infrastructure/ai/agentAuth';
import type { AgentDebtContext, AgentTurnOutput } from '@/domain/services/IAgentEngine';
import type { ConversationState, EscalationStage } from '@/domain/entities/Conversation';
import { stageForOverdueDays } from '@/domain/policies/EscalationPolicy';
import { defaultRulesText } from '@/infrastructure/ai/prompt/defaultRulesText';
import { formatSom } from '@/shared/money';
import { config } from '@/shared/config';

/**
 * Agentni real mijozlarsiz, bazaga tegmasdan sinab ko'rish.
 *
 *   npm run try-agent --workspace=server
 *   npm run try-agent --workspace=server -- "harakat qilyapmiz" "payshanba kuni 5 mln"
 *
 * Har bir argument — mijozning navbatdagi javobi. Argumentsiz chaqirilsa,
 * faqat birinchi murojaat matni ko'rsatiladi.
 */

// Playbook 6-bo'limidagi real mijoz profiliga yaqin namuna.
// Ikkita shartnoma — aynan shu holat agentni eng ko'p chalg'itadi,
// shuning uchun stendda doim shu ko'rinishda turadi. Mijozning
// yig'indisi (`debtFirst`/`debtMonthly`/`debtSum`) shu ro'yxatning
// yig'indisiga TENG bo'lishi shart: aks holda stend real hayotda
// uchramaydigan holatni sinardi.
const SAMPLE: AgentDebtContext = {
  clientName: 'Xamrayev Maxmadi',
  clientFirstName: 'Maxmadi',
  debtFirst: 12_000_000,
  debtMonthly: 40_080_000,
  debtSum: 52_080_000,
  daysOverdue: 190,
  contracts: [
    {
      contractNo: '1700AFS26M3',
      objectName: 'XON SAROY AFSONASI',
      apartment: { number: '7A-42', floor: 4, rooms: 3, entrance: '7', block: 'Blok 7', area: 71.2 },
      monthlyPayment: 8_016_000,
      debtFirst: 12_000_000,
      debtMonthly: 32_064_000, debtMeter: 0, statusLabel: null,
      daysOverdue: 190,
      missedMonths: 4,
      unpaidMonths: [
        { dateIso: '2026-04-15', amount: 8_016_000, paid: 0 },
        { dateIso: '2026-05-15', amount: 8_016_000, paid: 0 },
        { dateIso: '2026-06-15', amount: 8_016_000, paid: 0 },
        { dateIso: '2026-07-15', amount: 8_016_000, paid: 0 },
      ],
      recentPayments: [
        { dateIso: '2026-02-20', amount: 8_016_000 },
        { dateIso: '2026-01-18', amount: 8_016_000 },
      ],
      nextPaymentDate: '2026-07-15',
      contractDate: '2026-04-11',
      completionDate: null,
      paidTotal: 136_397_200,
      warningCount: 11,
    },
    {
      contractNo: '1701AFS26M4',
      objectName: 'XON SAROY AFSONASI',
      apartment: { number: '9B-15', floor: 2, rooms: 2, entrance: '9', block: 'Blok 9', area: 52.4 },
      monthlyPayment: 4_008_000,
      debtFirst: 0,
      debtMonthly: 8_016_000, debtMeter: 0, statusLabel: null,
      daysOverdue: 35,
      missedMonths: 2,
      unpaidMonths: [
        { dateIso: '2026-06-05', amount: 4_008_000, paid: 0 },
        { dateIso: '2026-07-05', amount: 4_008_000, paid: 0 },
      ],
      recentPayments: [{ dateIso: '2026-05-06', amount: 4_008_000 }],
      nextPaymentDate: '2026-08-05',
      contractDate: '2026-02-19',
      completionDate: null,
      paidTotal: 24_048_000,
      warningCount: 2,
    },
  ],
};

const line = (ch = '─'): string => ch.repeat(72);

function show(label: string, out: AgentTurnOutput): void {
  console.log(`\n${label}`);
  console.log(line());
  console.log(out.reply ?? '(xabar yo\'q)');
  console.log(line('·'));
  console.log(`holat: ${out.nextState ?? '—'}`);
  if (out.promise) {
    console.log(
      `VA'DA: ${formatSom(out.promise.amount)} — ${out.promise.promisedDate}` +
        (out.promise.quote ? `  («${out.promise.quote}»)` : ''),
    );
  }
  if (out.escalate) console.log(`ESKALATSIYA: ${out.escalate.reason}`);
  if (out.internalNote) console.log(`eslatma: ${out.internalNote}`);
  if (out.lesson) {
    console.log(`SABOQ (tasdiq kutadi): ${out.lesson.lesson}`);
    if (out.lesson.evidence) console.log(`   dalil: «${out.lesson.evidence}»`);
  }
  if (out.clientMemory) {
    const m = out.clientMemory;
    console.log(
      'MIJOZ XOTIRASI: ' +
        [m.clientType && `tip=${m.clientType}`, m.summary, m.whatWorks && `ishlagan: ${m.whatWorks}`]
          .filter(Boolean)
          .join(' | '),
    );
  }
  if (out.usage) {
    console.log(
      `tokenlar: ${out.usage.inputTokens} → ${out.usage.outputTokens}` +
        `  narx: $${out.usage.costUsd.toFixed(4)}`,
    );
  }
}

async function main(): Promise<void> {
  const clientReplies = process.argv.slice(2);
  const stage: EscalationStage = stageForOverdueDays(SAMPLE.daysOverdue);
  const engine = new ClaudeAgentEngine();

  const auth = resolveAgentAuth();
  if (auth.mode === 'none') {
    console.error(
      '\nAgent kaliti topilmadi. .env ga ANTHROPIC_API_KEY (sk-ant-api…) yoki\n' +
        'CLAUDE_CODE_OAUTH_TOKEN (sk-ant-oat…) qo\'shing.\n',
    );
    process.exitCode = 1;
    return;
  }

  console.log(`\nModel: ${config.AGENT_MODEL}   avtorizatsiya: ${auth.mode}`);
  console.log(`Mijoz: ${SAMPLE.clientName}   oylik kechikkan to'lov: ${formatSom(SAMPLE.debtMonthly)}`);
  console.log(`Kechikish: ${SAMPLE.daysOverdue} kun → bosqich: ${stage.toUpperCase()}`);

  // Sinov rejimida qoidalar bazadan emas, kodda yozilgan standartlardan olinadi —
  // shunda baza bo'lmasa ham agentni sinab ko'rish mumkin.
  const base = {
    conversationId: 'sinov',
    clientId: 'sinov',
    contractId: null,
    stage,
    context: SAMPLE,
    sessionId: null,
    brokenPromise: null,
    // Sinov skriptida bayram sinalmaydi.
    bayram: null,
    openPromise: null,
    receiptPending: false,
    paymentReceived: null,
    // Sinov skriptida sukut rejimi sinalmaydi — bu maydon faqat 'nudge' da ma'noli.
    nudgeAttempt: null,
    nudgeLast: null,
    knowledge: {
      rules: defaultRulesText(),
      lessons: '',
      clientMemory: '',
      personaName: 'Madina',
    },
  };

  const first = await engine.composeFirstContact({
    ...base,
    conversationState: 'new' as ConversationState,
    history: [],
  });
  show('AGENT (birinchi murojaat):', first);

  const history: Array<{ role: 'client' | 'agent'; text: string; at: Date }> = first.reply
    ? [{ role: 'agent', text: first.reply, at: new Date() }]
    : [];

  // Holat suhbat davomida o'zgaradi — agent rejimi ham shunga qarab almashadi.
  let state: ConversationState = (first.nextState as ConversationState) ?? 'contacted';

  for (const reply of clientReplies) {
    console.log(`\nMIJOZ  [rejim: ${state}]:\n${line()}\n${reply}`);
    const turn = await engine.respond({
      ...base,
      conversationState: state,
      history: [...history],
      incoming: reply,
    });
    history.push({ role: 'client', text: reply, at: new Date() });
    if (turn.reply) history.push({ role: 'agent', text: turn.reply, at: new Date() });
    if (turn.nextState) state = turn.nextState as ConversationState;
    show('AGENT:', turn);
  }

  console.log('');
}

await main();
