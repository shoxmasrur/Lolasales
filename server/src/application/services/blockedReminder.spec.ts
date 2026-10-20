import { AgentRunner } from '@/application/services/AgentRunner';
import type { Conversation } from '@/domain/entities/Conversation';
import type { Client, TelegramLookupStatus } from '@/domain/entities/Client';
import type { PaymentPromise } from '@/domain/entities/PaymentPromise';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';

/**
 * Qo'lda ishga tushiriladi: npm run test:blocked-reminder --workspace=server
 *
 * Bizni bloklagan mijozga va'da kuni eslatmasi yuborilmasligi kerak:
 * `USER_IS_BLOCKED` qaytadi, xabar `failed` bo'lib qoladi va har kuni
 * qaytariladi. Model chaqiruvi ham bekorga sarflanadi, shuning uchun
 * tekshiruv AGENT CHAQIRUVIDAN OLDIN turishi shart.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  ${izoh}`}`);
};

/** Guard'dan o'tib ketilganini bilish uchun: keyingi qadam shuni otadi. */
const PAST_GUARD = new Error('guard-dan-o\'tdi');

function build(status: TelegramLookupStatus): AgentRunner {
  const conversations = {
    findById: async () =>
      ({
        id: 'cv1',
        clientId: 'c1',
        agentEnabled: true,
        needsHuman: false,
        state: 'promised',
        stage: 'soft',
      }) as unknown as Conversation,
  } as unknown as IConversationRepository;

  const clients = {
    findById: async () =>
      ({ id: 'c1', fullName: 'Testov Testoy', telegramStatus: status }) as unknown as Client,
  } as unknown as IClientRepository;

  // Guard'dan keyingi birinchi qadam — shu yerda uzamiz.
  const settings = {
    get: async () => {
      throw PAST_GUARD;
    },
  } as unknown as RuntimeSettings;

  const bosh = {} as never;
  return new AgentRunner(
    bosh, clients, bosh, conversations, bosh, bosh,
    bosh, settings, bosh, { publish: () => undefined } as never, bosh,
    bosh, bosh, bosh, bosh, bosh, bosh, bosh, bosh, bosh, bosh,
  );
}

const promise = { id: 'p1', amount: 1_000_000, promisedDate: new Date('2026-08-10') } as PaymentPromise;

// ─── Bloklagan mijoz ─────────────────────────────────────────────────────
{
  const runner = build('blocked');
  let xato: unknown = null;
  const result = await runner.promiseReminder('cv1', promise).catch((e) => {
    xato = e;
    return null;
  });

  check('eslatma yuborilmadi', result?.sent === false, JSON.stringify(result));
  check('matn ham tayyorlanmadi', result?.reply === null);
  check(
    'agent chaqiruvigacha yetmadi (model sarflanmadi)',
    xato === null,
    xato === PAST_GUARD ? 'guard ishlamadi' : String(xato),
  );
}

// ─── Oddiy mijoz — guard to'sib qo'ymasligi kerak ────────────────────────
// Bu teskari tekshiruv muhim: guard hammani to'sib qo'ysa, eslatmalar
// butunlay to'xtardi va buni hech kim sezmasdi.
{
  const runner = build('found');
  let xato: unknown = null;
  await runner.promiseReminder('cv1', promise).catch((e) => {
    xato = e;
  });
  check('bloklanmagan mijozda ish davom etdi', xato === PAST_GUARD, String(xato));
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
