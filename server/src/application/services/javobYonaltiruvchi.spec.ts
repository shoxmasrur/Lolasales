import { AgentRunner } from '@/application/services/AgentRunner';
import { JavobYonaltiruvchi } from '@/application/services/JavobYonaltiruvchi';
import type { ISuhbatJavobchisi } from '@/domain/services/ISuhbatJavobchisi';
import type { AgentEngineFactory } from '@/application/services/AgentEngineFactory';
import type { Conversation } from '@/domain/entities/Conversation';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { MessageDispatcher } from '@/application/services/MessageDispatcher';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import { NomalumMijozXatosi } from '@/shared/errors';

/**
 * Qo'lda ishga tushiriladi: npm run test:javob-yonaltiruvchi --workspace=server
 *
 * Telegramga ham, bazaga ham, modelga ham chiqmaydi.
 *
 * Ikki narsa tekshiriladi: (1) yo'naltiruvchi to'g'ri javobchini tanlaydi va
 * abort ikkalasiga boradi; (2) asosiy `AgentRunner` noma'lum mijozga hech
 * qachon yozmaydi — hatto operator tugmasi yoki sukut eslatmasi orqali ham.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

function javobchi(abortSoni: number): ISuhbatJavobchisi & { reply_: string[]; abort_: string[] } {
  const reply_: string[] = [];
  const abort_: string[] = [];
  return {
    reply_,
    abort_,
    reply: async (id: string) => {
      reply_.push(id);
      return 'ok';
    },
    abort: (_id: string, reason = 'operator') => {
      abort_.push(reason);
      return abortSoni;
    },
  };
}

// ─── Yo'naltirish ────────────────────────────────────────────────────────
for (const nomalumMi of [true, false]) {
  const asosiy = javobchi(0);
  const nomalum = javobchi(0);
  const y = new JavobYonaltiruvchi(asosiy, nomalum, async () => nomalumMi);
  await y.reply('s1', 'salom');
  const [chaqirilgan, chaqirilmagan] = nomalumMi ? [nomalum, asosiy] : [asosiy, nomalum];
  check(
    `nomalummi=${nomalumMi}: kerakli javobchi chaqirildi`,
    chaqirilgan.reply_.length === 1 && chaqirilmagan.reply_.length === 0,
  );
}

// ─── Abort ikkalasiga boradi, sonlar yig'iladi ───────────────────────────
{
  const asosiy = javobchi(1);
  const nomalum = javobchi(2);
  const y = new JavobYonaltiruvchi(asosiy, nomalum, async () => true);
  const soni = y.abort('s1', 'stale');
  check('abort sonlari yig\'ildi', soni === 3, String(soni));
  check(
    'abort sababi ikkalasiga ham yetdi',
    asosiy.abort_[0] === 'stale' && nomalum.abort_[0] === 'stale',
  );
  check('sukut sababi "operator"', (y.abort('s1'), asosiy.abort_[1] === 'operator'));
}

// ─── AgentRunner noma'lum mijozga yozmaydi ───────────────────────────────
{
  let dvigatelChaqirildi = 0;
  let yuborildi = 0;
  const suhbat = {
    id: 's1',
    clientId: 'n1',
    state: 'negotiating',
    stage: 'soft',
    agentEnabled: true,
    needsHuman: false,
  } as unknown as Conversation;
  const dvigatel = async (): Promise<never> => {
    dvigatelChaqirildi += 1;
    throw new Error('dvigatel chaqirilmasligi kerak edi');
  };
  // Konstruktor parametrlari ko'p; bu testga faqat to'rttasi kerak.
  const YasalganRunner = AgentRunner as unknown as new (...args: unknown[]) => AgentRunner;
  const runner = new YasalganRunner(
    { forAccount: dvigatel, standart: dvigatel } as unknown as AgentEngineFactory,
    { findById: async () => ({ id: 'n1', nomalum: true }) } as unknown as IClientRepository,
    {} as never,
    { findById: async () => suhbat } as unknown as IConversationRepository,
    {
      recentByConversation: dvigatel,
      create: dvigatel,
    } as unknown as IMessageRepository,
    {} as never,
    {
      send: async () => {
        yuborildi += 1;
      },
    } as unknown as MessageDispatcher,
    { get: async () => ({ agentAutoReply: true }) } as unknown as RuntimeSettings,
    ...([] as never[]),
  );

  const urinish = async (nom: string, f: () => Promise<unknown>): Promise<void> => {
    try {
      await f();
      check(`${nom}: xato tashlandi`, false);
    } catch (e) {
      check(`${nom}: NomalumMijozXatosi`, e instanceof NomalumMijozXatosi, String(e));
    }
  };
  await urinish('operatorTurn', () => runner.operatorTurn('s1'));
  await urinish('silenceNudge', () => runner.silenceNudge('s1', 1, false));
  await urinish('reply', () => runner.reply('s1', 'salom'));
  check('model chaqirilmadi', dvigatelChaqirildi === 0, String(dvigatelChaqirildi));
  check('Telegramga hech narsa ketmadi', yuborildi === 0);
}

console.log(failed === 0 ? '\nHammasi joyida' : `\n${failed} ta tekshiruv yiqildi`);
process.exit(failed === 0 ? 0 : 1);
