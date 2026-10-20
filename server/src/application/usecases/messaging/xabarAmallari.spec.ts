import { DeleteMessageUseCase } from '@/application/usecases/messaging/DeleteMessageUseCase';
import { EditMessageUseCase } from '@/application/usecases/messaging/EditMessageUseCase';
import { MessageDispatcher } from '@/application/services/MessageDispatcher';
import type { Conversation } from '@/domain/entities/Conversation';
import type { Message } from '@/domain/entities/Message';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IMediaStorage } from '@/domain/services/IMediaStorage';
import type { ITelegramGateway } from '@/domain/services/ITelegramGateway';
import type { IClock, IEventBus } from '@/domain/services/support';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';

/**
 * Qo'lda ishga tushiriladi: npm run test:xabar-amallari --workspace=server
 *
 * Bazaga ham, Telegramga ham chiqmaydi — hamma port soxta.
 */

let failed = 0;
function check(holat: string, ok: boolean, izoh = ''): void {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${holat}${ok ? '' : `  ${izoh}`}`);
}

const HOZIR = new Date('2026-09-10T12:00:00Z');
const SOAT = 60 * 60 * 1000;

interface Xabar {
  id: string;
  conversationId: string;
  direction: 'in' | 'out';
  sentAt: Date | null;
  telegramMsgId: number | null;
  revokedAt: Date | null;
  media: unknown;
}

function xabar(patch: Partial<Xabar> = {}): Xabar {
  return {
    id: 'm1',
    conversationId: 'cv1',
    direction: 'out',
    sentAt: new Date(HOZIR.getTime() - SOAT),
    telegramMsgId: 555,
    revokedAt: null,
    media: null,
    ...patch,
  };
}

function build(m: Xabar | null): {
  edit: EditMessageUseCase;
  del: DeleteMessageUseCase;
  chaqiruv: string[];
} {
  const chaqiruv: string[] = [];

  const conversations = {
    findById: async () => ({ id: 'cv1', clientId: 'c1' }),
  } as unknown as IConversationRepository;

  const messages = { findById: async () => m } as unknown as IMessageRepository;

  const dispatcher = {
    editText: async () => {
      chaqiruv.push('editText');
      return m;
    },
    deleteMessage: async () => {
      chaqiruv.push('deleteMessage');
      return m;
    },
  } as unknown as MessageDispatcher;

  const audit = { record: async () => undefined } as unknown as IAuditRepository;
  const clock = { now: () => HOZIR, todayIso: () => '2026-09-10' } as IClock;

  return {
    edit: new EditMessageUseCase(conversations, messages, dispatcher, audit, clock),
    del: new DeleteMessageUseCase(conversations, messages, dispatcher, audit, clock),
    chaqiruv,
  };
}

const tahrir = { conversationId: 'cv1', messageId: 'm1', body: 'tuzatilgan matn', userId: 'u1', userEmail: 'a@b.uz' };
const ochirish = { conversationId: 'cv1', messageId: 'm1', userId: 'u1', userEmail: 'a@b.uz' };

async function yiqiladimi(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return '';
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

// 1. Oddiy holat — ikkalasi ham dispatcherga yetib boradi.
{
  const { edit, chaqiruv } = build(xabar());
  await edit.execute(tahrir);
  check('tahrirlash dispatcherga o\'tadi', chaqiruv.includes('editText'), chaqiruv.join(','));
}
{
  const { del, chaqiruv } = build(xabar());
  await del.execute(ochirish);
  check('o\'chirish dispatcherga o\'tadi', chaqiruv.includes('deleteMessage'), chaqiruv.join(','));
}

// 2. Mijozning xabariga tegilmaydi.
{
  const { edit, del } = build(xabar({ direction: 'in' }));
  check('kiruvchi xabar tahrirlanmaydi', (await yiqiladimi(() => edit.execute(tahrir))) !== '');
  check('kiruvchi xabar o\'chirilmaydi', (await yiqiladimi(() => del.execute(ochirish))) !== '');
}

// 3. 48 soat chegarasi — faqat tahrirlashda.
{
  const eski = xabar({ sentAt: new Date(HOZIR.getTime() - 49 * SOAT) });
  const { edit } = build(eski);
  check('49 soatlik xabar tahrirlanmaydi', (await yiqiladimi(() => edit.execute(tahrir))) !== '');

  const { del, chaqiruv } = build(eski);
  await del.execute(ochirish);
  check('49 soatlik xabar o\'chiriladi', chaqiruv.includes('deleteMessage'), chaqiruv.join(','));
}

// 4. Allaqachon o'chirilgan xabar qayta tahrirlanmaydi.
{
  const { edit } = build(xabar({ revokedAt: HOZIR }));
  check('o\'chirilgan xabar tahrirlanmaydi', (await yiqiladimi(() => edit.execute(tahrir))) !== '');
}

// 4b. Allaqachon o'chirilgan xabarni qayta o'chirish — idempotent, dispatcherga tegmaydi.
{
  const { del, chaqiruv } = build(xabar({ revokedAt: HOZIR }));
  check('o\'chirilgan xabarni qayta o\'chirish yiqilmaydi', (await yiqiladimi(() => del.execute(ochirish))) === '');
  check('qayta o\'chirish dispatcherga chiqmaydi', !chaqiruv.includes('deleteMessage'), chaqiruv.join(','));
}

// 5. Media xabar: tahrirlash rad etiladi, o'chirish ishlaydi.
{
  const media = xabar({ media: { kind: 'photo' } });
  const { edit } = build(media);
  check('media xabar tahrirlanmaydi', (await yiqiladimi(() => edit.execute(tahrir))) !== '');

  const { del, chaqiruv } = build(media);
  await del.execute(ochirish);
  check('media xabar o\'chiriladi', chaqiruv.includes('deleteMessage'), chaqiruv.join(','));
}

// 6. Boshqa suhbatning xabari.
{
  const { edit } = build(xabar({ conversationId: 'cv2' }));
  check('begona xabar tahrirlanmaydi', (await yiqiladimi(() => edit.execute(tahrir))) !== '');
}
{
  const { del } = build(xabar({ conversationId: 'cv2' }));
  check('begona xabar o\'chirilmaydi', (await yiqiladimi(() => del.execute(ochirish))) !== '');
}

// 7. Xabar topilmadi.
{
  const { edit } = build(null);
  check('yo\'q xabar tahrirlanmaydi', (await yiqiladimi(() => edit.execute(tahrir))) !== '');
}

// 8. Telegramga ketmagan xabar (telegramMsgId yo'q) — 48 soat tegishli emas.
{
  const { edit, chaqiruv } = build(
    xabar({ telegramMsgId: null, sentAt: null }),
  );
  await edit.execute(tahrir);
  check('ketmagan xabar har doim tahrirlanadi', chaqiruv.includes('editText'), chaqiruv.join(','));
}

// 9. Xabar Telegramga ketgan, lekin suhbat akkauntini yo'qotgan (masalan,
//    akkaunt o'chirilganda `PgTelegramAccountRepository.remove()` shu
//    akkauntga bog'liq suhbatlarning `telegram_account_id`sini NULL
//    qiladi). Bu "hech qachon ketmagan xabar" bilan BIR XIL EMAS — mijozda
//    xabar hali ham turibdi, shuning uchun baza YOZILMASLIGI kerak.
//
//    Bu yerda `EditMessageUseCase`/`DeleteMessageUseCase` emas, balki
//    `MessageDispatcher.editText`/`deleteMessage` TO'G'RIDAN-TO'G'RI soxta
//    gateway va soxta repozitoriy bilan sinaladi: fayldagi boshqa
//    testlarda dispatcher o'zi soxta (faqat chaqiruvni qayd etadi), shuning
//    uchun MessageDispatcher ICHIDAGI qoidani buzsa ham o'sha testlar buni
//    payqamaydi. Haqiqiy dispatcher bilan sinash — regressiyani chinakam
//    ushlaydigan yagona yo'l.
function dispatcherQuring(): { dispatcher: MessageDispatcher; chaqiruv: string[] } {
  const chaqiruv: string[] = [];

  const messages = {
    markEdited: async () => {
      chaqiruv.push('markEdited');
      return {} as Message;
    },
    markRevoked: async () => {
      chaqiruv.push('markRevoked');
      return {} as Message;
    },
  } as unknown as IMessageRepository;

  const gateway = {
    editMessage: async () => {
      chaqiruv.push('gateway.editMessage');
    },
    deleteMessage: async () => {
      chaqiruv.push('gateway.deleteMessage');
    },
  } as unknown as ITelegramGateway;

  const clock = { now: () => HOZIR, todayIso: () => '2026-09-10' } as IClock;
  const events = { publish: () => undefined } as unknown as IEventBus;

  const dispatcher = new MessageDispatcher(
    messages,
    {} as IConversationRepository,
    {} as ITelegramAccountRepository,
    gateway,
    {} as RuntimeSettings,
    events,
    clock,
    {} as IMediaStorage,
    {} as IClientRepository,
    {} as IAuditRepository,
  );

  return { dispatcher, chaqiruv };
}

// Peer bor (mijozning telegram profili aniqlangan), lekin akkaunt yo'q —
// aynan akkaunt o'chirilgandan keyingi holat.
const akkauntsizSuhbat = {
  id: 'cv1',
  clientId: 'c1',
  peerId: '999888',
  peerAccessHash: '111',
  telegramAccountId: null,
} as unknown as Conversation;

const yuborilganXabar = xabar() as unknown as Message; // telegramMsgId: 555 — Telegramga ketgan

{
  const { dispatcher, chaqiruv } = dispatcherQuring();
  const xato = await yiqiladimi(() =>
    dispatcher.deleteMessage({ conversation: akkauntsizSuhbat, message: yuborilganXabar }),
  );
  check('akkaunti yo\'qolgan suhbatda o\'chirish yiqiladi', xato !== '', xato);
  check(
    'akkaunti yo\'qolgan suhbatda o\'chirishda baza YOZILMAYDI',
    !chaqiruv.includes('markRevoked'),
    chaqiruv.join(','),
  );
}
{
  const { dispatcher, chaqiruv } = dispatcherQuring();
  const xato = await yiqiladimi(() =>
    dispatcher.editText({ conversation: akkauntsizSuhbat, message: yuborilganXabar, body: 'yangi matn' }),
  );
  check('akkaunti yo\'qolgan suhbatda tahrirlash yiqiladi', xato !== '', xato);
  check(
    'akkaunti yo\'qolgan suhbatda tahrirlashda baza YOZILMAYDI',
    !chaqiruv.includes('markEdited'),
    chaqiruv.join(','),
  );
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
