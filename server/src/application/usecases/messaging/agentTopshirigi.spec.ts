import { InstructAgentUseCase } from '@/application/usecases/messaging/InstructAgentUseCase';
import { ReplyDebouncer } from '@/application/services/ReplyDebouncer';
import type { AgentRunner, AgentTurnResult } from '@/application/services/AgentRunner';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { Conversation, ConversationState, HumanKind } from '@/domain/entities/Conversation';
import type { NewMessage } from '@/domain/entities/Message';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { ConversationPatch, IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { DomainEvent, IClock, IEventBus } from '@/domain/services/support';
import { CrmUnavailableError, NomalumMijozXatosi, StaleTurnError } from '@/shared/errors';

/**
 * Qo'lda ishga tushiriladi: npm run test:agent-topshirigi --workspace=server
 *
 * Operator mavzuni yozadi, agent xabarni o'zi tuzib yuboradi va suhbatni
 * davom ettiradi. Qo'riqlanadigan xavflar:
 *   1) bajarib bo'lmaydigan holatda (kill switch, yopilgan suhbat,
 *      bloklagan mijoz, hali boshlanmagan suhbat) qayd YOZILMASIN va
 *      suhbat holati o'zgarmasin — aks holda operator "yuborildi" deb
 *      o'ylaydi, mijozga esa hech narsa ketmaydi;
 *   2) qayd `note` yo'nalishida yozilsin — `out` bo'lsa sukut, hisobot va
 *      "javobsiz xabar" hisoblari uni yuborilgan xabar deb sanaydi;
 *   3) suhbat agentga qaytsin (bayroq tushsin, agent yoqilsin);
 *   4) agent yiqilsa suhbat operator ro'yxatiga qaytsin, qayd esa qolsin.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  ${izoh}`}`);
};

const OK: AgentTurnResult = { sent: true, reply: 'Ассалому алайкум', escalated: false, cardSent: false };
const TOPSHIRIQ = '  Va\'da kuni to\'lamadi, yaqin kunlardan birini so\'ra  ';

interface Harness {
  useCase: InstructAgentUseCase;
  patches: ConversationPatch[];
  notes: NewMessage[];
  agentCalls: string[];
  events: DomainEvent[];
}

function build(options: {
  state?: ConversationState;
  agentEnabled?: boolean;
  needsHuman?: boolean;
  humanKind?: HumanKind | null;
  killSwitch?: boolean;
  telegramStatus?: string;
  nomalum?: boolean;
  hasOutbound?: boolean;
  agentThrows?: Error;
  /** Qayd yozilishidan OLDINGI CRM tekshiruvi yiqilsin. */
  crmThrows?: Error;
}): Harness {
  const patches: ConversationPatch[] = [];
  const notes: NewMessage[] = [];
  const agentCalls: string[] = [];
  const published: DomainEvent[] = [];

  const conversation = {
    id: 'cv1',
    clientId: 'c1',
    state: options.state ?? 'negotiating',
    stage: 'soft',
    agentEnabled: options.agentEnabled ?? true,
    needsHuman: options.needsHuman ?? true,
    humanReason: 'Va\'da buzildi',
    humanKind: options.humanKind === undefined ? 'broken_promise' : options.humanKind,
  } as unknown as Conversation;

  const conversations = {
    findById: async () => conversation,
    update: async (_id: string, patch: ConversationPatch) => {
      patches.push(patch);
      return conversation;
    },
  } as unknown as IConversationRepository;

  const messages = {
    hasOutbound: async () => options.hasOutbound ?? true,
    create: async (data: NewMessage) => {
      notes.push(data);
      return { id: `m${notes.length}`, ...data, createdAt: new Date() };
    },
  } as unknown as IMessageRepository;

  const clients = {
    findById: async () => ({ id: 'c1', telegramStatus: options.telegramStatus ?? 'found', nomalum: options.nomalum ?? false }),
  } as unknown as IClientRepository;

  const agent = {
    buildContext: async () => {
      if (options.crmThrows) throw options.crmThrows;
      return { context: {}, contractId: null };
    },
    operatorTurn: async (id: string) => {
      agentCalls.push(id);
      if (options.agentThrows) throw options.agentThrows;
      return OK;
    },
  } as unknown as AgentRunner;

  const replies = new ReplyDebouncer(agent, 0, async () => undefined);
  const settings = { get: async () => ({ killSwitch: options.killSwitch ?? false }) } as unknown as RuntimeSettings;
  const audit = { record: async () => undefined } as unknown as IAuditRepository;
  const events = {
    publish: (e: DomainEvent) => published.push(e),
    subscribe: () => () => undefined,
  } as unknown as IEventBus;
  const clock = { now: () => new Date('2026-09-15T05:00:00Z'), todayIso: () => '2026-09-15' } as IClock;

  return {
    useCase: new InstructAgentUseCase(
      conversations, messages, clients, agent, replies, settings, audit, events, clock,
    ),
    patches,
    notes,
    agentCalls,
    events: published,
  };
}

