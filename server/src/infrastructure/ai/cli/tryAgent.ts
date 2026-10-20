import { ClaudeAgentEngine } from '@/infrastructure/ai/ClaudeAgentEngine';
import { resolveAgentAuth } from '@/infrastructure/ai/agentAuth';
import type { Course, CourseKnowledge } from '@/domain/entities/Course';
import type { AgentSalesContext, AgentTurnOutput, HistoryItem } from '@/domain/services/IAgentEngine';
import { defaultRulesText } from '@/infrastructure/ai/prompt/defaultRulesText';
import { config } from '@/shared/config';

/**
 * Agentni real mijozlarsiz, bazaga tegmasdan sinab ko'rish.
 *
 *   npm run try-agent --workspace=server
 *   npm run try-agent --workspace=server -- "narxi qancha?" "bo'lib to'lasa bo'ladimi?"
 *
 * Har bir argument — mijozning navbatdagi javobi. Argumentsiz chaqirilsa,
 * faqat birinchi murojaat matni ko'rsatiladi. Kontekst — sotuvdagi bitta
 * kurs va guruh kommentidan kelgan mijoz.
 */

const KURS: Course = {
  id: 'kurs-smm-nov',
  name: 'SMM noldan',
  description: 'Instagram va Telegram uchun kontent yaratish va reklama',
  salesStart: '2026-01-01',
  salesEnd: '2099-12-31',
  price: 1_500_000,
  duration: '4 hafta, haftasiga 3 dars',
  topics: ['Kontent reja', 'Reels va video', 'Target reklama', 'Mijoz bilan yozishma'],
  startsOn: '2026-11-25',
  groupLink: 'https://t.me/+sinov',
  isActive: true,
  installmentAllowed: true,
  installmentParts: 3,
  installmentFirstMin: 500_000,
  linkAfter: 'birinchi_qism',
};

const BAZA: CourseKnowledge[] = [
  { id: 'b1', courseId: KURS.id, kind: 'dastur', title: '1-hafta', body: 'Profilni tartibga solish va kontent reja.', sortOrder: 1, isEnabled: true },
  { id: 'b2', courseId: KURS.id, kind: 'savol_javob', title: 'Darslar yozib olinadimi?', body: 'Ha, barcha darslar yozib olinadi va 3 oy ochiq turadi.', sortOrder: 2, isEnabled: true },
  { id: 'b3', courseId: KURS.id, kind: 'etiroz', title: 'Qimmat', body: 'Kurs oxirida birinchi mijozingizni topasiz — u kurs narxini qoplaydi.', sortOrder: 3, isEnabled: true },
];

const SAMPLE: AgentSalesContext = {
  clientName: 'Aliyeva Malika',
  clientFirstName: 'Malika',
  source: 'guruh',
  sourceGroup: 'SMM maktabi',
  sourceComment: 'Qiziq, menga ham batafsil yozing',
  purchase: null,
  coursesOnSale: [{ course: KURS, knowledge: BAZA }],
  nextCourse: null,
  boughtCourses: [],
};

const line = (ch = '─'): string => ch.repeat(72);

function show(label: string, out: AgentTurnOutput): void {
  console.log(`\n${label}`);
  console.log(line());
  console.log(out.reply ?? '(xabar yo\'q)');
  if (out.replySecond) console.log(`\n${out.replySecond}`);
  console.log(line('·'));
  console.log(
    `bosqich: ${out.stage ?? '—'}   kurs: ${out.courseId ?? '—'}   karta: ${out.sendCard ? 'HA' : 'yo\'q'}` +
      `   bo'lib to'lash: ${out.installment ? 'HA' : 'yo\'q'}`,
  );
  if (out.escalate) console.log(`ESKALATSIYA: ${out.escalate.reason}`);
  if (out.internalNote) console.log(`eslatma: ${out.internalNote}`);
  if (out.lesson) console.log(`SABOQ (tasdiq kutadi): ${out.lesson.lesson}`);
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
    console.log(`tokenlar: ${out.usage.inputTokens} → ${out.usage.outputTokens}  narx: $${out.usage.costUsd.toFixed(4)}`);
  }
}

async function main(): Promise<void> {
  const clientReplies = process.argv.slice(2);
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
  console.log(`Mijoz: ${SAMPLE.clientName}   manba: ${SAMPLE.source} («${SAMPLE.sourceComment}»)`);
  console.log(`Sotuvdagi kurs: ${KURS.name}`);

  // Sinov rejimida qoidalar bazadan emas, kodda yozilgan standartlardan olinadi.
  const base = {
    conversationId: 'sinov',
    clientId: 'sinov',
    context: SAMPLE,
    sessionId: null,
    receiptPending: false,
    knowledge: {
      rules: defaultRulesText(),
      lessons: '',
      clientMemory: '',
      personaName: 'Lola',
      companyName: 'LolaSales',
    },
  };

  const first = await engine.composeFirstContact({ ...base, history: [] });
  show('AGENT (birinchi murojaat):', first);

  const history: HistoryItem[] = first.reply ? [{ role: 'agent', text: first.reply, at: new Date() }] : [];

  for (const reply of clientReplies) {
    console.log(`\nMIJOZ:\n${line()}\n${reply}`);
    const turn = await engine.respond({ ...base, history: [...history], incoming: reply });
    history.push({ role: 'client', text: reply, at: new Date() });
    if (turn.reply) history.push({ role: 'agent', text: turn.reply, at: new Date() });
    show('AGENT:', turn);
  }

  console.log('');
}

await main();
