import { AgentRunner } from '@/application/services/AgentRunner';
import type { AgentEngineFactory } from '@/application/services/AgentEngineFactory';
import type { AgentTurnInput, AgentTurnOutput, IAgentEngine } from '@/domain/services/IAgentEngine';
import type { Conversation } from '@/domain/entities/Conversation';
import type { PaymentPromise, PromiseStatus } from '@/domain/entities/PaymentPromise';
import { ochiqVadami } from '@/domain/entities/PaymentPromise';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { IPaymentPromiseRepository } from '@/domain/repositories/IPaymentPromiseRepository';
import type { IPaymentCheckRepository } from '@/domain/repositories/IPaymentCheckRepository';
import type { IAgentUsageRepository } from '@/domain/repositories/IAgentUsageRepository';
import type { IContractPaymentRepository } from '@/domain/repositories/IContractPaymentRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type {
  IClientProfileRepository,
  ILessonRepository,
} from '@/domain/repositories/IAgentKnowledgeRepository';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { IHolidayRepository } from '@/domain/repositories/IHolidayRepository';
import type { PromptComposer } from '@/application/services/PromptComposer';
import type { MessageDispatcher } from '@/application/services/MessageDispatcher';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { ContractSyncService } from '@/application/services/ContractSyncService';
import type { AccountLabels } from '@/application/services/AccountLabels';
import type { IClock, IEventBus } from '@/domain/services/support';

/**
 * Qo'lda ishga tushiriladi: npm run test:ochiq-vada --workspace=server
 *
 * Telegramga ham, bazaga ham chiqmaydi.
 *
 * NEGA KERAK — produksiyadagi haqiqiy holat (17-avgust, 6546MSO26AU):
 * bitta suhbatda IKKITA ochiq va'da yashab qoldi va har kelgan to'lovda
 * mijoz ikkita rahmat xabari oldi, ikkalasida ikki xil "jami to'landi"
 * va "qolgan" summasi bilan. Mijoz "Сиз адашиб кетдиз" deb yozdi.
 *
 * Sabab bitta so'zda edi: "ochiq va'da" tushunchasi ikki joyda ikki xil
 * yozilgandi. Kuzatuvchi `pending` va `partial` ikkalasini ham kuzatardi,
 * suhbatning FAOL va'dasi esa faqat `pending` deb izlanardi. Qisman
 * to'langan (`partial`) va'da shu tirqishga tushib, agent uning ustiga
 * ikkinchi va'da yozardi — eskisi bekor qilinmasdan.
 *
 * Shu sinov ikkala tomonni ham qo'riqlaydi:
 *   1) ta'rifning o'zi — `partial` ochiq va'da hisoblanadi;
 *   2) xulq — qisman to'langan va'da ustiga yangi kelishuv yozilsa,
 *      eskisi YOPILADI va suhbatda bitta ochiq va'da qoladi.
 *
 * Uchinchi holat — eski, tor ta'rif — ATAYLAB saqlangan: u xatoni qayta
 * ishlab chiqaradi. Kimdir filtrni yana toraytirsa, shu qatorda ko'rinadi.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

const NOW = new Date('2026-08-08T10:00:00Z');
const SUHBAT_ID = 's1';

/** Bazadagi `payment_promises` qatorining sinov uchun yetarli qismi. */
interface Qator {
  id: string;
  amount: number;
  promisedDate: Date;
  status: PromiseStatus;
  createdAt: Date;
}

/**
 * Xotiradagi va'dalar jadvali.
 *
 * `faolShart` — "faol va'da" ta'rifi. U parametr qilib olingan, chunki
 * xatoning butun mohiyati aynan shu shartda edi: sinov uni ikkala
 * ko'rinishda ham yurgizib, farqini ko'rsatadi.
 */
