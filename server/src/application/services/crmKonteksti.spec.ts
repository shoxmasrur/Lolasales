import { AgentRunner } from '@/application/services/AgentRunner';
import type { AgentEngineFactory } from '@/application/services/AgentEngineFactory';
import type { ContractSyncService } from '@/application/services/ContractSyncService';
import type { MessageDispatcher } from '@/application/services/MessageDispatcher';
import type { PromptComposer } from '@/application/services/PromptComposer';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { AccountLabels } from '@/application/services/AccountLabels';
import type { Contract } from '@/domain/entities/Contract';
import type { Conversation } from '@/domain/entities/Conversation';
import type { Message, NewMessage } from '@/domain/entities/Message';
import type { PaymentPromise } from '@/domain/entities/PaymentPromise';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IContractPaymentRepository } from '@/domain/repositories/IContractPaymentRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { IPaymentPromiseRepository } from '@/domain/repositories/IPaymentPromiseRepository';
import type { IPaymentCheckRepository } from '@/domain/repositories/IPaymentCheckRepository';
import type { IAgentUsageRepository } from '@/domain/repositories/IAgentUsageRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type {
  IClientProfileRepository,
  ILessonRepository,
} from '@/domain/repositories/IAgentKnowledgeRepository';
import type { IAgentEngine, AgentTurnOutput } from '@/domain/services/IAgentEngine';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { IHolidayRepository } from '@/domain/repositories/IHolidayRepository';
import type { ITalabnomaRepository } from '@/domain/repositories/ITalabnomaRepository';
import type { IClock, IEventBus } from '@/domain/services/support';
import { CrmUnavailableError } from '@/shared/errors';

/**
 * Qo'lda: npm run test:crm-konteksti --workspace=server
 *
 * REAL HODISA (10-sentabr, produksiya): Boyirov Boyxonga 4 311 000 so'm
 * aytildi, CRM'da esa o'sha payt 4 811 000 turgan edi. Farq bitta
 * to'lovning ikki marta sanalishidan chiqdi va operator uni qo'lda
 * to'g'rilashga majbur bo'ldi.
 *
 * Shu sababli mijozga aytiladigan raqamning yagona manbai — CRM:
 *   • kontekst yig'ishda "Сотилди" shartnoma HAR SAFAR yangilanadi
 *     (kesh chetlab o'tiladi);
 *   • yangilanmasa — `CrmUnavailableError`, ya'ni xabar umuman yozilmaydi;
 *   • sotilmagan shartnomaning xatosi suhbatni to'xtatmaydi: u summaga
 *     kirmaydi;
 *   • CRM raqami va'da qoldig'idan farq qilsa, suhbatga ICHKI qayd
 *     yoziladi (mijozga ketmaydi).
 *
 * Tarmoqqa ham, bazaga ham chiqilmaydi.
 */

const shartnoma = (over: Partial<Contract> = {}): Contract =>
  ({
    id: 'c1',
    contractNo: '7317MSO26NF',
    clientId: 'cl1',
    virtualStatus: 'sold',
    objectName: 'MUHABBAT SHAHRI',
    apartment: '12',
    monthlyPayment: 1_000_000,
    debtFirst: 0,
    debtMonthly: 4_811_000,
    daysOverdue: 15,
    missedMonthsExact: 4,
    nextPaymentDate: null,
    contractDate: null,
    completionDate: null,
    paidTotal: 0,
    warningCount: 0,
    ...over,
  }) as unknown as Contract;

const vada = (amount: number, paidAmount: number, contractId: string | null = 'c1'): PaymentPromise =>
  ({
    id: 'v1',
    conversationId: 'cv1',
    clientId: 'cl1',
    contractId,
    amount,
    paidAmount,
    thankedAmount: 0,
    status: 'partial',
    promisedDate: new Date('2026-09-10T00:00:00+05:00'),
  }) as unknown as PaymentPromise;

const conversation = {
  id: 'cv1',
  clientId: 'cl1',
  telegramAccountId: null,
  agentEnabled: true,
  needsHuman: false,
  state: 'negotiating',
  stage: 'soft',
  agentSessionId: null,
} as unknown as Conversation;

interface Stend {
  /** Bazadagi shartnomalar. */
  shartnomalar?: Contract[];
  /** Shartnoma bo'yicha sinxronizatsiya natijasi: 'ok' | 'error' | 'tashlash'. */
  sync?: (contractId: string) => 'ok' | 'error' | 'tashlash';
  /** `ITalabnomaRepository.yuborilganlar` javobi. */
  talabnomalar?: unknown[];
}

