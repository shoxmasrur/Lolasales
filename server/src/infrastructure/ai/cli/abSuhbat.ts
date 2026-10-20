import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ClaudeAgentEngine } from '@/infrastructure/ai/ClaudeAgentEngine';
import { resolveAgentAuth } from '@/infrastructure/ai/agentAuth';
import { OpenAiAgentEngine } from '@/infrastructure/ai/OpenAiAgentEngine';
import type {
  AgentContractFacts,
  AgentDebtContext,
  AgentTurnInput,
  AgentTurnOutput,
  IAgentEngine,
} from '@/domain/services/IAgentEngine';
import type { ConversationState } from '@/domain/entities/Conversation';
import { stageForOverdueDays } from '@/domain/policies/EscalationPolicy';
import { defaultRulesText } from '@/infrastructure/ai/prompt/defaultRulesText';
import { createContainer } from '@/composition/container';
import { closePool } from '@/infrastructure/db/pool';
import type { AgentKnowledgeBlocks } from '@/domain/services/IAgentEngine';
import { childLogger } from '@/shared/logger';
import { formatSom } from '@/shared/money';
import { config } from '@/shared/config';

/**
 * Ikki modelni YONMA-YON solishtirish stendi.
 *
 *   npm run ab-suhbat --workspace=server            # 12 ta ssenariy
 *   npm run ab-suhbat --workspace=server -- 5 6     # faqat 5- va 6-ssenariy
 *
 * Raqamlar berilsa AYNAN o'sha ssenariylar chopiladi. Bu ataylab: bitta
 * qoidani tuzatgandan keyin butun to'plamni qayta to'lash shart emas,
 * yiqilgan ssenariyning o'zini tekshirish yetadi.
 *
 * Ikkala model AYNAN bir xil narsani oladi: system prompt, kontekst,
 * mijozning matnlari va javob sxemasi. Farq faqat modelning o'zida —
 * solishtiruvning ma'nosi shunda.
 *
 * TARIX ALOHIDA YURITILADI: modellar boshqacha javob berishi tabiiy,
 * shuning uchun har biri O'Z javobini o'z tarixida ko'radi. Mijozning
 * matnlari esa ikkalasi uchun bir xil — aks holda bittasiga oson,
 * ikkinchisiga qiyin suhbat tushib qolardi.
 *
 * Bazaga ham, Telegramga ham chiqmaydi: bu yerda faqat matn yaratiladi.
 */

interface Ssenariy {
  readonly nom: string;
  /** Nimani sinaymiz — hisobotda sarlavha ostida turadi. */
  readonly vaziyat: string;
  readonly kontekst: AgentDebtContext;
  /** Mijozning ketma-ket javoblari. Bo'sh — faqat birinchi murojaat. */
  readonly javoblar: readonly string[];
  readonly holat?: ConversationState;
  readonly buzilganVada?: { amount: number; date: string };
  readonly chekTekshiruvda?: boolean;
}

const ASOS_SHARTNOMA: AgentContractFacts = {
  contractNo: '1700AFS26M3',
  objectName: 'XON SAROY AFSONASI',
  apartment: { number: '7A-42', floor: 4, rooms: 3, entrance: '7', block: 'Blok 7', area: 71.2 },
  monthlyPayment: 8_016_000,
  debtFirst: 0,
  debtMonthly: 24_048_000, debtMeter: 0, statusLabel: null,
  daysOverdue: 95,
  missedMonths: 3,
  unpaidMonths: [
    { dateIso: '2026-05-15', amount: 8_016_000, paid: 0 },
    { dateIso: '2026-06-15', amount: 8_016_000, paid: 0 },
    { dateIso: '2026-07-15', amount: 8_016_000, paid: 0 },
  ],
  recentPayments: [{ dateIso: '2026-04-18', amount: 8_016_000 }],
  nextPaymentDate: '2026-08-15',
  contractDate: '2025-11-11',
  completionDate: null,
  paidTotal: 96_192_000,
  warningCount: 4,
};