function vadaOmbori(faolShart: (s: PromiseStatus) => boolean): {
  repo: IPaymentPromiseRepository;
  qatorlar: Qator[];
} {
  const qatorlar: Qator[] = [];
  let raqam = 0;

  const repo = {
    findActiveByConversation: async (): Promise<PaymentPromise | null> => {
      // Bazadagi so'rov bilan bir xil tartib: eng oxirgisi birinchi.
      const topilgan = [...qatorlar].reverse().find((q) => faolShart(q.status));
      return (topilgan ?? null) as unknown as PaymentPromise | null;
    },
    create: async (data: { amount: number; promisedDate: Date }): Promise<PaymentPromise> => {
      raqam += 1;
      const qator: Qator = {
        id: `v${raqam}`,
        amount: data.amount,
        promisedDate: data.promisedDate,
        status: 'pending',
        createdAt: NOW,
      };
      qatorlar.push(qator);
      return qator as unknown as PaymentPromise;
    },
    updateStatus: async (id: string, status: PromiseStatus): Promise<void> => {
      const qator = qatorlar.find((q) => q.id === id);
      if (qator) qator.status = status;
    },
  } as unknown as IPaymentPromiseRepository;

  return { repo, qatorlar };
}

/** Kuzatuvchi (`findWatched`) shu suhbatda nechta va'dani ko'radi. */
const kuzatiladiganlar = (qatorlar: Qator[]): Qator[] => qatorlar.filter((q) => ochiqVadami(q.status));

const SUHBAT = {
  id: SUHBAT_ID,
  clientId: 'm1',
  telegramAccountId: null,
  state: 'negotiating',
  stage: 'soft',
  agentEnabled: true,
  needsHuman: false,
  humanReason: null,
  humanKind: null,
  agentSessionId: null,
} as unknown as Conversation;

const JAVOB = (amount: number, sana: string): AgentTurnOutput =>
  ({
    reply: `Qolgan ${amount} so'mni ${sana} ga kutsak bo'ladimi?`,
    replySecond: null,
    sessionId: null,
    promise: { amount, promisedDate: sana, quote: 'Ха шундай' },
    nextState: null,
    escalate: null,
    internalNote: null,
    lesson: null,
    clientMemory: null,
  }) as unknown as AgentTurnOutput;

function build(repo: IPaymentPromiseRepository, javob: () => AgentTurnOutput): AgentRunner {
  const modelTaqlidi = async (_input: Omit<AgentTurnInput, 'incoming'>): Promise<AgentTurnOutput> =>
    javob();

  const engine = {
    respond: modelTaqlidi,
    composeFirstContact: modelTaqlidi,
    composePromiseReminder: modelTaqlidi,
    composePaymentThanks: modelTaqlidi,
  } as unknown as IAgentEngine;

  // Akkaunt biriktirilmagan sinov — `forAccount` va `standart` bir xil
  // sinov dvigatelini qaytaradi (`AgentEngineFactory` yangi qatlami).
  const tanlangan = { engine, provider: 'claude' as const, model: 'sinov', llmModel: null };
  const engines = {
    forAccount: async () => tanlangan,
    standart: () => tanlangan,
  } as unknown as AgentEngineFactory;

  return new AgentRunner(
    engines,
    {
      findById: async () => ({ id: 'm1', fullName: 'Aziz Karimov', firstName: 'Aziz', telegramStatus: null }),
    } as unknown as IClientRepository,
    { findByClientId: async () => [] } as unknown as IContractRepository,
    { findById: async () => SUHBAT, update: async () => undefined } as unknown as IConversationRepository,
    {
      recentByConversation: async () => [],
      create: async () => ({ id: 'x1' }),
    } as unknown as IMessageRepository,
    repo,
    { send: async () => undefined } as unknown as MessageDispatcher,
    { get: async () => ({ agentAutoReply: true, personaName: 'Aziz' }) } as unknown as RuntimeSettings,
    { record: async () => undefined } as unknown as IAuditRepository,
    { publish: () => undefined } as unknown as IEventBus,
    { now: () => NOW, todayIso: () => '2026-08-08' } as unknown as IClock,
    {
      renderSections: async () => '',
      renderLessons: async () => '',
      renderClientMemory: async () => '',
    } as unknown as PromptComposer,
    { recordProposal: async () => undefined } as unknown as ILessonRepository,
    { upsert: async () => undefined } as unknown as IClientProfileRepository,
    {
      findUnpaidMonths: async () => [],
      listRecentPayments: async () => [],
    } as unknown as IContractPaymentRepository,
    { syncIfStale: async () => null } as unknown as ContractSyncService,
    { findById: async () => null } as unknown as ITelegramAccountRepository,
    { labelOf: () => null } as unknown as AccountLabels,
    { findOpenByConversation: async () => null } as unknown as IPaymentCheckRepository,
    { record: async () => undefined } as unknown as IAgentUsageRepository,
    { list: async () => [] } as unknown as IHolidayRepository,
  );
}