const build = (stend: Stend = {}) => {
  const shartnomalar = stend.shartnomalar ?? [shartnoma()];
  const calls = {
    syncArgs: [] as Array<{ id: string; maxAge: number }>,
    qaydlar: [] as NewMessage[],
    yuborilganlar: [] as string[],
  };

  const engine = {
    composePromiseReminder: async () => ({ reply: null }) as unknown as AgentTurnOutput,
  } as unknown as IAgentEngine;
  // Akkaunt biriktirilmagan sinov — `forAccount` va `standart` bir xil
  // sinov dvigatelini qaytaradi (`AgentEngineFactory` yangi qatlami).
  const tanlangan = { engine, provider: 'claude' as const, model: 'sinov', llmModel: null };
  const engines = {
    forAccount: async () => tanlangan,
    standart: () => tanlangan,
  } as unknown as AgentEngineFactory;

  const runner = new AgentRunner(
    engines,
    {
      findById: async () => ({
        id: 'cl1',
        fullName: 'Boyirov Boyxon',
        firstName: 'Boyxon',
        telegramStatus: 'active',
      }),
    } as unknown as IClientRepository,
    {
      findByClientId: async () => shartnomalar,
      findById: async (id: string) => shartnomalar.find((c) => c.id === id) ?? null,
    } as unknown as IContractRepository,
    {
      findById: async () => conversation,
      update: async () => undefined,
    } as unknown as IConversationRepository,
    {
      create: async (data: NewMessage) => {
        calls.qaydlar.push(data);
        return { id: 'm1', ...data } as unknown as Message;
      },
      recentByConversation: async () => [] as Message[],
    } as unknown as IMessageRepository,
    {} as unknown as IPaymentPromiseRepository,
    {
      send: async ({ body }: { body: string }) => {
        calls.yuborilganlar.push(body);
      },
    } as unknown as MessageDispatcher,
    { get: async () => ({ agentAutoReply: true, weekdays: [1, 2, 3, 4, 5, 6] }) } as unknown as RuntimeSettings,
    { record: async () => undefined } as unknown as IAuditRepository,
    { publish: () => undefined } as unknown as IEventBus,
    {
      now: () => new Date('2026-09-16T10:00:00+05:00'),
      todayIso: () => '2026-09-16',
    } as IClock,
    {
      renderSections: async () => '',
      renderLessons: async () => '',
      renderClientMemory: async () => '',
    } as unknown as PromptComposer,
    {} as unknown as ILessonRepository,
    { upsert: async () => undefined } as unknown as IClientProfileRepository,
    {
      findUnpaidMonths: async () => [],
      listRecentPayments: async () => [],
    } as unknown as IContractPaymentRepository,
    {
      syncIfStale: async (id: string, maxAge: number) => {
        calls.syncArgs.push({ id, maxAge });
        const natija = stend.sync?.(id) ?? 'ok';
        if (natija === 'tashlash') throw new Error('ECONNREFUSED');
        return { outcome: natija, contractId: id, debtTotal: 0, newPhones: [] };
      },
    } as unknown as ContractSyncService,
    { findById: async () => null } as unknown as ITelegramAccountRepository,
    { labelOf: () => null } as unknown as AccountLabels,
    {} as unknown as IPaymentCheckRepository,
    { record: async () => undefined } as unknown as IAgentUsageRepository,
    { list: async () => [] } as unknown as IHolidayRepository,
    null,
    { yuborilganlar: async () => stend.talabnomalar ?? [] } as unknown as Pick<ITalabnomaRepository, 'yuborilganlar'>,
  );

  return { runner, calls };
};

let failed = 0;
const check = (name: string, ok: boolean, extra = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${extra}`}`);
};

const tutib = async (fn: () => Promise<unknown>): Promise<unknown> => {
  try {
    await fn();
    return null;
  } catch (err) {
    return err;
  }
};

// ── 1. Kesh chetlab o'tiladi ──────────────────────────────────────────
// 30 daqiqalik kesh bu yo'lda ishlamasligi kerak: ketma-ket ikkinchi
// xabar ham CRM'dagi eng so'nggi raqam bilan ketadi.
{
  const { runner, calls } = build();
  await runner.buildContext('cl1');

  check(
    "yangilash keshsiz so'raldi",
    calls.syncArgs.length === 1 && calls.syncArgs[0]?.maxAge === 0,
    JSON.stringify(calls.syncArgs),
  );
}

// ── 2. "Сотилди" yangilanmasa — suhbat to'xtaydi ──────────────────────
{
  const { runner } = build({ sync: () => 'error' });
  const err = await tutib(() => runner.buildContext('cl1'));

  check('CRM xatosi tashlandi', err instanceof CrmUnavailableError, String(err));
  check(
    'xatoda shartnoma raqami bor',
    err instanceof CrmUnavailableError && err.contractNo === '7317MSO26NF',
    String(err),
  );
}

// ── 2b. So'rovning o'zi yiqilsa ham xuddi shunday ─────────────────────
// Tarmoq uzilganda `syncIfStale` natija emas, xato qaytaradi — ikkala
// yo'l ham bir xil xulosaga kelishi kerak.
{
  const { runner } = build({ sync: () => 'tashlash' });
  const err = await tutib(() => runner.buildContext('cl1'));

  check("tarmoq uzilishi ham to'xtatadi", err instanceof CrmUnavailableError, String(err));
}

