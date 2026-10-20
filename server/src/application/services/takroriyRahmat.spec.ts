import { PromiseWatcher } from '@/application/services/PromiseWatcher';
import type { AgentRunner } from '@/application/services/AgentRunner';
import type { ContractSyncService } from '@/application/services/ContractSyncService';
import type { OutreachSettings, RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { Conversation } from '@/domain/entities/Conversation';
import type { PaymentPromise, PromiseStatus } from '@/domain/entities/PaymentPromise';
import type { IContractPaymentRepository } from '@/domain/repositories/IContractPaymentRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IPaymentPromiseRepository } from '@/domain/repositories/IPaymentPromiseRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IClock, IEventBus } from '@/domain/services/support';
import type { AccountLabels } from '@/application/services/AccountLabels';
import type { IHolidayRepository } from '@/domain/repositories/IHolidayRepository';
import type { IPaymentCheckRepository } from '@/domain/repositories/IPaymentCheckRepository';

/**
 * Qo'lda: npm run test:takroriy-rahmat --workspace=server
 *
 * REAL HODISA (18-avgust, produksiya): Abduraxmonov aka 09:14 da ketma-ket
 * ikkita xabar oldi — ikkalasi ham "yana 1 000 000 so'm tushibdi, rahmat",
 * lekin "jami" summasi ikki xil. Sabab: shartnoma bo'yicha ikkita ochiq
 * va'da qolgan va har biri o'sha bitta to'lovni o'zinikiga qo'shib
 * sanagan. Djurayev va Xoliqovada ham xuddi shunday bo'ldi.
 *
 * Kuzatuvchi endi suhbatning ochiq va'dalarini birga ko'radi: bir
 * shartnoma bo'yicha eng oxirgi kelishuv yashaydi, oldingilari jimgina
 * yopiladi (mijozga bu haqda hech narsa yozilmaydi).
 *
 * Tarmoqqa ham, bazaga ham chiqilmaydi.
 */

const settings = {
  windowStart: '09:00',
  windowEnd: '19:00',
  promiseThanksUntil: '18:00',
  weekdays: [1, 2, 3, 4, 5, 6],
  killSwitch: false,
  promiseReminder: false,
  promiseReminderUntil: '12:00',
  // Chegara 0 — bu testlar chegarani emas, va'da oqimini tekshiradi.
  minDebt: 0,
} as OutreachSettings;

const vada = (
  id: string,
  contractId: string | null,
  kun: string,
  thankedAmount = 0,
): PaymentPromise =>
  ({
    id,
    clientId: 'cl1',
    contractId,
    conversationId: 'cv1',
    amount: 8_650_000,
    thankedAmount,
    paidAmount: thankedAmount,
    status: 'partial',
    promisedDate: new Date('2026-08-14T00:00:00+05:00'),
    watchUntil: new Date('2026-08-24T00:00:00+05:00'),
    createdAt: new Date(`2026-08-${kun}T10:00:00+05:00`),
    checkedAt: null,
    remindedAt: null,
  }) as unknown as PaymentPromise;

const conversation = {
  id: 'cv1',
  agentEnabled: true,
  needsHuman: false,
  state: 'negotiating',
} as unknown as Conversation;

const build = (ochiq: PaymentPromise[], paket: PaymentPromise[] = ochiq) => {
  const calls = {
    rahmatOlganlar: [] as string[],
    yopilganlar: [] as Array<{ id: string; status: PromiseStatus }>,
    belgilanganlar: [] as Array<{ id: string; thanked: number }>,
  };

  const watcher = new PromiseWatcher(
    {
      findWatched: async () => paket,
      listOpenByConversation: async () => ochiq,
      findDueToday: async () => [],
      recordCheck: async () => undefined,
      markThanked: async (id: string, thanked: number) => {
        calls.belgilanganlar.push({ id, thanked });
      },
      updateStatus: async (id: string, status: PromiseStatus) => {
        calls.yopilganlar.push({ id, status });
        return vada(id, 'c1', '12');
      },
    } as unknown as IPaymentPromiseRepository,
    {
      findById: async () => conversation,
      update: async () => undefined,
    } as unknown as IConversationRepository,
    {
      paymentThanks: async (_cv: string, p: PaymentPromise) => {
        calls.rahmatOlganlar.push(p.id);
        return { sent: true };
      },
    } as unknown as AgentRunner,
    { get: async () => settings } as unknown as RuntimeSettings,
    { record: async () => undefined } as unknown as IAuditRepository,
    { publish: () => undefined } as unknown as IEventBus,
    {
      now: () => new Date('2026-08-18T10:00:00+05:00'),
      todayIso: () => '2026-08-18',
    } as IClock,
    {
      findById: async () => ({ debtFirst: 0, debtMonthly: 5_000_000 }),
      // "Kechikkan to'lovingiz yo'q" qarori MIJOZNING barcha shartnomasi
      // bo'yicha chiqadi (`kechikishYopildi`) — stub ham shuni beradi.
      findByClientId: async () => [
        { id: 's1', virtualStatus: 'sold', debtFirst: 0, debtMonthly: 5_000_000, daysOverdue: 20 },
      ],
    } as unknown as IContractRepository,
    {
      listPaidSince: async () => [
        {
          datePaidIso: '2026-08-16',
          amount: 1_000_000,
          discoveredAt: new Date('2026-08-18T04:02:00Z'),
        },
      ],
    } as unknown as IContractPaymentRepository,
    { syncIfStale: async () => null } as unknown as ContractSyncService,
    { labelOf: () => null } as unknown as AccountLabels,
    { list: async () => [] } as unknown as IHolidayRepository,
    { findOperatorConfirmedSince: async () => null, markThanksSent: async () => undefined } as unknown as IPaymentCheckRepository,
    { sukutdami: async () => false },
  );

  return { watcher, calls };
};