/**
 * Produksiyadagi ketma-ketlikni takrorlaydi:
 *   1) mijoz 17 448 968 so'mni 14-avgustga va'da qildi;
 *   2) 7 750 000 so'm keldi — kuzatuvchi rahmat aytdi, va'da `partial`;
 *   3) mijoz qolgan 9 698 968 so'mni ham 14-avgustga tasdiqladi.
 * Uchinchi qadamdan keyin suhbatda NECHTA ochiq va'da qolgani qaytariladi.
 */
async function senariy(faolShart: (s: PromiseStatus) => boolean): Promise<Qator[]> {
  const { repo, qatorlar } = vadaOmbori(faolShart);
  let javob = JAVOB(17_448_968, '2026-08-14');
  const runner = build(repo, () => javob);

  await runner.reply(SUHBAT_ID, 'Ха шундай');

  // Kuzatuvchi qisman to'lovga rahmat aytdi — `markThanked` holatni
  // `partial` ga o'tkazadi. Aynan shu yerdan keyin tirqish ochilardi.
  const birinchi = qatorlar[0];
  if (birinchi) birinchi.status = 'partial';

  javob = JAVOB(9_698_968, '2026-08-14');
  await runner.reply(SUHBAT_ID, 'Ха шундай');

  return kuzatiladiganlar(qatorlar);
}

// ─── 1. Ta'rif: qisman to'langan va'da hamon ochiq ───────────────────────
check('partial — ochiq va\'da', ochiqVadami('partial'));
check('pending — ochiq va\'da', ochiqVadami('pending'));
check('kept — ochiq emas', !ochiqVadami('kept'));
check('cancelled — ochiq emas', !ochiqVadami('cancelled'));
check('broken — ochiq emas', !ochiqVadami('broken'));

// ─── 2. Xulq: partial ustiga yozilgan yangi kelishuv eskisini yopadi ─────
{
  const ochiq = await senariy(ochiqVadami);
  check(
    'partial ustiga yangi va\'da — suhbatda bitta ochiq va\'da qoladi',
    ochiq.length === 1,
    `${ochiq.length} ta: ${JSON.stringify(ochiq.map((q) => [q.amount, q.status]))}`,
  );
  check(
    'qolgan va\'da — oxirgi kelishuv (9 698 968)',
    ochiq[0]?.amount === 9_698_968,
    String(ochiq[0]?.amount),
  );
}

// ─── 3. Nazorat: eski, tor ta'rif xatoni qayta ishlab chiqaradi ──────────
// Bu holat "shunday bo'lsin" degani EMAS — xatoning o'zi shu yerda
// muzlatib qo'yilgan. Ikkita ochiq va'da = mijozga ikkita rahmat xabari,
// ikki xil raqam bilan.
{
  const ochiq = await senariy((s) => s === 'pending');
  check(
    'tor ta\'rif (faqat pending) — ikkita ochiq va\'da qolib ketadi',
    ochiq.length === 2,
    `${ochiq.length} ta`,
  );
}

console.log(failed ? `\n${failed} ta sinov yiqildi` : '\nHammasi o\'tdi');
process.exit(failed ? 1 : 0);