// ── 3. Yozilmaydigan shartnomaning xatosi to'xtatmaydi ────────────────
// "К возврату" shartnoma mijozga aytiladigan summaga umuman kirmaydi
// (`faqatYoziladiganlar` uni chiqarib tashlaydi), ya'ni uning eskiligi
// raqamga ta'sir qilmaydi. To'siq qilsak, mijoz aloqasi yo'q shartnoma
// tufayli javobsiz qolardi.
{
  const { runner } = build({
    shartnomalar: [
      shartnoma(),
      shartnoma({ id: 'c2', contractNo: '6816MSO26HE', virtualStatus: 'for_return' }),
    ],
    sync: (id) => (id === 'c2' ? 'error' : 'ok'),
  });
  const natija = await tutib(() => runner.buildContext('cl1'));

  check('yozilmaydigan shartnoma xatosi yutildi', natija === null, String(natija));
}

// 2026-10-13 dan "Проц. отказ" ham yoziladi — demak uning summasi mijozga
// aytiladi va CRM'dan yangilanmagan bo'lsa agent raqam aytmasligi kerak.
{
  const { runner } = build({
    shartnomalar: [
      shartnoma(),
      shartnoma({ id: 'c2', contractNo: '6816MSO26HE', virtualStatus: 'cancellation_process' }),
    ],
    sync: (id) => (id === 'c2' ? 'error' : 'ok'),
  });
  const err = await tutib(() => runner.buildContext('cl1'));

  check('"Проц. отказ" shartnoma xatosi endi to\'xtatadi', err instanceof CrmUnavailableError, String(err));
}

// ── 4. Farq chiqqanda ichki qayd yoziladi ─────────────────────────────
// Boyirov holati: CRM 4 811 000, va'da qoldig'i 4 311 000.
{
  const { runner, calls } = build();
  await runner.promiseReminder('cv1', vada(4_811_000, 500_000));

  const qayd = calls.qaydlar.find((m) => m.direction === 'note');
  // `toLocaleString` razryadlarni UZILMAYDIGAN probel bilan ajratadi —
  // oddiy probelga keltirmasak, qidiruv hech qachon topmasdi.
  const matn = (qayd?.body ?? '').replace(/\u00A0/g, ' ');

  check('qayd yozildi', Boolean(qayd), JSON.stringify(calls.qaydlar));
  check(
    'qaydda ikkala raqam ham bor',
    matn.includes('4 811 000') && matn.includes('4 311 000'),
    matn,
  );
  check('qaydda shartnoma raqami bor', matn.includes('7317MSO26NF'), matn);
  check('qayd mijozga ketmadi', calls.yuborilganlar.length === 0, calls.yuborilganlar.join(' | '));
}

// ── 5. Farq bo'lmasa — qayd yo'q ──────────────────────────────────────
// Har rahmat va eslatmada qayd yozilsa, operator chati foydasiz
// qatorlardan iborat bo'lib qolardi va haqiqiy farq ko'zga tashlanmasdi.
{
  const { runner, calls } = build({ shartnomalar: [shartnoma({ debtMonthly: 4_311_000 })] });
  await runner.promiseReminder('cv1', vada(4_811_000, 500_000));

  check(
    'farq yo\'q — qayd yozilmadi',
    calls.qaydlar.every((m) => m.direction !== 'note'),
    JSON.stringify(calls.qaydlar),
  );
}

// ── Talabnoma konteksti ───────────────────────────────────────────────
// Yuborilgan talabnoma agentga raqam va tayyor sanalar bilan boradi;
// raqami yoki sanasi chala yozuv tashlab ketiladi.
{
  const tayyor = {
    id: 't1', contractId: 'c1', clientId: 'cl1', raqam: 1, holat: 'yuborildi', summa: 18_900_000,
    kuchgaKirish: '2026-09-21', muddatSanasi: '2026-09-28',
    // 23:30 UTC = Toshkentda ertasi kun — sana Toshkent bo'yicha olinishi kerak.
    sentAt: new Date('2026-09-15T23:30:00Z'), contractNo: '7317MSO26NF',
  };
  const { runner } = build({ talabnomalar: [tayyor, { ...tayyor, id: 't2', raqam: null }] });
  const { context } = await runner.buildContext('cl1');
  check(
    'talabnoma kontekstga tushdi',
    JSON.stringify(context.talabnomalar) === JSON.stringify([{
      raqam: 'ET-01', yuborilganIso: '2026-09-16', summa: 18_900_000,
      kuchgaKirishIso: '2026-09-21', muddatIso: '2026-09-28', contractNo: '7317MSO26NF',
    }]),
    JSON.stringify(context.talabnomalar),
  );
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
