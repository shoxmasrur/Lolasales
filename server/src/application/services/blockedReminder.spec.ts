import type { ICourseRepository } from '@/domain/repositories/ICourseRepository';
import type { XaridXizmati } from '@/application/services/XaridXizmati';
import type { KartaYuboruvchi } from '@/application/services/KartaYuboruvchi';
import { AgentRunner } from '@/application/services/AgentRunner';
import type { Conversation } from '@/domain/entities/Conversation';
import type { Client, TelegramLookupStatus } from '@/domain/entities/Client';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';

/**
 * Qo'lda ishga tushiriladi: npm run test:blocked-reminder --workspace=server
 *
 * Bizni bloklagan mijozga eslatma yuborilmasligi kerak:
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
        state: 'contacted',
      }) as unknown as Conversation,
    markContactedIfNew: async () => undefined,
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
    bosh, clients, conversations, bosh,
    bosh, settings, bosh, { publish: () => undefined } as never, bosh,
    bosh, bosh, bosh, bosh, bosh, bosh, bosh,
    { list: async () => [], listKnowledge: async () => [] } as unknown as ICourseRepository,
    { joriyXarid: async () => null, faol: async () => null, tolanganKurslar: async () => [], agentKursi: async () => null, bolibTolash: async () => false, bosqich: async () => null } as unknown as XaridXizmati,
    { yubor: async () => ({ sent: false }) } as unknown as KartaYuboruvchi,
  );
}

// ─── Bloklagan mijoz ─────────────────────────────────────────────────────
{
  const runner = build('blocked');
  let xato: unknown = null;
  const result = await runner.nudge('cv1', 'qiziqdi').catch((e: unknown) => {
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
  await runner.nudge('cv1', 'qiziqdi').catch((e: unknown) => {
    xato = e;
  });
  check('bloklanmagan mijozda ish davom etdi', xato === PAST_GUARD, String(xato));
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
