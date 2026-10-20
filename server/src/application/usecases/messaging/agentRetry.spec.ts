import { RetryAgentTurnUseCase } from '@/application/usecases/messaging/RetryAgentTurnUseCase';
import { ReplyDebouncer } from '@/application/services/ReplyDebouncer';
import type { AgentRunner, AgentTurnResult } from '@/application/services/AgentRunner';
import type { Conversation, HumanKind } from '@/domain/entities/Conversation';
import type { Message } from '@/domain/entities/Message';
import type { ConversationPatch, IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IClock, IEventBus } from '@/domain/services/support';
import { StaleTurnError } from '@/shared/errors';

/**
 * Qo'lda ishga tushiriladi: npm run test:agent-retry --workspace=server
 *
 * Beshta xavf tekshiriladi:
 *   1) tugma noto'g'ri joyda ishlab ketmasin (agent eskalatsiyasi);
 *   2) agentga ESKI, allaqachon javob berilgan xabar berilmasin;
 *   3) qayta urinish ham yiqilsa suhbat operator ro'yxatidan yo'qolmasin;
 *   4) agent o'chirilgan/yakunlangan suhbatda bayroq jimgina yo'qolmasin —
 *      `AgentRunner` bunday holatda xato OTMAYDI, shuning uchun oldindan
 *      tekshirish shart;
 *   5) `runNow` qulfni ushlab turgan payt debouncer taymeri o'chib qolsa,
 *      buferdagi xabar YO'QOLIB QOLMASIN — qulf bo'shagach qayta rejalashtirilsin.
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  ${izoh}`}`);
};

const OK: AgentTurnResult = { sent: true, reply: 'javob', escalated: false, cardSent: false };

function msg(id: string, direction: 'in' | 'out', body: string, at: string): Message {
  return {
    id,
    conversationId: 'cv1',
    direction,
    author: direction === 'in' ? 'client' : 'agent',
    body,
    transcript: null,
    media: null,
    createdAt: new Date(at),
  } as unknown as Message;
}

interface Harness {
  useCase: RetryAgentTurnUseCase;
  patches: ConversationPatch[];
  replyCalls: string[];
  firstContactCalls: string[];
}

function build(options: {
  needsHuman?: boolean;
  humanKind?: HumanKind | null;
  history?: Message[];
  agentThrows?: Error;
  agentEnabled?: boolean;
}): Harness {
  const patches: ConversationPatch[] = [];
  const replyCalls: string[] = [];
  const firstContactCalls: string[] = [];

  const conversation = {
    id: 'cv1',
    clientId: 'c1',
    state: 'active',
    agentEnabled: options.agentEnabled ?? true,
    needsHuman: options.needsHuman ?? true,
    humanReason: 'Agent vaqtincha ishlamadi: Claude limiti',
    // `??` ni ishlatib bo'lmaydi: u aniq berilgan `null`ni ham
    // standart qiymat bilan almashtirib qo'yardi, natijada 1-stsenariy
    // ("texnik xato emas") hech qachon haqiqiy `null`ni sinamas edi.
    humanKind: options.humanKind === undefined ? 'agent_error' : options.humanKind,
  } as unknown as Conversation;

  const conversations = {
    findById: async () => conversation,
    update: async (_id: string, patch: ConversationPatch) => {
      patches.push(patch);
      return conversation;
    },
  } as unknown as IConversationRepository;

  const messages = {
    recentByConversation: async () => options.history ?? [],
  } as unknown as IMessageRepository;

  const agent = {
    reply: async (id: string, incoming: string) => {
      replyCalls.push(incoming);
      if (options.agentThrows) throw options.agentThrows;
      return OK;
    },
    firstContact: async (id: string) => {
      firstContactCalls.push(id);
      if (options.agentThrows) throw options.agentThrows;
      return OK;
    },
  } as unknown as AgentRunner;

  const replies = new ReplyDebouncer(agent, 0, async () => undefined);
  const audit = { record: async () => undefined } as unknown as IAuditRepository;
  const events = { publish: () => undefined, subscribe: () => () => undefined } as unknown as IEventBus;
  const clock = { now: () => new Date('2026-08-12T09:00:00Z'), todayIso: () => '2026-08-12' } as IClock;

  return {
    useCase: new RetryAgentTurnUseCase(conversations, messages, agent, replies, audit, events, clock),
    patches,
    replyCalls,
    firstContactCalls,
  };
}

async function otadi(fn: () => Promise<unknown>): Promise<Error | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    return err as Error;
  }
}

// ─── 1. Texnik xato bo'lmasa — ishlamaydi ──────────────────────────────
const h1 = build({ humanKind: null, history: [msg('m1', 'in', 'salom', '2026-08-12T08:00:00Z')] });
const err1 = await otadi(() => h1.useCase.execute({ conversationId: 'cv1', userEmail: 'a@b.uz' }));
check('agent eskalatsiyasida xato qaytadi', err1 !== null, 'xato otilmadi');
check('agent chaqirilmaydi', h1.replyCalls.length === 0, `chaqiruvlar: ${h1.replyCalls.length}`);
check('bayroqqa tegilmaydi', h1.patches.length === 0, `patch: ${h1.patches.length}`);

// ─── 2. Javobsiz xabar bilan chaqiriladi ───────────────────────────────
const h2 = build({
  history: [
    msg('m1', 'in', 'eski savol', '2026-08-12T07:00:00Z'),
    msg('m2', 'out', 'eski javob', '2026-08-12T07:05:00Z'),
    msg('m3', 'in', 'yangi savol', '2026-08-12T08:00:00Z'),
  ],
});
await h2.useCase.execute({ conversationId: 'cv1', userEmail: 'a@b.uz' });
check('agent bir marta chaqirildi', h2.replyCalls.length === 1, `${h2.replyCalls.length}`);
check(
  'faqat JAVOBSIZ xabar berildi',
  h2.replyCalls[0] === 'yangi savol',
  h2.replyCalls[0] ?? '(bo\'sh)',
);
check(
  'bayroq tushirildi',
  h2.patches[0]?.needsHuman === false && h2.patches[0]?.humanReason === null,
  JSON.stringify(h2.patches[0]),
);

// ─── 3. Yozishma yo'q — birinchi murojaat ──────────────────────────────
const h3 = build({ history: [] });
await h3.useCase.execute({ conversationId: 'cv1', userEmail: 'a@b.uz' });
check('yozishmasiz suhbatda firstContact', h3.firstContactCalls.length === 1, `${h3.firstContactCalls.length}`);

// ─── 4. Javobsiz xabar yo'q — sabab yo'q ───────────────────────────────
const h4 = build({
  history: [
    msg('m1', 'in', 'savol', '2026-08-12T07:00:00Z'),
    msg('m2', 'out', 'javob', '2026-08-12T07:05:00Z'),
  ],
});
const err4 = await otadi(() => h4.useCase.execute({ conversationId: 'cv1', userEmail: 'a@b.uz' }));
check('javobsiz xabar yo\'q — xato', err4 !== null, 'xato otilmadi');
check('bayroqqa tegilmadi', h4.patches.length === 0, `patch: ${h4.patches.length}`);

// ─── 5. Agent yana yiqildi — bayroq qaytadi ────────────────────────────
const h5 = build({
  history: [msg('m1', 'in', 'savol', '2026-08-12T08:00:00Z')],
  agentThrows: new Error('You\'ve hit your session limit · resets 2pm (UTC)'),
});
const err5 = await otadi(() => h5.useCase.execute({ conversationId: 'cv1', userEmail: 'a@b.uz' }));
check('xato yuqoriga otiladi', err5 !== null, 'xato otilmadi');
const oxirgi = h5.patches.at(-1);
check(
  'bayroq va tur qayta qo\'yildi',
  oxirgi?.needsHuman === true && oxirgi?.humanKind === 'agent_error',
  JSON.stringify(oxirgi),
);
check(
  'sabab yangilandi',
  typeof oxirgi?.humanReason === 'string' && oxirgi.humanReason.includes('Claude limiti'),
  String(oxirgi?.humanReason),
);

// ─── 6. Agent o'chirilgan — bayroqqa tegilmasdan xato ──────────────────
const h6 = build({
  agentEnabled: false,
  history: [msg('m1', 'in', 'savol', '2026-08-12T08:00:00Z')],
});
const err6 = await otadi(() => h6.useCase.execute({ conversationId: 'cv1', userEmail: 'a@b.uz' }));
check('agent o\'chirilgan suhbatda xato qaytadi', err6 !== null, 'xato otilmadi');
check(
  'agent umuman chaqirilmadi',
  h6.replyCalls.length === 0 && h6.firstContactCalls.length === 0,
  `reply: ${h6.replyCalls.length}, firstContact: ${h6.firstContactCalls.length}`,
);
check('bayroqqa tegilmadi', h6.patches.length === 0, `patch: ${h6.patches.length}`);

// ─── 6b. Urinish paytida mijoz yozdi — bu nosozlik ham, "o'chirilgan" ham emas ─
//
// `StaleTurnError` `AbortedError` dan meros olgani uchun eski shox uni
// "operator agentni o'chirdi" deb yozib qo'yardi: operator hech narsani
// o'chirmagan bo'lsa ham bannerda shu sabab turardi. Bundan tashqari
// suhbatni operator navbatiga qaytarish ham keraksiz — mijozning yangi
// xabari debouncer buferida, ya'ni agent unga o'zi javob beradi.
const h6b = build({
  history: [msg('m1', 'in', 'savol', '2026-08-12T08:00:00Z')],
  agentThrows: new StaleTurnError(),
});
const err6b = await otadi(() => h6b.useCase.execute({ conversationId: 'cv1', userEmail: 'a@b.uz' }));
check('eskirgan urinish xato bo\'lib qaytadi', err6b instanceof StaleTurnError, String(err6b));
check(
  'suhbat operator navbatiga QAYTARILMADI',
  h6b.patches.every((p) => p.needsHuman !== true),
  JSON.stringify(h6b.patches),
);
check(
  'yolg\'on sabab yozilmadi',
  h6b.patches.every((p) => !String(p.humanReason ?? '').includes('o\'chirilgan')),
  JSON.stringify(h6b.patches),
);

// ─── 7. runNow qulfni ushlab turganda (fn ICHIDA) kelgan xabar yo'qolmaydi ─
{
  const debouncerReplyCalls: string[] = [];
  const debouncerAgent = {
    reply: async (_id: string, text: string) => {
      debouncerReplyCalls.push(text);
      return OK;
    },
    // `push()` ketayotgan navbatni uzishga urinadi. Bu yerda hech narsa
    // ketmayapti — chaqiruv nolinchi ish bo'lib qaytadi.
    abort: () => 0,
  } as unknown as AgentRunner;

  const delayMs = 20;
  const replies = new ReplyDebouncer(debouncerAgent, delayMs, async () => undefined);

  // MUHIM: bu safar xabar `runNow`DAN OLDIN emas, balki `fn` ISHLAYOTGAN
  // PAYT keladi — masalan mijoz "Qayta urinish" ishlab turgan paytda
  // yana bir narsa yozadi. Bu 1-band tuzatishi tozalaydigan holatdan
  // (xabar `runNow`dan OLDIN buferda bo'lishi) TUBDAN farq qiladi: bu
  // yerdagi xabarni retry o'zi hali BAZADAN o'qib ulgurmagan, shuning
  // uchun uni debouncer keyinroq yuborishi TO'G'RI.
  await replies.runNow('cv-debounce', async () => {
    // Taymer qo'yiladi (delayMs dan keyin flush chaqiriladi) — u `fn`
    // hali ishlab turgan paytda otadi, `flush` band deb chiqib ketadi va
    // O'Z taymerini o'chirib qo'yadi.
    replies.push('cv-debounce', 'salom debouncer');
    await sleep(delayMs * 3);
    return null;
  });

  // Qulf bo'shagach TUZATISH kuchga kirishi kerak: bufer qayta
  // rejalashtiriladi. Yangi taymer ham otishi uchun biroz kutamiz.
  await sleep(delayMs * 3);

  check(
    'qulf bo\'shagach bufer qayta rejalashtirildi va yuborildi',
    debouncerReplyCalls.length === 1 && debouncerReplyCalls[0] === 'salom debouncer',
    JSON.stringify(debouncerReplyCalls),
  );
}

// ─── 8. runNow BOSHLANISHIDAN OLDIN buferga tushgan xabar ikkinchi marta
//        javob OLMASLIGI kerak (mijoz bitta xabarga ikkita javob olmasin) ──
{
  const debouncerReplyCalls: string[] = [];
  const debouncerAgent = {
    reply: async (_id: string, text: string) => {
      debouncerReplyCalls.push(text);
      return OK;
    },
    // `push()` ketayotgan navbatni uzishga urinadi. Bu yerda hech narsa
    // ketmayapti — chaqiruv nolinchi ish bo'lib qaytadi.
    abort: () => 0,
  } as unknown as AgentRunner;

  const delayMs = 20;
  const replies = new ReplyDebouncer(debouncerAgent, delayMs, async () => undefined);

  // HandleIncomingMessageUseCase: xabar bazaga yozildi, buferga tushdi,
  // taymer +delayMs ga qo'yildi.
  replies.push('cv-retry-race', 'mijoz xabari');

  // Operator shu oraliqda "Qayta urinish"ni bosdi: RetryAgentTurnUseCase
  // o'sha xabarni BAZADAN o'qib, o'ZI javob beradi (bu yerda debouncer
  // orqali emas — shuning uchun bu `fn` debouncer.agent.reply'ni
  // chaqirmaydi, xuddi haqiqiy use case kabi).
  await replies.runNow('cv-retry-race', async () => {
    await sleep(1); // real chaqiruvni simulyatsiya qiladi
    return null;
  });

  // Taymer otishi kerak bo'lgan vaqtdan ancha ko'proq kutamiz: agar
  // TUZATISH bo'lmasa, eski taymer/bufer joyida qolib, shu yerda
  // debouncer o'ZI ham xuddi shu xabarga ikkinchi javobni yuborardi.
  await sleep(delayMs * 3);

  check(
    'runNow qulf olgach eski bufer/taymer tozalandi — debouncer IKKINCHI javob bermadi',
    debouncerReplyCalls.length === 0,
    JSON.stringify(debouncerReplyCalls),
  );
}

console.log(failed ? `\n${failed} ta tekshiruv yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