/**
 * Mijoz darajasidagi yig'indi shartnomalardan HISOBLANADI, qo'lda
 * yozilmaydi. Ssenariyda shartnoma summasini o'zgartirib, jamini
 * yangilashni unutish oson — shunda stend real hayotda uchramaydigan,
 * ichdan zid kontekstni sinardi.
 */
const kop = (contracts: readonly AgentContractFacts[]): AgentDebtContext => {
  const debtFirst = contracts.reduce((s, c) => s + c.debtFirst, 0);
  const debtMonthly = contracts.reduce((s, c) => s + c.debtMonthly, 0);
  return {
    clientName: 'Xamrayev Maxmadi',
    clientFirstName: 'Maxmadi',
    contracts,
    debtFirst,
    debtMonthly,
    debtSum: debtFirst + debtMonthly,
    daysOverdue: contracts.reduce((m, c) => Math.max(m, c.daysOverdue), 0),
  };
};

/** Bitta shartnomali mijoz — ssenariylarning ko'pchiligi shunday. */
const k = (over: Partial<AgentContractFacts>): AgentDebtContext =>
  kop([{ ...ASOS_SHARTNOMA, ...over }]);

/**
 * O'n ikkita ssenariy — real ishdagi asosiy holatlar.
 *
 * Mijozning matnlari ATAYLAB turlicha: xushmuomala, tajovuzkor, ruscha,
 * bir og'iz "ok". Modelning o'zbekchasi aynan shu yerda sinaladi —
 * bir xil iltifotli javobni hamma model yozadi, farq esa qiyin
 * vaziyatlarda ko'rinadi.
 */
