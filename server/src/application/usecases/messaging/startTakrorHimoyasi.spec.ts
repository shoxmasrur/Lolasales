import { StartConversationUseCase } from '@/application/usecases/messaging/StartConversationUseCase';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IEventBus } from '@/domain/services/support';
import type { ITelegramGateway } from '@/domain/services/ITelegramGateway';
import type { MessageStatus } from '@/domain/entities/Message';
import type { AgentRunner } from '@/application/services/AgentRunner';
import type { ClientTelegramResolver } from '@/application/services/ClientTelegramResolver';
import type { ContractSyncService } from '@/application/services/ContractSyncService';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';

/**
 * Qo'lda ishga tushiriladi: npm run test:start-takror-himoyasi --workspace=server
 *
 * Bazaga, Telegramga va modelga chiqmaydi — hamma port soxta.
 *
 * Nima qo'riqlanadi: jarayon Telegram xabarni yetkazgandan keyin, suhbat
 * holati `new` dan chiqishidan oldin o'lsa, suhbat `new` bo'lib qoladi.
 * Tiklangan ommaviy ish shu mijozga qayta keladi — va unga IKKINCHI
 * birinchi xabar KETMASLIGI shart. Mezon: suhbatda yetib borgan bo'lishi
 * mumkin bo'lgan chiquvchi xabar (`draft` va `failed` dan boshqa har
 * qanday holat).
 */
let failed = 0;
const check = (nom: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${nom}${ok || !izoh ? '' : `  ${izoh}`}`);
};

/** Pg so'rovidagi qoida bilan bir xil: `status NOT IN ('draft', 'failed')`. */
const YETMAGAN: ReadonlySet<MessageStatus> = new Set(['draft', 'failed']);

interface Muhit {
  /** `null` — suhbat yo'q (birinchi marta). */
  readonly suhbat: { state: string } | null;
  /** Suhbatdagi chiquvchi xabarlar holati. */
  readonly chiquvchi: MessageStatus[];
  /** Mijozda muddati tugamagan talabnoma bor. */
  readonly sukut?: boolean;
}

function build(m: Muhit) {
  const iz = { sinx: 0, qidiruv: 0, agent: 0, tekshiruv: 0, sukutSorovi: [] as Array<[string, string]> };
  const conv = m.suhbat
    ? { id: 'conv1', clientId: 'c1', state: m.suhbat.state, telegramAccountId: 'a1' }
    : null;

  const clients = {
    findById: async (id: string) => ({
      id, fullName: 'Aziz Azizov', firstName: 'Aziz', phone: '+998901112233', extraPhones: [],
      telegramUserId: null, telegramStatus: 'unknown', doNotContact: false,
    }),
  } as unknown as IClientRepository;

  const contracts = {
    findByClientId: async () => [
      { id: 'ct1', virtualStatus: 'sold', debtFirst: 0, debtMonthly: 500_000, daysOverdue: 30 },
    ],
    findPrimaryForClient: async () => null,
  } as unknown as IContractRepository;

  const conversations = {
    findByClientId: async () => conv,
    create: async () => ({ id: 'conv1', clientId: 'c1', state: 'new' }),
    update: async (id: string) => ({ ...(conv ?? {}), id }),
    findById: async () => conv,
  } as unknown as IConversationRepository;

  const resolver = {
    resolve: async () => {
      iz.qidiruv += 1;
      return {
        kind: 'ok' as const,
        value: { accountId: 'a1', peer: { telegramUserId: '1', accessHash: '2' }, nameMismatchOverridden: false },
      };
    },
  } as unknown as ClientTelegramResolver;

  const agent = {
    firstContact: async () => {
      iz.agent += 1;
      return { sent: true, reply: 'Assalomu alaykum' };
    },
  } as unknown as AgentRunner;

  const messages = {
    hasPossiblyDeliveredOutbound: async () => {
      iz.tekshiruv += 1;
      return m.chiquvchi.some((s) => !YETMAGAN.has(s));
    },
  } as unknown as IMessageRepository;

  const useCase = new StartConversationUseCase(
    clients, contracts, conversations, resolver, agent,
    { record: async () => undefined } as unknown as IAuditRepository,
    { publish: () => undefined } as unknown as IEventBus,
    {
      syncOne: async () => { iz.sinx += 1; return { outcome: 'disabled' as const }; },
      lastSyncedAt: async () => new Date(),
    } as unknown as ContractSyncService,
    { saveContact: async () => undefined } as unknown as ITelegramGateway,
    { get: async () => ({ minDebt: 0 }) } as unknown as RuntimeSettings,
    messages,
    {
      sukutdami: async (clientId: string, today: string) => {
        iz.sukutSorovi.push([clientId, today]);
        return m.sukut === true;
      },
    },
    { todayIso: () => '2026-10-19' },
  );
  return { useCase, iz };
}

// ─── `new` suhbat, xabar yuborilayotganda jarayon o'lgan ───────────────────
for (const holat of ['sending', 'queued', 'sent', 'delivered', 'read'] as const) {
  const t = build({ suhbat: { state: 'new' }, chiquvchi: ['failed', holat] });
  const natija = await t.useCase.execute('c1');
  check(`'${holat}' chiquvchi bor — o'tkazib yuboriladi`, natija.status === 'skipped');
  check(
    `'${holat}' — sabab "Suhbat allaqachon boshlangan"`,
    natija.status === 'skipped' && natija.reason === 'Suhbat allaqachon boshlangan',
    natija.status === 'skipped' ? natija.reason : natija.status,
  );
  check(`'${holat}' — agent CHAQIRILMAYDI (xabar ketmaydi)`, t.iz.agent === 0);
  // Tekshiruv sinxronizatsiya va qidiruvdan OLDIN: behuda HTTP so'rov va
  // MTProto qidiruvi ketmasin.
  check(`'${holat}' — qidiruv va sinx yo'q`, t.iz.qidiruv === 0 && t.iz.sinx === 0);
}