let failed = 0;
const check = (name: string, ok: boolean, extra = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${extra}`}`);
};

// ── 1. Bir shartnoma, ikkita ochiq va'da — bitta rahmat ────────────────
{
  const { watcher, calls } = build([vada('eski', 'c1', '12'), vada('yangi', 'c1', '14')]);
  await watcher.verify();

  check(
    'rahmat bir marta aytildi',
    calls.rahmatOlganlar.length === 1,
    calls.rahmatOlganlar.join(','),
  );
  check(
    "rahmat oxirgi kelishuv bo'yicha aytildi",
    calls.rahmatOlganlar[0] === 'yangi',
    calls.rahmatOlganlar.join(','),
  );
  check(
    "eski va'da yopildi",
    calls.yopilganlar.some((y) => y.id === 'eski' && y.status === 'cancelled'),
    JSON.stringify(calls.yopilganlar),
  );
  check(
    "yangi va'da yopilmadi",
    !calls.yopilganlar.some((y) => y.id === 'yangi'),
    JSON.stringify(calls.yopilganlar),
  );
}

// ── 2. Turli shartnomalar — ikkalasi ham o'z rahmatini oladi ───────────
// Har shartnoma alohida kelishuv; bu yerda takror yo'q va biror va'dani
// yopish mijozning ikkinchi shartnomasini kuzatuvsiz qoldirardi.
{
  const { watcher, calls } = build([vada('c1-vada', 'c1', '12'), vada('c2-vada', 'c2', '14')]);
  await watcher.verify();

  check(
    "ikkala shartnoma bo'yicha ham rahmat aytildi",
    calls.rahmatOlganlar.length === 2,
    calls.rahmatOlganlar.join(','),
  );
  check(
    "hech qaysi va'da yopilmadi",
    calls.yopilganlar.length === 0,
    JSON.stringify(calls.yopilganlar),
  );
}

// ── 3. Eskirgan va'da rahmat aytib ulgurgan pul — qayta aytilmaydi ─────
// Parpiboyeva opaning holati: eski va'da bugun 4 320 000 uchun rahmat
// aytgan (thanked 8 640 000), omon qoladigan va'da esa 17-avgustda
// ochilgani uchun o'sha pulni "yangi" deb ko'radi. Eskisini shunchaki
// yopib qo'ysak, mijoz ertaga aynan o'sha pul uchun ikkinchi rahmat
// olardi — takror bir kunga surilardi, xolos.
{
  const { watcher, calls } = build([
    vada('eski', 'c1', '14', 8_640_000),
    vada('yangi', 'c1', '17', 0),
  ]);
  await watcher.verify();

  check('qayta rahmat aytilmadi', calls.rahmatOlganlar.length === 0, calls.rahmatOlganlar.join(','));
  check(
    "aytilgan summa omon qolgan va'daga ko'chdi",
    calls.belgilanganlar.some((b) => b.id === 'yangi' && b.thanked === 1_000_000),
    JSON.stringify(calls.belgilanganlar),
  );
}

// ── 4. Eskirgan va'da hech narsa aytmagan bo'lsa — rahmat ketadi ───────
// Ko'chirish faqat HAQIQATAN aytilgan summagacha bo'ladi, aks holda
// e'tirof qilinmagan pul jimgina yo'qolardi.
{
  const { watcher, calls } = build([
    vada('eski', 'c1', '14', 0),
    vada('yangi', 'c1', '17', 0),
  ]);
  await watcher.verify();

  check('rahmat aytildi', calls.rahmatOlganlar.length === 1, calls.rahmatOlganlar.join(','));
}

// ── 5. Juftlik bitta tsiklga tushmasa ham ─────────────────────────────
// Xoliqova Kamola opaning holati: uning ikkita ochiq va'dasi bitta
// shartnoma bo'yicha edi, lekin kuzatuv paketiga birga tushmadi va
// rahmat ikki xil tsiklda ketdi — 09:16 va 09:44 da. Shuning uchun
// suhbatning ochiq va'dalari paketdan QAT'I NAZAR so'raladi.
{
  const eski = vada('eski', 'c1', '05');
  const yangi = vada('yangi', 'c1', '15');
  // Paketga faqat eskisi tushdi; yangisi bu tsiklda ko'rinmadi.
  const { watcher, calls } = build([eski, yangi], [eski]);
  await watcher.verify();

  check('rahmat bir marta aytildi', calls.rahmatOlganlar.length === 1, calls.rahmatOlganlar.join(','));
  check(
    "paketda bo'lmasa ham oxirgi kelishuv tanlandi",
    calls.rahmatOlganlar[0] === 'yangi',
    calls.rahmatOlganlar.join(','),
  );
  check(
    "eski va'da yopildi",
    calls.yopilganlar.some((y) => y.id === 'eski' && y.status === 'cancelled'),
    JSON.stringify(calls.yopilganlar),
  );
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