const SSENARIYLAR: readonly Ssenariy[] = [
  {
    nom: 'Yaxshi niyatli mijoz',
    vaziyat: 'Kechikishni tan oladi va sana beradi. Agent va\'dani to\'g\'ri yozib olishi kerak.',
    kontekst: k({}),
    javoblar: ['Ha aka bilaman, shu oy biroz qiyin bo\'ldi', 'Payshanba kuni 8 mln tashlab yuboraman'],
  },
  {
    nom: 'Tajovuzkor mijoz',
    vaziyat: 'Bosimga qarshi chiqadi. Agent ohangni tushirishi, lekin sanani qo\'ymay qo\'ymasligi kerak.',
    kontekst: k({ daysOverdue: 190, missedMonths: 5, debtMonthly: 40_080_000 }),
    javoblar: [
      'Menga bosim qilmang, kerak bo\'lsa sudga bering',
      'Sizlar ham vaqtida qurib bermadingiz-ku',
    ],
  },
  {
    nom: 'Qiynalayotgan mijoz',
    vaziyat: 'Haqiqiy qiyinchilik. Agent hamdardlik bildirib, kichik qadam taklif qilishi kerak.',
    kontekst: k({ daysOverdue: 120, missedMonths: 4, debtMonthly: 32_064_000 }),
    javoblar: [
      'Ishdan chiqib qoldim, hozir umuman imkonim yo\'q',
      'Bir oy muhlat bersangiz bo\'ladimi',
    ],
  },
  {
    nom: 'Qochoq mijoz',
    vaziyat: 'Qisqa, qochoq javoblar. Agent bo\'sh gapga tushib qolmasligi kerak.',
    kontekst: k({ daysOverdue: 160, missedMonths: 5, debtMonthly: 40_080_000 }),
    javoblar: ['ok', 'keyinroq gaplashamiz'],
  },
  {
    nom: '"Men to\'laganman" — chek tekshiruvda',
    vaziyat: 'Mijoz chek yubordi, natija hali yo\'q. Agent na tasdiqlashi, na qayta talab qilishi mumkin.',
    kontekst: k({}),
    javoblar: ['Men o\'tgan hafta to\'laganman, chekini yubordim'],
    chekTekshiruvda: true,
  },
  {
    nom: 'Buzilgan va\'da',
    vaziyat: 'Mijoz aytgan kunda to\'lamadi. Agent buni eslatishi, lekin ayblovga o\'tmasligi kerak.',
    kontekst: k({ daysOverdue: 130, missedMonths: 4, debtMonthly: 32_064_000 }),
    javoblar: ['Kechirasiz, pul kelmay qoldi', 'Kelasi hafta aniq qilaman'],
    holat: 'promised',
    buzilganVada: { amount: 8_016_000, date: '2026-08-05' },
  },
  {
    nom: 'Ruscha yozadigan mijoz',
    vaziyat: 'Til moslashuvi. Agent mijoz tiliga o\'tishi kerak.',
    kontekst: k({}),
    javoblar: ['Здравствуйте, я не понимаю по-узбекски', 'Когда крайний срок?'],
  },
  {
    nom: 'Boshlang\'ich to\'lov kechikkan',
    vaziyat: 'Ikkala qism ham bor. Agent ularni alohida aytib, jamini to\'g\'ri chiqarishi kerak.',
    kontekst: k({
      debtFirst: 12_000_000,
      debtMonthly: 24_048_000,
      daysOverdue: 140,
    }),
    javoblar: ['Qaysi summa nimadan chiqdi tushunmadim'],
  },
  {
    nom: 'Shartnomani bekor qilish tahdidi',
    vaziyat: 'Eng nozik holat. Agent qo\'rqitmasligi ham, va\'da bermasligi ham kerak.',
    kontekst: k({ daysOverdue: 210, missedMonths: 6, debtMonthly: 48_096_000 }),
    javoblar: ['Unda shartnomani bekor qilaman, pulimni qaytaring'],
  },
  {
    nom: 'Bir nechta shartnomasi bor mijoz',
    vaziyat:
      'Agent har bir shartnomani RAQAMI bilan alohida aytishi kerak. ' +
      'Summalarni qo\'shib bitta raqam qilib aytsa — mijoz uni o\'z ' +
      'shartnomasiga solishtira olmaydi va tushunmaydi.',
    kontekst: kop([
      ASOS_SHARTNOMA,
      {
        contractNo: '1701AFS26M4',
        objectName: 'XON SAROY AFSONASI',
        apartment: { number: '9B-15', floor: 2, rooms: 2, entrance: '9', block: 'Blok 9', area: 52.4 },
        monthlyPayment: 5_344_000,
        debtFirst: 0,
        debtMonthly: 16_032_000, debtMeter: 0, statusLabel: null,
        daysOverdue: 60,
        missedMonths: 3,
        unpaidMonths: [
          { dateIso: '2026-05-05', amount: 5_344_000, paid: 0 },
          { dateIso: '2026-06-05', amount: 5_344_000, paid: 0 },
          { dateIso: '2026-07-05', amount: 5_344_000, paid: 0 },
        ],
        recentPayments: [{ dateIso: '2026-04-04', amount: 5_344_000 }],
        nextPaymentDate: '2026-08-05',
        contractDate: '2026-01-20',
        completionDate: null,
        paidTotal: 32_064_000,
        warningCount: 1,
      },
    ]),
    javoblar: ['Mening ikkita shartnomam bor, qaysi biri haqida gapiryapsiz?'],
  },
  {
    nom: 'Sababsiz qiyinchilik va qaytarish savoli',
    vaziyat:
      '2026-08-25 dagi real suhbat. Birinchi javobda agent savolga javob berib, ' +
      'SABABNI so\'rashi kerak — summa so\'ramasligi kerak. Ikkinchisida pul ' +
      'qaytishini "to\'liq, jarimasiz" va "ofisda kelishuv imzolangan kundan" ' +
      'deb aytishi va ketidan summa so\'ramasligi kerak (shartnoma 2025-11-11 — 180 kun).',
    kontekst: k({
      daysOverdue: 36,
      missedMonths: 2,
      debtMonthly: 16_032_000,
      unpaidMonths: ASOS_SHARTNOMA.unpaidMonths.slice(1),
    }),
    javoblar: [
      'Sharoit bo\'lmasa to\'lagani, 2-3 oy to\'lamasam nima bo\'ladi?',
      'Shartnoma buzilsa, pulimni qaytarishadimi?',
    ],
  },
  {
    nom: 'Bitish muddati so\'ralganda',
    vaziyat:
      'Mijoz uyning qachon bitishini so\'raydi (mijozlar ko\'pincha kirillda ' +
      'yozadi). Birinchi javobda agent muddatni KONTEKSTDAGI ko\'rinishda — ' +
      'chorak aniqligida — aytishi kerak, oy yoki kunni AYTMASDAN. Ikkinchi ' +
      'javobda mijoz aniqrog\'ini so\'raydi — agent bunda ham oy yoki kun ' +
      'aytmasligi, faqat choragini takrorlashi kerak.',
    kontekst: k({ completionDate: '2029-12-31' }),
    javoblar: ['Уйим качон битади?', 'Аник ойини айтинг'],
  },
];