// ─── Faqat aniq yiqilgan yoki qoralama — xabar mijozga yetmagan ────────────
{
  const t = build({ suhbat: { state: 'new' }, chiquvchi: ['failed', 'draft'] });
  const natija = await t.useCase.execute('c1');
  check('faqat failed/draft — suhbat boshlanadi', natija.status === 'started', natija.status);
  check('faqat failed/draft — agent bir marta chaqirildi', t.iz.agent === 1);
}

// ─── Chiquvchi xabarsiz `new` suhbat (AGENT_NO_REPLY qoldig'i) ─────────────
{
  const t = build({ suhbat: { state: 'new' }, chiquvchi: [] });
  const natija = await t.useCase.execute('c1');
  check('bo\'sh new suhbat — davom ettiriladi', natija.status === 'started', natija.status);
}

// ─── Suhbat yo'q — tekshiruv kerak emas ───────────────────────────────────
{
  const t = build({ suhbat: null, chiquvchi: [] });
  const natija = await t.useCase.execute('c1');
  check('yangi mijoz — boshlanadi', natija.status === 'started', natija.status);
  check('yangi mijoz — xabar tekshiruvi chaqirilmadi', t.iz.tekshiruv === 0);
}

// ─── Eski qoida o'z kuchida ───────────────────────────────────────────────
{
  const t = build({ suhbat: { state: 'active' }, chiquvchi: [] });
  const natija = await t.useCase.execute('c1');
  check('new emas — o\'tkazib yuboriladi', natija.status === 'skipped');
  check('new emas — agent chaqirilmadi', t.iz.agent === 0);
}

// ─── Talabnoma muddati ichida — suhbat boshlanmaydi ───────────────────────
{
  const t = build({ suhbat: null, chiquvchi: [], sukut: true });
  const natija = await t.useCase.execute('c1');
  check(
    'talabnoma muddati — skipped, kod talabnoma_sukuti',
    natija.status === 'skipped' && natija.code === 'talabnoma_sukuti' && natija.reason === 'Talabnoma muddati tugamagan',
    JSON.stringify(natija),
  );
  check('talabnoma muddati — agent, qidiruv va sinx yo\'q', t.iz.agent === 0 && t.iz.qidiruv === 0 && t.iz.sinx === 0, JSON.stringify(t.iz));
  check(
    'talabnoma muddati — mijoz va bugungi sana bilan so\'raldi',
    t.iz.sukutSorovi.some(([c, d]) => c === 'c1' && d === '2026-10-19'),
    JSON.stringify(t.iz.sukutSorovi),
  );
}
{
  const t = build({ suhbat: null, chiquvchi: [], sukut: false });
  const natija = await t.useCase.execute('c1');
  check('talabnoma sukuti yo\'q — avvalgidek boshlanadi', natija.status === 'started' && t.iz.agent === 1, natija.status);
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
