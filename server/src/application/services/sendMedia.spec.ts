import { MessageDispatcher } from '@/application/services/MessageDispatcher';
import type { Conversation } from '@/domain/entities/Conversation';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { ITelegramGateway } from '@/domain/services/ITelegramGateway';
import type { IMediaStorage } from '@/domain/services/IMediaStorage';
import type { IClock, IEventBus } from '@/domain/services/support';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';

/**
 * Qo'lda ishga tushiriladi: npm run test:send-media --workspace=server
 *
 * Bazaga ham, Telegramga ham chiqmaydi — hamma port soxta.
 *
 * Nima tekshiriladi: operator chatdan yuborgan BIRINCHI fayl ham kunlik
 * hisoblagichni oshirishi kerak. Telegram uchun notanish odamga birinchi
 * bo'lib rasm yuborish xuddi matn kabi cold outreach; hisoblanmasa bizning
 * sonimiz Telegramnikidan kichik bo'lib qoladi. Lekin limit uni
 * TO'SMASLIGI kerak — matndagi bilan bir xil qoida.
 *
 * Bunday holat haqiqatan uchraydi: `agentAutoReply` o'chirilganda agentning
 * javobi `draft` bo'lib qoladi, ya'ni chiquvchi xabari nol bo'lgan suhbat
 * paydo bo'ladi.
 */

let failed = 0;
function check(holat: string, ok: boolean, izoh = ''): void {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${holat}${ok ? '' : `  ${izoh}`}`);
}

const TODAY = '2026-08-08';

interface Muhit {
  dispatcher: MessageDispatcher;
  oshirilgan: string[];
  conversation: Conversation;
}

function build(opts: { hasOutbound: boolean; sentToday?: number; dailyLimit?: number }): Muhit {
  const oshirilgan: string[] = [];

  const conversation = {
    id: 'cv1',
    clientId: 'c1',
    telegramAccountId: 'acc1',
    peerId: '777',
    peerAccessHash: 'hash',
  } as unknown as Conversation;

  // Bazadagi haqiqiy xatti-harakatga yaqinlashtiramiz: `create()` chaqirilgach
  // shu suhbatda chiquvchi xabar paydo bo'ladi, shuning uchun `hasOutbound`
  // shundan keyin `true` qaytarishi kerak. Aks holda soxta port doim bir xil
  // qiymat qaytaradi va `MessageDispatcher.sendMedia` ichida `hasOutbound`
  // tekshiruvini `create()` dan keyinga ko'chirib qo'yish (tartib xatosi)
  // testni sindirmay qoladi — bu esa aynan shu qoldiqni tekshirish uchun.
  let yaratildi = false;
  const messages = {
    hasOutbound: async () => opts.hasOutbound || yaratildi,
    create: async () => {
      yaratildi = true;
      return { id: 'm1' };
    },
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
      dailyLimit: opts.dailyLimit ?? 30,
      sentToday: opts.sentToday ?? 0,
      counterDate: TODAY,
    }),
    incrementSentToday: async (id: string, today: string) => {
      oshirilgan.push(`${id}:${today}`);
      return 1;
    },
  } as unknown as ITelegramAccountRepository;

  const gateway = {
    runExclusive: async <T>(_id: string, _o: unknown, fn: () => Promise<T>) => fn(),
    markRead: async () => undefined,
    sendMedia: async () => ({ telegramMsgId: '1', sentAt: new Date('2026-08-08T10:00:00Z') }),
  } as unknown as ITelegramGateway;

  const settings = { get: async () => ({ killSwitch: false }) } as unknown as RuntimeSettings;
  const events = { publish: () => undefined } as unknown as IEventBus;
  const clock = {
    now: () => new Date('2026-08-08T10:00:00Z'),
    todayIso: () => TODAY,
  } as unknown as IClock;
  const storage = {
    save: async () => ({ path: 'media/1.jpg', sizeBytes: 10 }),
  } as unknown as IMediaStorage;
  // Bloklanish faqat xato yo'lida tekshiriladi; bu sinov muvaffaqiyatli
  // yuborishni tekshiradi, shuning uchun bo'sh qobiq yetarli.
  const clients = {
    findById: async () => null,
    setTelegramStatus: async () => ({}),
  } as unknown as IClientRepository;
  const audit = { record: async () => undefined } as unknown as IAuditRepository;

  const dispatcher = new MessageDispatcher(
    messages,
    conversations,
    accounts,
    gateway,
    settings,
    events,
    clock,
    storage,
    clients,
    audit,
  );

  return { dispatcher, oshirilgan, conversation };
}

function payload(conversation: Conversation) {
  return {
    conversation,
    data: Buffer.from('rasm'),
    fileName: 'kvitansiya.jpg',
    mimeType: 'image/jpeg',
    caption: 'To\'lov kvitansiyasi',
    author: 'human' as const,
    authorUserId: 'u1',
  };
}

// 1. Suhbatda chiquvchi xabar yo'q — birinchi fayl hisoblagichni oshiradi.
{
  const { dispatcher, oshirilgan, conversation } = build({ hasOutbound: false });
  await dispatcher.sendMedia(payload(conversation));
  check('birinchi fayl hisoblagichni oshiradi', oshirilgan.length === 1, `${oshirilgan.length} marta`);
  check('hisoblagich bugungi sana bilan oshadi', oshirilgan[0] === `acc1:${TODAY}`, `${oshirilgan[0]}`);
}

// 2. Suhbatda allaqachon chiquvchi xabar bor — sanalmaydi.
{
  const { dispatcher, oshirilgan, conversation } = build({ hasOutbound: true });
  await dispatcher.sendMedia(payload(conversation));
  check('keyingi fayl hisoblagichga tegmaydi', oshirilgan.length === 0, `${oshirilgan.length} marta`);
}

// 3. Kunlik limit to'lgan bo'lsa ham birinchi fayl TO'SILMAYDI — faqat sanaladi.
{
  const { dispatcher, oshirilgan, conversation } = build({
    hasOutbound: false,
    sentToday: 30,
    dailyLimit: 30,
  });
  let xato: unknown = null;
  try {
    await dispatcher.sendMedia(payload(conversation));
  } catch (err) {
    xato = err;
  }
  check('limit to\'lganda ham fayl ketadi', xato === null, `${(xato as Error)?.message}`);
  check('limit to\'lganda ham sanaladi', oshirilgan.length === 1, `${oshirilgan.length} marta`);
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