interface Navbat {
  readonly kim: string;
  readonly matn: string | null;
  readonly holat: string | null;
  readonly vada: string | null;
  readonly eskalatsiya: string | null;
  readonly ms: number;
  readonly tokenlar: string;
}

const log = childLogger('ab-stend');

/**
 * Agentning bilimlar bazasi — PRODDAGIDEK, bazadan.
 *
 * NEGA BAZADAN: ishlab turgan agent qoidalarni `agent_rules` jadvalidan
 * o'qiydi — operator tahrirlari ham, migratsiyalar bilan qo'shilgan
 * taqiqlar ham o'sha yerda. Koddagi standart ro'yxat esa faqat bo'sh
 * bazani urug'lantirish uchun. Solishtiruvni kod ro'yxatida o'tkazsak,
 * ishlab turgan agentdan BOSHQA promptni sinagan bo'lardik.
 *
 * Baza bo'sh yoki yetib bo'lmaydigan bo'lsa — koddagi ro'yxatga
 * tushamiz, lekin buni hisobotda ochiq yozamiz: qaysi manba
 * ishlatilgani natijani o'qishda muhim.
 */
async function bilimlarBazasi(): Promise<{ knowledge: AgentKnowledgeBlocks; manba: string }> {
  const kodgaTushish = (sabab: string): { knowledge: AgentKnowledgeBlocks; manba: string } => ({
    knowledge: { rules: defaultRulesText(), lessons: '', clientMemory: '', personaName: 'Madina' },
    manba: `koddagi standart qoidalar (${sabab})`,
  });

  try {
    const container = createContainer();
    const [rules, lessons] = await Promise.all([
      container.services.promptComposer.renderSections('v1'),
      container.services.promptComposer.renderLessons(),
    ]);

    if (!rules.trim()) return kodgaTushish('bazada qoida yo\'q');

    return {
      // `clientMemory` bo'sh: stenddagi mijoz o'ylab topilgan, uning
      // haqiqiy xotirasi yo'q. Bo'lmagan narsani to'qib qo'shish
      // solishtiruvni buzardi.
      // Ism qat'iy 'Madina': prodda u akkauntdan keladi, stendda esa
      // ikkala model uchun bir xil bo'lishi kerak — aks holda javoblar
      // ismi bilan farq qilib, solishtiruvga shovqin qo'shardi.
      knowledge: { rules, lessons, clientMemory: '', personaName: 'Madina' },
      manba: 'baza (`agent_rules`) — proddagidek',
    };
  } catch (err) {
    log.warn({ err }, 'Bazadan qoidalar olinmadi');
    return kodgaTushish('bazaga ulanib bo\'lmadi');
  }
}

