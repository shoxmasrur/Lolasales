import { MAX_SYNC_HOURS, MissedMessageSync } from '@/application/services/MissedMessageSync';
import type {
  HandleIncomingMessageUseCase,
  IncomingOutcome,
} from '@/application/usecases/messaging/HandleIncomingMessageUseCase';
import type { IncomingMessage, ITelegramGateway } from '@/domain/services/ITelegramGateway';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IClock } from '@/domain/services/support';

/**
 * Qo'lda ishga tushiriladi: npm run test:missed-sync --workspace=server
 *
 * Telegramga ham, bazaga ham chiqmaydi.
 *
 * Eng muhim ikki xususiyat:
 *   1. Tiklash TAKRORIY ishlov bermasligi — dublikat xabar qayta
 *      ishlansa, mijoz bir gapga ikkinchi javob olardi.
 *   2. Bitta buzuq xabar butun tiklashni to'xtatmasligi — masalan fayli
 *      o'chirilgan xabar yuklab olishda yiqiladi.
 */
const NOW = new Date('2026-08-10T12:00:00Z');

let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  ${izoh}`}`);
};

function msg(id: number): IncomingMessage {
  return {
    telegramAccountId: 'acc1',
    telegramUserId: '777',
    accessHash: 'h',
    username: null,
    fullName: 'Testov Testoy',
    phone: '+998901112233',
    telegramMsgId: id,
    text: 'pul to\'ladim',
    media: null,
    receivedAt: new Date('2026-08-10T11:00:00Z'),
  } as IncomingMessage;
}

interface Muhit {
  sync: MissedMessageSync;
  since: Date[];
  ishlangan: number[];
  auditlar: string[];
}

function build(opts: {
  messages: IncomingMessage[];
  outcome?: (m: IncomingMessage) => IncomingOutcome;
  throwOn?: number;
}): Muhit {
  const since: Date[] = [];
  const ishlangan: number[] = [];
  const auditlar: string[] = [];

  const gateway = {
    fetchMissed: async (_id: string, o: { since: Date }) => {
      since.push(o.since);
      return opts.messages;
    },
  } as unknown as ITelegramGateway;

  const handleIncoming = {
    execute: async (m: IncomingMessage): Promise<IncomingOutcome> => {
      if (opts.throwOn === m.telegramMsgId) throw new Error('faylni yuklab bo\'lmadi');
      ishlangan.push(m.telegramMsgId);
      return opts.outcome ? opts.outcome(m) : 'imported';
    },
  } as unknown as HandleIncomingMessageUseCase;

  const sync = new MissedMessageSync(
    gateway,
    { findById: async () => ({ id: 'acc1', label: 'Asosiy' }) } as unknown as ITelegramAccountRepository,
    handleIncoming,
    {
      record: async (e: { action: string }) => {
        auditlar.push(e.action);
      },
    } as unknown as IAuditRepository,
    { now: () => NOW, todayIso: () => '2026-08-10' } as unknown as IClock,
  );

  return { sync, since, ishlangan, auditlar };
}

// ─── Oddiy tiklash ───────────────────────────────────────────────────────
{
  const m = build({ messages: [msg(1), msg(2), msg(3)] });
  const r = await m.sync.syncAccount('acc1');
  check('hammasi olindi', r.fetched === 3, String(r.fetched));
  check('hammasi tiklandi', r.imported === 3, String(r.imported));
  check('jurnalga yozildi', m.auditlar.join() === 'telegram.missed_synced', m.auditlar.join());
}

// ─── Dublikatlar qayta ishlanmaydi ───────────────────────────────────────
{
  const m = build({
    messages: [msg(1), msg(2), msg(3)],
    outcome: (x) => (x.telegramMsgId === 2 ? 'imported' : 'duplicate'),
  });
  const r = await m.sync.syncAccount('acc1');
  check('faqat yangisi sanaldi', r.imported === 1, String(r.imported));
  check('olinganlar soni o\'zgarmadi', r.fetched === 3);
}

// Hech narsa yangi bo'lmasa jurnal ham to'ldirilmaydi — har qayta ulanishda
// bo'sh yozuv qoldirish jurnalni yaroqsiz qilardi.
{
  const m = build({ messages: [msg(1)], outcome: () => 'duplicate' });
  const r = await m.sync.syncAccount('acc1');
  check('yangi xabar yo\'q', r.imported === 0);
  check('bo\'sh jurnal yozuvi qoldirilmadi', m.auditlar.length === 0);
}

// ─── Bitta buzuq xabar qolganini to'xtatmaydi ────────────────────────────
{
  const m = build({ messages: [msg(1), msg(2), msg(3)], throwOn: 2 });
  const r = await m.sync.syncAccount('acc1');
  check('buzuq xabar sanaldi', r.failed === 1, String(r.failed));
  check('qolganlari tiklandi', r.imported === 2, String(r.imported));
  check('uchinchisiga yetib borildi', m.ishlangan.includes(3), m.ishlangan.join());
}

// ─── Oyna chegaralari ────────────────────────────────────────────────────
{
  const m = build({ messages: [] });
  await m.sync.syncAccount('acc1');
  const soat = (NOW.getTime() - m.since[0]!.getTime()) / 3_600_000;
  check('sukut bo\'yicha 24 soat', soat === 24, String(soat));
}
{
  const m = build({ messages: [] });
  await m.sync.syncAccount('acc1', 9999);
  const soat = (NOW.getTime() - m.since[0]!.getTime()) / 3_600_000;
  check('juda katta oyna cheklanadi', soat === MAX_SYNC_HOURS, String(soat));
}
{
  const m = build({ messages: [] });
  await m.sync.syncAccount('acc1', 0);
  const soat = (NOW.getTime() - m.since[0]!.getTime()) / 3_600_000;
  check('nol oyna 1 soatga ko\'tariladi', soat === 1, String(soat));
}

// ─── Qayta ulanish yiqilsa, qayta ulanish o'zi buzilmasin ────────────────
{
  const gateway = {
    fetchMissed: async () => {
      throw new Error('Telegram javob bermadi');
    },
  } as unknown as ITelegramGateway;
  const sync = new MissedMessageSync(
    gateway,
    {} as unknown as ITelegramAccountRepository,
    {} as unknown as HandleIncomingMessageUseCase,
    {} as unknown as IAuditRepository,
    { now: () => NOW } as unknown as IClock,
  );

  let otildi = false;
  await sync.afterReconnect('acc1').catch(() => {
    otildi = true;
  });
  check('tiklash xatosi qayta ulanishni buzmaydi', !otildi);
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
