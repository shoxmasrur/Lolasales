import { BulkRecontact, type BulkRecontactTiming } from '@/application/services/BulkRecontact';
import type { InstructAgentInput, InstructAgentUseCase } from '@/application/usecases/messaging/InstructAgentUseCase';
import type { AgentTurnResult } from '@/application/services/AgentRunner';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { IRecontactRepository, RecontactItem } from '@/domain/repositories/IRecontactRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IHolidayRepository } from '@/domain/repositories/IHolidayRepository';
import type { DomainEvent, IClock, IEventBus } from '@/domain/services/support';
import { ConflictError, CrmUnavailableError, ValidationError } from '@/shared/errors';

/**
 * Qo'lda ishga tushiriladi: npm run test:bulk-recontact --workspace=server
 *
 * Bazaga ham, Telegramga ham chiqmaydi — hamma port soxta, pauza va oyna
 * kutishi soxta `sleep` bilan darhol qaytadi.
 *
 * Qo'riqlanadigan tartiblar (spec 2026-09-16, 2.4):
 *   1. Yuborishdan oldin qayta tekshiruv — ro'yxatdan chiqqan suhbatga
 *      agent UMUMAN chaqirilmaydi.
 *   2. CRM xatosi — o'tkazib yuboriladi, "yiqilgan" emas.
 *   3. To'xtatish — qolganlar ishlanmaydi.
 *   4. Bir vaqtda bitta ish.
 *   5. O'tkazib yuborilgandan keyin pauza yo'q.
 *   6. KILL_SWITCH va ish vaqti oynasi.
 */
const t = (isoLocal: string): Date => new Date(`${isoLocal}+05:00`);
const SESHANBA_10 = t('2026-08-18T10:00:00');
const SESHANBA_20 = t('2026-08-18T20:00:00');

let failed = 0;
const check = (name: string, ok: boolean, hint = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${hint}`}`);
};

const item = (conversationId: string): RecontactItem => ({
  conversationId,
  clientId: `cl-${conversationId}`,
  clientName: `Mijoz ${conversationId}`,
  kind: 'javobsiz',
  overdue: 500_000,
  silentWorkDays: 4,
  lastMessageAt: SESHANBA_10.toISOString(),
  lastMessageDirection: 'out',
  lastMessagePreview: 'salom',
  lastPromise: null,
});

const SENT: AgentTurnResult = { sent: true, reply: 'matn', escalated: false, promiseRecorded: false };

interface Muhit {
  service: BulkRecontact;
  agentCalls: string[];
  findOneCalls: string[];
  sleeps: number[];
  events: DomainEvent[];
  settings: { killSwitch: boolean };
  clockNow: { value: Date };
}

function muhit(opts: {
  royxatdanChiqqan?: string[];
  agent?: (input: InstructAgentInput, m: Muhit) => Promise<AgentTurnResult>;
  now?: Date;
  onSleep?: (ms: number, m: Muhit) => void;
  /** Talabnoma muddati ichidagi mijozlar (`clientId`). */
  sukutda?: string[];
}): Muhit {
  const m = {
    agentCalls: [] as string[],
    findOneCalls: [] as string[],
    sleeps: [] as number[],
    events: [] as DomainEvent[],
    settings: { killSwitch: false },
    clockNow: { value: opts.now ?? SESHANBA_10 },
  } as Muhit;

  const agent = {
    execute: async (input: InstructAgentInput) => {
      m.agentCalls.push(input.conversationId);
      return opts.agent ? opts.agent(input, m) : SENT;
    },
  } as unknown as InstructAgentUseCase;

  const recontactList = {
    findOne: async (id: string) => {
      m.findOneCalls.push(id);
      return opts.royxatdanChiqqan?.includes(id) ? null : item(id);
    },
  } as unknown as IRecontactRepository;

  const settings = {
    get: async () => ({
      minDelaySec: 60,
      maxDelaySec: 180,
      windowStart: '09:00',
      windowEnd: '18:00',
      weekdays: [1, 2, 3, 4, 5, 6],
      killSwitch: m.settings.killSwitch,
      silenceNudgeMax: 2,
      minDebt: 100_000,
    }),
  } as unknown as RuntimeSettings;

  const events: IEventBus = { publish: (e: DomainEvent) => void m.events.push(e) } as unknown as IEventBus;
  const clock: IClock = { now: () => m.clockNow.value, todayIso: () => '2026-08-18' };
  const holidays = { list: async () => [] } as unknown as IHolidayRepository;
  const conversations = {
    findById: async (id: string) => ({ id, clientId: `cl-${id}` }),
  } as unknown as IConversationRepository;
  const clients = {
    findById: async (id: string) => ({ id, fullName: `Bazadan ${id}` }),
  } as unknown as IClientRepository;

  const timing: BulkRecontactTiming = {
    sleep: async (ms) => {
      m.sleeps.push(ms);
      opts.onSleep?.(ms, m);
    },
    random: (min) => min,
    windowPollMs: 1000,
  };

  m.service = new BulkRecontact(
    agent, recontactList, settings, holidays, events, clock, conversations, clients,
    { sukutdami: async (clientId: string, today: string) => today === '2026-08-18' && (opts.sukutda ?? []).includes(clientId) },
    timing,
  );
  return m;
}

