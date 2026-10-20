import { MessageDispatcher } from '@/application/services/MessageDispatcher';
import type { Conversation } from '@/domain/entities/Conversation';
import type { TelegramLookupStatus } from '@/domain/entities/Client';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { ITelegramGateway } from '@/domain/services/ITelegramGateway';
import type { IMediaStorage } from '@/domain/services/IMediaStorage';
import type { IClock, IEventBus } from '@/domain/services/support';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import { AppError, TelegramError } from '@/shared/errors';

/**
 * Qo'lda ishga tushiriladi: npm run test:blocked-detect --workspace=server
 *
 * Telegram "sizni bloklashdi" degan xabarni o'zi yubormaydi — buni faqat
 * yozishga urinib bilamiz. Mijoz "Report spam and delete chat" bosganda ham
 * aynan shu xato qaytadi.
 *
 * Eng qimmat xato — HAR QANDAY yuborish xatosini bloklash deb tushunish:
 * tarmoq uzilishi yoki flood-wait tufayli mijoz "bloklagan" ro'yxatiga
 * tushib qolsa, unga boshqa hech qachon yozilmaydi. Shuning uchun boshqa
 * xatolar alohida tekshiriladi.
 */
const TODAY = '2026-08-10';

let failed = 0;
function check(holat: string, ok: boolean, izoh = ''): void {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${holat}${ok ? '' : `  ${izoh}`}`);
}

interface Muhit {
  dispatcher: MessageDispatcher;
  qoyilganStatus: string[];
  auditlar: string[];
}

function build(opts: { xato: unknown; hozirgiStatus?: TelegramLookupStatus }): Muhit {
  const qoyilganStatus: string[] = [];
  const auditlar: string[] = [];

  const conversation = {
    id: 'cv1',
    clientId: 'c1',
    telegramAccountId: 'acc1',
    peerId: '777',
    peerAccessHash: 'hash',
  } as unknown as Conversation;

  const messages = {
    hasOutbound: async () => true,
    create: async () => ({ id: 'm1' }),
    updateStatus: async () => ({ id: 'm1' }),
  } as unknown as IMessageRepository;

  const conversations = {
    touchOutbound: async () => undefined,
    update: async () => undefined,
  } as unknown as IConversationRepository;

  const accounts = {
    findById: async () => ({
      id: 'acc1',
      label: 'Asosiy',
      status: 'connected',
      isEnabled: true,
      spamStatus: 'clean',
      spamUntil: null,
      floodWaitUntil: null,
      floodWaitSince: null,
      peerFloodSince: null,
      dailyLimit: 30,
      sentToday: 0,
      counterDate: TODAY,
    }),
    incrementSentToday: async () => 1,
  } as unknown as ITelegramAccountRepository;

  // Yuborish har doim berilgan xato bilan tugaydi.
  const gateway = {
    runExclusive: async <T>(_id: string, _o: unknown, fn: () => Promise<T>) => fn(),
    markRead: async () => undefined,
    sendMessage: async () => {
      throw opts.xato;
    },
  } as unknown as ITelegramGateway;

  const clients = {
    findById: async () => ({
      id: 'c1',
      fullName: 'Testov Testoy',
      telegramStatus: opts.hozirgiStatus ?? 'found',
    }),
    setTelegramStatus: async (id: string, status: TelegramLookupStatus) => {
      qoyilganStatus.push(`${id}:${status}`);
      return {};
    },
  } as unknown as IClientRepository;

  const audit = {
    record: async (entry: { action: string }) => {
      auditlar.push(entry.action);
    },
  } as unknown as IAuditRepository;

  const dispatcher = new MessageDispatcher(
    messages,
    conversations,
    accounts,
    gateway,
    { get: async () => ({ killSwitch: false }) } as unknown as RuntimeSettings,
    { publish: () => undefined } as unknown as IEventBus,
    { now: () => new Date(`${TODAY}T09:00:00Z`), todayIso: () => TODAY } as unknown as IClock,
    {} as unknown as IMediaStorage,
    clients,
    audit,
  );

  return { dispatcher, qoyilganStatus, auditlar };
}

async function yubor(m: Muhit): Promise<void> {
  await m.dispatcher
    .send({
      conversation: { id: 'cv1', clientId: 'c1', telegramAccountId: 'acc1', peerId: '777', peerAccessHash: 'hash' } as unknown as Conversation,
      body: 'Salom',
      author: 'agent',
    })
    // Xato baribir yuqoriga otiladi — bu yerda uni yutamiz.
    .catch(() => undefined);
}

// ─── Bloklandi ───────────────────────────────────────────────────────────
{
  const m = build({ xato: new TelegramError('Mijoz bloklagan', 'USER_IS_BLOCKED') });
  await yubor(m);
  check('USER_IS_BLOCKED — status qo\'yildi', m.qoyilganStatus.join() === 'c1:blocked', m.qoyilganStatus.join());
  check('jurnalga yozildi', m.auditlar.join() === 'client.blocked_us', m.auditlar.join());
}

// Ikkinchi marta yozilmaydi: har bir urinishda audit yozuvi paydo bo'lsa,
// jurnal bir xil qatorlar bilan to'lib ketardi.
{
  const m = build({
    xato: new TelegramError('Mijoz bloklagan', 'USER_IS_BLOCKED'),
    hozirgiStatus: 'blocked',
  });
  await yubor(m);
  check('allaqachon bloklangan — qayta yozilmadi', m.qoyilganStatus.length === 0);
  check('takroriy audit yo\'q', m.auditlar.length === 0);
}

// ─── Akkaunt O'CHIRILGAN (bloklashdan boshqa hodisa) ─────────────────────
//
// PRODUKSIYADA KUYDIRGAN: mijozning Telegram akkaunti o'chirilganda kod
// buni BIZNING akkauntimiz bloklangan deb tushunardi va butun akkauntni
// to'xtatib qo'yardi. Endi xato mijozga tegishli deb tanilib, MIJOZ
// belgilanadi — akkauntga umuman tegilmaydi.
{
  const m = build({ xato: new TelegramError('Mijozning akkaunti o\'chirilgan', 'USER_DEACTIVATED_TARGET') });
  await yubor(m);
  check(
    'USER_DEACTIVATED_TARGET — mijoz "deactivated" deb belgilandi',
    m.qoyilganStatus.join() === 'c1:deactivated',
    m.qoyilganStatus.join(),
  );
  check('jurnalga yozildi', m.auditlar.join() === 'client.telegram_deactivated', m.auditlar.join());
}

// Takroriy urinishda audit qatori qayta yozilmasin.
{
  const m = build({
    xato: new TelegramError('Mijozning akkaunti o\'chirilgan', 'USER_DEACTIVATED_TARGET'),
    hozirgiStatus: 'deactivated',
  });
  await yubor(m);
  check('allaqachon belgilangan — qayta yozilmadi', m.qoyilganStatus.length === 0);
  check('takroriy audit yo\'q', m.auditlar.length === 0);
}

// "Bloklagan" va "o'chirilgan" bir-biriga aralashmasligi kerak: operator
// uchun bular ikki xil ish.
{
  const m = build({ xato: new TelegramError('Mijoz bloklagan', 'USER_IS_BLOCKED') });
  await yubor(m);
  check(
    'USER_IS_BLOCKED "deactivated" qilib qo\'ymaydi',
    !m.qoyilganStatus.join().includes('deactivated'),
    m.qoyilganStatus.join(),
  );
}

// ─── Boshqa xatolar bloklash EMAS ────────────────────────────────────────
{
  const m = build({ xato: new TelegramError('Juda tez', 'FLOOD_WAIT', 60) });
  await yubor(m);
  check('FLOOD_WAIT — bloklangan deb belgilanmadi', m.qoyilganStatus.length === 0);
}
{
  const m = build({ xato: new TelegramError('Maxfiylik', 'USER_PRIVACY_RESTRICTED') });
  await yubor(m);
  check('USER_PRIVACY_RESTRICTED — belgilanmadi', m.qoyilganStatus.length === 0);
}
{
  const m = build({ xato: new AppError('Tarmoq uzildi', 503, 'NETWORK') });
  await yubor(m);
  check('oddiy xato — belgilanmadi', m.qoyilganStatus.length === 0);
}
{
  const m = build({ xato: new Error('USER_IS_BLOCKED') });
  await yubor(m);
  // Xom `Error` — gateway uni `TelegramError` ga o'girmagan degani. Matnga
  // qarab qaror qilmaymiz: "USER_IS_BLOCKED" so'zi boshqa kontekstda ham
  // uchrashi mumkin, kod esa aniq belgi.
  check('xom Error matni bo\'yicha belgilanmaydi', m.qoyilganStatus.length === 0);
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