/** Bitta ssenariyni bitta model bilan oxirigacha o'ynab chiqadi. */
async function suhbat(
  engine: IAgentEngine,
  s: Ssenariy,
  knowledge: AgentKnowledgeBlocks,
): Promise<Navbat[]> {
  const stage = stageForOverdueDays(s.kontekst.daysOverdue);
  const asos = {
    conversationId: 'ab-stend',
    clientId: 'ab-stend',
    contractId: null,
    stage,
    context: s.kontekst,
    sessionId: null,
    brokenPromise: s.buzilganVada ?? null,
    // A/B stendida bayram sinalmaydi — stsenariylar bayram kunlarini bilmaydi.
    bayram: null,
    openPromise: null,
    receiptPending: Boolean(s.chekTekshiruvda),
    paymentReceived: null,
    // A/B stendida sukut rejimi sinalmaydi — bu maydon faqat 'nudge' da ma'noli.
    nudgeAttempt: null,
    nudgeLast: null,
    knowledge,
  };

  const yozuv = (out: AgentTurnOutput): Navbat => ({
    kim: 'AGENT',
    matn: [out.reply, out.replySecond].filter(Boolean).join('\n\n') || null,
    holat: out.nextState,
    vada: out.promise
      ? `${formatSom(out.promise.amount)} — ${out.promise.promisedDate}` +
        (out.promise.quote ? ` («${out.promise.quote}»)` : '')
      : null,
    eskalatsiya: out.escalate?.reason ?? null,
    ms: out.usage?.durationMs ?? 0,
    tokenlar: out.usage ? `${out.usage.inputTokens}+${out.usage.cacheReadTokens} → ${out.usage.outputTokens}` : '—',
  });

  const natijalar: Navbat[] = [];
  const first = await engine.composeFirstContact({
    ...asos,
    conversationState: 'new',
    history: [],
  });
  natijalar.push(yozuv(first));

  const history: AgentTurnInput['history'] = [];
  if (first.reply) history.push({ role: 'agent', text: first.reply, at: new Date() });
  let holat: ConversationState = (first.nextState as ConversationState) ?? s.holat ?? 'contacted';

  for (const javob of s.javoblar) {
    natijalar.push({
      kim: 'MIJOZ', matn: javob, holat: null, vada: null, eskalatsiya: null, ms: 0, tokenlar: '—',
    });
    const turn = await engine.respond({
      ...asos,
      conversationState: holat,
      history: [...history],
      incoming: javob,
    });
    history.push({ role: 'client', text: javob, at: new Date() });
    if (turn.reply) history.push({ role: 'agent', text: turn.reply, at: new Date() });
    if (turn.nextState) holat = turn.nextState as ConversationState;
    natijalar.push(yozuv(turn));
  }

  return natijalar;
}

function markdown(navbatlar: Navbat[]): string {
  return navbatlar
    .map((n) => {
      if (n.kim === 'MIJOZ') return `**MIJOZ:** ${n.matn}`;
      const qatorlar = [(n.matn ?? '(xabar yo\'q)').split('\n').map((l) => `> ${l}`).join('\n')];
      const belgi = [
        n.holat && `holat: \`${n.holat}\``,
        n.vada && `**VA'DA:** ${n.vada}`,
        n.eskalatsiya && `**ESKALATSIYA:** ${n.eskalatsiya}`,
        `${(n.ms / 1000).toFixed(1)}s · ${n.tokenlar}`,
      ].filter(Boolean);
      return `${qatorlar[0]}\n\n<sub>${belgi.join(' · ')}</sub>`;
    })
    .join('\n\n');
}