const tugashiniKut = async (s: BulkRecontact): Promise<void> => {
  for (let i = 0; i < 1000 && s.isRunning(); i += 1) {
    await new Promise((r) => setTimeout(r, 1));
  }
};

const input = (ids: string[]) => ({ conversationIds: ids, instruction: 'To\'lov haqida so\'ra', userId: 'u1', userEmail: 'op@x.uz' });

// ─── 1. Qayta tekshiruv, CRM xatosi, skip'dan keyin pauza yo'q ───────────
{
  const m = muhit({
    royxatdanChiqqan: ['a'],
    agent: async (i) => {
      if (i.conversationId === 'b') throw new CrmUnavailableError();
      if (i.conversationId === 'e') throw new Error('model yiqildi');
      return SENT;
    },
  });
  m.service.start(input(['a', 'b', 'c', 'd', 'e']));
  await tugashiniKut(m.service);
  const job = m.service.current()!;
  const by = (id: string) => job.results.find((r) => r.conversationId === id);

  check('ish tugadi (done)', job.status === 'done', job.status);
  check('ro\'yxatdan chiqqan suhbatga agent CHAQIRILMADI', !m.agentCalls.includes('a'), JSON.stringify(m.agentCalls));
  check('ro\'yxatdan chiqqan — skipped, sababi aniq', by('a')?.outcome === 'skipped' && /mos kelmaydi/.test(by('a')?.reason ?? ''), JSON.stringify(by('a')));
  check('ro\'yxatdan chiqqanning ismi bazadan olindi', by('a')?.clientName === 'Bazadan cl-a', JSON.stringify(by('a')));
  check('CRM xatosi — skipped, failed emas', by('b')?.outcome === 'skipped' && /CRM/.test(by('b')?.reason ?? ''), JSON.stringify(by('b')));
  check('boshqa xato — failed', by('e')?.outcome === 'failed', JSON.stringify(by('e')));
  check('hisoblagichlar: 2 sent, 2 skipped, 1 failed', job.sent === 2 && job.skipped === 2 && job.failed === 1, JSON.stringify(job));
  check('har suhbat oldidan qayta tekshirildi', m.findOneCalls.join() === 'a,b,c,d,e', m.findOneCalls.join());
  // a va b (skip) dan keyin pauza yo'q; c va d (sent) dan keyin bittadan;
  // e oxirgisi — undan keyin pauza yo'q.
  check('pauza faqat haqiqiy yuborishdan keyin (2 ta, 60 soniya)', m.sleeps.length === 2 && m.sleeps.every((s) => s === 60_000), JSON.stringify(m.sleeps));
  check('progress hodisalari e\'lon qilindi', m.events.filter((e) => e.type === 'recontact.bulk_progress').length >= 6, String(m.events.length));
}

// ─── 2. Oxirgi yuborishdan keyin pauza yo'q; skip ketma-ketligi ───────────
{
  const m = muhit({ royxatdanChiqqan: ['x', 'y'] });
  m.service.start(input(['x', 'y', 'z']));
  await tugashiniKut(m.service);
  check('faqat skip + oxirgi sent — hech qanday pauza yo\'q', m.sleeps.length === 0, JSON.stringify(m.sleeps));
}

// ─── 3. To'xtatish — qolganlar ishlanmaydi ───────────────────────────────
{
  const m = muhit({
    agent: async (_i, mm) => {
      void mm.service.stop();
      return SENT;
    },
  });
  m.service.start(input(['p', 'q', 'r']));
  await tugashiniKut(m.service);
  const job = m.service.current()!;
  check('to\'xtatilgan ish — stopped', job.status === 'stopped', job.status);
  check('faqat birinchisi ishlandi', m.agentCalls.join() === 'p' && job.results.length === 1, JSON.stringify(m.agentCalls));
  check('to\'xtatilgandan keyin pauza qilinmadi', m.sleeps.length === 0, JSON.stringify(m.sleeps));
  check('operator to\'xtatganda sabab yo\'q', job.stopReason === null, String(job.stopReason));
}