const kirish = (instruction = TOPSHIRIQ) => ({
  conversationId: 'cv1',
  instruction,
  userId: 'u1',
  userEmail: 'd.hakimova@xonsaroy.uz',
});

async function otadi(fn: () => Promise<unknown>): Promise<Error | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    return err as Error;
  }
}

function hechNarsaQilinmadi(h: Harness, nom: string): void {
  check(`${nom}: qayd yozilmaydi`, h.notes.length === 0, `qaydlar: ${h.notes.length}`);
  check(`${nom}: suhbat holati o'zgarmaydi`, h.patches.length === 0, `patch: ${h.patches.length}`);
  check(`${nom}: agent chaqirilmaydi`, h.agentCalls.length === 0, `chaqiruvlar: ${h.agentCalls.length}`);
}

// ─── 1. Bajarib bo'lmaydigan holatlar ──────────────────────────────────
{
  const h = build({});
  const err = await otadi(() => h.useCase.execute(kirish('   ')));
  check('bo\'sh topshiriq rad etiladi', err !== null);
  hechNarsaQilinmadi(h, 'bo\'sh topshiriq');
}
{
  const h = build({ killSwitch: true });
  const err = await otadi(() => h.useCase.execute(kirish()));
  check('kill switch yoqilgan — rad etiladi', err !== null);
  hechNarsaQilinmadi(h, 'kill switch');
}
{
  const h = build({ state: 'closed' });
  const err = await otadi(() => h.useCase.execute(kirish()));
  check('yopilgan suhbat — rad etiladi', err !== null);
  hechNarsaQilinmadi(h, 'yopilgan suhbat');
}
{
  const h = build({ telegramStatus: 'blocked' });
  const err = await otadi(() => h.useCase.execute(kirish()));
  check('mijoz bloklagan — rad etiladi', err !== null);
  hechNarsaQilinmadi(h, 'bloklagan mijoz');
}
{
  const h = build({ hasOutbound: false });
  const err = await otadi(() => h.useCase.execute(kirish()));
  check('suhbat hali boshlanmagan — rad etiladi', err !== null);
  hechNarsaQilinmadi(h, 'boshlanmagan suhbat');
}

{
  const h = build({ nomalum: true });
  const err = await otadi(() => h.useCase.execute(kirish()));
  check('noma\'lum suhbat: NomalumMijozXatosi', err instanceof NomalumMijozXatosi, String(err));
  hechNarsaQilinmadi(h, 'noma\'lum suhbat');
  check('noma\'lum suhbat: hodisa chiqmadi', h.events.length === 0, `hodisalar: ${h.events.length}`);
}