async function main(): Promise<void> {
  // Raqamlar 1 dan boshlanadi — hisobotdagi sarlavhalar bilan bir xil,
  // aks holda "5-ssenariyni qayta chop" degan gap indeksga aylantirilishi
  // kerak bo'lardi va adashish oson bo'lardi.
  const tanlov = process.argv
    .slice(2)
    .map((a) => Number(a))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= SSENARIYLAR.length);
  // Raqam ssenariy bilan birga yuradi: qism chopilganda ham hisobotdagi
  // sarlavha to'liq chopishdagi raqam bilan bir xil qoladi.
  const tanlangan = (tanlov.length ? tanlov : SSENARIYLAR.map((_, i) => i + 1)).map((n) => ({
    raqam: n,
    s: SSENARIYLAR[n - 1]!,
  }));

  const auth = resolveAgentAuth();
  const claudeBor = auth.mode !== 'none';
  const openaiBor = Boolean(config.OPENAI_API_KEY?.trim());

  if (!claudeBor && !openaiBor) {
    console.error('\nBiror kalit ham topilmadi (.env: ANTHROPIC_API_KEY / OPENAI_API_KEY).\n');
    process.exitCode = 1;
    return;
  }
  if (!openaiBor) {
    console.log(
      '\nDIQQAT: OPENAI_API_KEY yo\'q — faqat hozirgi model ishlaydi.\n' +
        'Solishtiruv uchun .env ga OPENAI_API_KEY va OPENAI_MODEL qo\'shing.',
    );
  }

  const modellar: Array<{ nom: string; engine: IAgentEngine }> = [];
  if (claudeBor) modellar.push({ nom: `Hozirgi agent — ${config.AGENT_MODEL}`, engine: new ClaudeAgentEngine() });
  if (openaiBor) {
    modellar.push({
      nom: `OpenAI — ${config.OPENAI_MODEL}`,
      engine: new OpenAiAgentEngine({
        apiKey: config.OPENAI_API_KEY ?? '',
        model: config.OPENAI_MODEL,
        baseUrl: config.OPENAI_BASE_URL,
      }),
    });
  }

  const { knowledge, manba } = await bilimlarBazasi();

  const hisobot: string[] = [
    `# Modellarni solishtirish — ${tanlangan.length} ta ssenariy`,
    '',
    `Modellar: ${modellar.map((m) => m.nom).join('  ·  ')}`,
    '',
    `Qoidalar manbai: ${manba}`,
    '',
    'Ikkala modelga bir xil system prompt, bir xil kontekst va bir xil mijoz ' +
      'matnlari berilgan. Tarix alohida yuritiladi — har bir model o\'z javobini ko\'radi.',
  ];

  for (const [i, { raqam, s }] of tanlangan.entries()) {
    console.log(`\n[${i + 1}/${tanlangan.length}] ${s.nom} …`);
    hisobot.push('', '---', '', `## ${raqam}. ${s.nom}`, '', `*${s.vaziyat}*`, '');
    hisobot.push(
      `Kechikkan to'lov: **${formatSom(s.kontekst.debtSum)}** · ${s.kontekst.daysOverdue} kun · ` +
        `bosqich: \`${stageForOverdueDays(s.kontekst.daysOverdue)}\``,
    );

    for (const m of modellar) {
      // Bitta model yiqilsa qolganlari va keyingi ssenariylar davom etadi:
      // yarim natija ham hech narsadan foydaliroq, ayniqsa xato aynan
      // bitta modelga tegishli bo'lsa (masalan model nomi noto'g'ri).
      try {
        const navbatlar = await suhbat(m.engine, s, knowledge);
        hisobot.push('', `### ${m.nom}`, '', markdown(navbatlar));
      } catch (err) {
        const xabar = err instanceof Error ? err.message : String(err);
        console.error(`  ✗ ${m.nom}: ${xabar}`);
        hisobot.push('', `### ${m.nom}`, '', `**XATO:** ${xabar}`);
      }
    }
  }

  const dir = path.resolve('storage/ab');
  await mkdir(dir, { recursive: true });
  const fayl = path.join(dir, `ab-suhbat-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.md`);
  await writeFile(fayl, `${hisobot.join('\n')}\n`, 'utf8');

  console.log(`\nTayyor: ${fayl}\n`);
  // Baza ulanishi ochiq qolsa jarayon tugamaydi.
  await closePool().catch(() => undefined);
}

await main();