// ─── 4. Ikkinchi start — ConflictError ───────────────────────────────────
{
  let ochish!: () => void;
  const darvoza = new Promise<void>((r) => { ochish = r; });
  const m = muhit({ agent: async () => { await darvoza; return SENT; } });
  m.service.start(input(['k']));
  let xato: unknown = null;
  try {
    await m.service.start(input(['l']));
  } catch (err) {
    xato = err;
  }
  check('ikkinchi start ConflictError', xato instanceof ConflictError, String(xato));
  ochish();
  await tugashiniKut(m.service);
  check('birinchi ish buzilmadi', m.service.current()?.sent === 1 && m.agentCalls.join() === 'k', JSON.stringify(m.agentCalls));
  m.service.start(input(['n']));
  await tugashiniKut(m.service);
  check('tugagandan keyin yangi ish boshlanadi', m.service.current()?.results[0]?.conversationId === 'n');
}

// ─── 5. KILL_SWITCH ──────────────────────────────────────────────────────
{
  const m = muhit({
    agent: async (_i, mm) => {
      mm.settings.killSwitch = true;
      return SENT;
    },
  });
  m.service.start(input(['s1', 's2', 's3']));
  await tugashiniKut(m.service);
  const job = m.service.current()!;
  check('KILL_SWITCH — stopped, sababi bilan', job.status === 'stopped' && /KILL_SWITCH/.test(job.stopReason ?? ''), JSON.stringify(job));
  check('KILL_SWITCH dan keyin agent chaqirilmadi', m.agentCalls.join() === 's1', JSON.stringify(m.agentCalls));
}

// ─── 6. Usecase ValidationError — skipped ────────────────────────────────
{
  const m = muhit({ agent: async () => { throw new ValidationError('Mijoz bizni bloklagan'); } });
  m.service.start(input(['v']));
  await tugashiniKut(m.service);
  const r = m.service.current()!.results[0];
  check('ValidationError — skipped, sababi usecase matni', r?.outcome === 'skipped' && r.reason === 'Mijoz bizni bloklagan', JSON.stringify(r));
}

// ─── 7. Ish vaqti tashqarisi — KUTADI, o'tkazib yubormaydi ───────────────
{
  let uygonish = 0;
  const m = muhit({
    now: SESHANBA_20,
    onSleep: (_ms, mm) => {
      uygonish += 1;
      // Uchinchi uyg'onishda ertalab bo'ladi.
      if (uygonish === 3) mm.clockNow.value = t('2026-08-19T09:30:00');
    },
  });
  m.service.start(input(['w1']));
  await tugashiniKut(m.service);
  const job = m.service.current()!;
  check('oyna tashqarisida agent darhol chaqirilmadi, kutildi', m.sleeps.length === 3 && m.sleeps.every((s) => s === 1000), JSON.stringify(m.sleeps));
  check('oyna ochilgach yuborildi (skipped emas)', job.sent === 1 && job.skipped === 0 && job.status === 'done', JSON.stringify(job));
}

// ─── 8. Oyna kutishida to'xtatish sezildi ───────────────────────────────
{
  const m = muhit({
    now: SESHANBA_20,
    onSleep: (_ms, mm) => { void mm.service.stop(); },
  });
  m.service.start(input(['o1', 'o2']));
  await tugashiniKut(m.service);
  const job = m.service.current()!;
  check('kutish paytida to\'xtatildi — hech kimga yozilmadi', job.status === 'stopped' && m.agentCalls.length === 0 && job.results.length === 0, JSON.stringify(job));
}

// ─── 9. Takrorlangan id bir marta ishlanadi ──────────────────────────────
{
  const m = muhit({});
  const job = await m.service.start(input(['d1', 'd1', 'd2']));
  await tugashiniKut(m.service);
  check('takror id bir marta', job.total === 2 && m.agentCalls.join() === 'd1,d2', JSON.stringify(m.agentCalls));
}

// ─── 10. Talabnoma muddati — operator buyrug'i bo'lsa ham o'tkaziladi ────
{
  const m = muhit({ sukutda: ['cl-t1'] });
  await m.service.start(input(['t1', 't2']));
  await tugashiniKut(m.service);
  const job = m.service.current()!;
  const t1 = job.results.find((r) => r.conversationId === 't1');
  check('talabnoma muddati — agent CHAQIRILMADI', !m.agentCalls.includes('t1'), JSON.stringify(m.agentCalls));
  check('talabnoma muddati — skipped, sababi aniq', t1?.outcome === 'skipped' && t1.reason === 'Talabnoma muddati tugamagan', JSON.stringify(t1));
  check('talabnoma sukuti yo\'q — avvalgidek yuborildi', m.agentCalls.join() === 't2', JSON.stringify(m.agentCalls));
}

if (failed) {
  console.error(`\n${failed} ta tekshiruv muvaffaqiyatsiz`);
  process.exit(1);
}
console.log('\nHammasi o\'tdi');