// ─── 2. Asosiy yo'l ────────────────────────────────────────────────────
{
  const h = build({ agentEnabled: false, needsHuman: true, humanKind: 'broken_promise' });
  const result = await h.useCase.execute(kirish());
  const note = h.notes[0];

  check('natija qaytadi', result.sent === true);
  check('bitta qayd yoziladi', h.notes.length === 1, `qaydlar: ${h.notes.length}`);
  check('qayd yo\'nalishi note', note?.direction === 'note', `yo'nalish: ${note?.direction}`);
  check('qayd muallifi system', note?.author === 'system', `muallif: ${note?.author}`);
  check('topshiriq bo\'shliqlarsiz saqlanadi', note?.body === TOPSHIRIQ.trim(), `matn: "${note?.body}"`);
  check('qaydda operator ko\'rsatiladi', note?.authorUserId === 'u1' && note?.meta?.by === 'd.hakimova@xonsaroy.uz');
  check('qayd turi belgilanadi', note?.meta?.kind === 'operator_instruction');

  const patch = h.patches[0] ?? {};
  check('operator bayrog\'i tushadi', patch.needsHuman === false && patch.humanKind === null, JSON.stringify(patch));
  check('agent yoqiladi', patch.agentEnabled === true, JSON.stringify(patch));
  check('agent bir marta chaqiriladi', h.agentCalls.length === 1, `chaqiruvlar: ${h.agentCalls.length}`);
  check(
    'qayd chatga darhol chiqadi (message.created)',
    h.events.some((e) => e.type === 'message.created'),
  );
}
{
  const h = build({ state: 'escalated' });
  await h.useCase.execute(kirish());
  check(
    'eskalatsiya qilingan suhbat muzokaraga qaytadi',
    h.patches[0]?.state === 'negotiating',
    JSON.stringify(h.patches[0]),
  );
}

// ─── 3. Agent yiqilsa ──────────────────────────────────────────────────
{
  const h = build({ agentThrows: new Error('Claude limiti') });
  const err = await otadi(() => h.useCase.execute(kirish()));
  const oxirgi = h.patches[h.patches.length - 1] ?? {};
  check('xato chaqiruvchiga yetadi', err?.message === 'Claude limiti', err?.message);
  check('qayd o\'chirilmaydi', h.notes.length === 1);
  check(
    'suhbat operator ro\'yxatiga agent xatosi bo\'lib qaytadi',
    oxirgi.needsHuman === true && oxirgi.humanKind === 'agent_error',
    JSON.stringify(oxirgi),
  );
}
{
  const h = build({ agentThrows: new StaleTurnError() });
  const err = await otadi(() => h.useCase.execute(kirish()));
  check('mijoz shu payt yozdi — xato qaytadi', err instanceof StaleTurnError);
  check(
    'mijoz yozgan bo\'lsa bayroq qayta qo\'yilmaydi (javobni agent beradi)',
    !h.patches.some((p) => p.needsHuman === true),
    JSON.stringify(h.patches),
  );
}

// ─── 4. CRM javob bermasa ───────────────────────────────────────────────
{
  const h = build({ crmThrows: new CrmUnavailableError() });
  const err = await otadi(() => h.useCase.execute(kirish()));
  check('CRM tushgan — xato chaqiruvchiga yetadi', err instanceof CrmUnavailableError);
  check('CRM tushgan — qayd yozilmaydi', h.notes.length === 0, `qaydlar: ${h.notes.length}`);
  check('CRM tushgan — agent chaqirilmaydi', h.agentCalls.length === 0);
  check('CRM tushgan — suhbat holati o\'zgarmaydi', h.patches.length === 0, JSON.stringify(h.patches));
}
{
  // Tekshiruvdan o'tdi, lekin agent chaqiruvida CRM yiqildi (poyga).
  const h = build({ agentThrows: new CrmUnavailableError() });
  const err = await otadi(() => h.useCase.execute(kirish()));
  const oxirgi = h.patches[h.patches.length - 1] ?? {};
  check('poygada CRM xatosi chaqiruvchiga yetadi', err instanceof CrmUnavailableError);
  check(
    'poygada suhbat operatorga agent xatosi bo\'lib CHIQMAYDI',
    !h.patches.some((p) => p.humanKind === 'agent_error'),
    JSON.stringify(h.patches),
  );
  check(
    'poygada bayroqlar oldingi holatiga qaytadi',
    oxirgi.needsHuman === true && oxirgi.humanKind === 'broken_promise' && oxirgi.agentEnabled === true,
    JSON.stringify(oxirgi),
  );
}

console.log(failed ? `\n${failed} ta tekshiruv yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
