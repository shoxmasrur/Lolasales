import { BulkStartPlanner } from '@/application/services/BulkStartPlanner';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { TelegramAccount } from '@/domain/entities/TelegramAccount';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { IClock } from '@/domain/services/support';

/**
 * Qo'lda ishga tushiriladi: npm run test:bulk-start-planner --workspace=server
 *
 * Bazaga chiqmaydi — hamma port soxta. Bu xizmat oynadagi son bilan
 * haqiqiy ishni bog'laydi, shuning uchun uning tanlovi (kimni chetlab
 * o'tish, kimni qayta biriktirish) alohida tekshiriladi.
 */

const TODAY = '2026-08-07';
const NOW = new Date('2026-08-07T10:00:00Z');

const account = (over: Partial<TelegramAccount> & { id: string }): TelegramAccount => ({
  label: 'Akkaunt', phone: '+998900000000', apiId: 1, apiHash: '', session: null,
  personaName: null, status: 'connected', statusMessage: null, tgUserId: null, tgUsername: null,
  dailyLimit: 40, sentToday: 0, lookupLimit: 50, lookupsToday: 0, counterDate: TODAY, floodWaitUntil: null, floodWaitSince: null, peerFloodSince: null,
  spamStatus: 'clean', spamCheckedAt: null, spamMessage: null, spamUntil: null,
  proxy: null,
  isEnabled: true, styleVersion: 'v1', llmModelId: null, createdAt: NOW, updatedAt: NOW,
  ...over,
});

function build(opts: {
  accounts: TelegramAccount[];
  reassignable: string[];
  loads?: Array<{ accountId: string; count: number }>;
  personaName?: string;
}): BulkStartPlanner {
  const clients = {
    findReassignableForBulkStart: async (ids: string[]) =>
      ids.filter((id) => opts.reassignable.includes(id)),
    countByAccount: async () => opts.loads ?? [],
  } as unknown as IClientRepository;

  const accounts = {
    list: async () => opts.accounts,
  } as unknown as ITelegramAccountRepository;

  const settings = {
    get: async () => ({ personaName: opts.personaName ?? 'Madina' }),
  } as unknown as RuntimeSettings;

  const clock = { now: () => NOW, todayIso: () => TODAY } as unknown as IClock;

  return new BulkStartPlanner(clients, accounts, settings, clock);
}

let failed = 0;
function check(holat: string, ok: boolean, izoh = ''): void {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${holat}${ok ? '' : `  ${izoh}`}`);
}

// 1. Chiquvchi xabari borlar taqsimotga kirmaydi.
{
  const planner = build({
    accounts: [account({ id: 'a' })],
    reassignable: ['c1', 'c3'],
  });
  const plan = await planner.plan(['c1', 'c2', 'c3'], ['a']);
  check('chiquvchi xabari bor mijoz chetlab o\'tildi',
    plan.assignments.size === 2 && !plan.assignments.has('c2'),
    `${[...plan.assignments.keys()].join(',')}`);
  check('reassigned soni to\'g\'ri', plan.reassigned === 2, `${plan.reassigned}`);
  // Chaqiruvchi shu ro'yxat orqali "taqsimotga tushmadi" ni ikkiga
  // ajratadi: baza so'rovidan chiqib ketgan (c2) va operator qo'lda
  // chegaralagani uchun tushmagan. Ikkinchisiga xabar KETMASLIGI kerak,
  // birinchisi esa o'z aniq sababini olishi kerak.
  check('bog\'lanish mumkin bo\'lganlar ro\'yxati qaytdi',
    plan.reassignable.has('c1') && plan.reassignable.has('c3') && !plan.reassignable.has('c2'),
    `${[...plan.reassignable].join(',')}`);
}

// 2. Tanlanmagan akkaunt rejaga kirmaydi.
{
  const planner = build({
    accounts: [account({ id: 'a' }), account({ id: 'b' })],
    reassignable: ['c1', 'c2'],
  });
  const plan = await planner.plan(['c1', 'c2'], ['a']);
  check('faqat tanlangan akkaunt ishlatildi',
    [...plan.assignments.values()].every((v) => v === 'a'));
  check('accountPlan faqat tanlanganni o\'z ichiga oladi',
    plan.accountPlan.length === 1 && plan.accountPlan[0]!.accountId === 'a');
}

// 3. `canAcceptClients` shartini buzgan akkaunt chetlab o'tiladi.
{
  const planner = build({
    accounts: [account({ id: 'a' }), account({ id: 'bad', isEnabled: false })],
    reassignable: ['c1', 'c2'],
  });
  const plan = await planner.plan(['c1', 'c2'], ['a', 'bad']);
  check('o\'chirilgan akkaunt rejaga kirmadi',
    plan.accountPlan.length === 1 && plan.accountPlan[0]!.accountId === 'a');
}

// 4. Ism: akkauntniki ustun, bo'lmasa umumiy.
{
  const planner = build({
    accounts: [account({ id: 'a', personaName: 'Shoxsanam' }), account({ id: 'b' })],
    reassignable: ['c1', 'c2'],
    personaName: 'Madina',
  });
  const plan = await planner.plan(['c1', 'c2'], ['a', 'b']);
  const byId = new Map(plan.accountPlan.map((p) => [p.accountId, p.personaName]));
  check('akkaunt ismi ustun', byId.get('a') === 'Shoxsanam', `${byId.get('a')}`);
  check('ism yo\'q bo\'lsa umumiy', byId.get('b') === 'Madina', `${byId.get('b')}`);
}

// 5. Kvota: sig'maydigani sanaladi, hammasi baribir biriktiriladi.
{
  const planner = build({
    accounts: [account({ id: 'a', dailyLimit: 2, sentToday: 0 })],
    reassignable: ['c1', 'c2', 'c3', 'c4'],
  });
  const plan = await planner.plan(['c1', 'c2', 'c3', 'c4'], ['a']);
  check('kvota: hammasi biriktirildi', plan.assignments.size === 4, `${plan.assignments.size}`);
  check('kvota: overQuota=2', plan.accountPlan[0]!.overQuota === 2, `${plan.accountPlan[0]!.overQuota}`);
  check('kvota: remainingToday=2', plan.accountPlan[0]!.remainingToday === 2, `${plan.accountPlan[0]!.remainingToday}`);
}

// 6. Akkaunt tanlanmagan — bo'sh reja, xato yo'q.
{
  const planner = build({ accounts: [account({ id: 'a' })], reassignable: ['c1'] });
  const plan = await planner.plan(['c1'], []);
  check('akkauntsiz: bo\'sh reja',
    plan.assignments.size === 0 && plan.accountPlan.length === 0 && plan.reassigned === 0);
  // Reja umuman tuzilmagan bo'lsa chaqiruvchi hech kimni majburan
  // o'tkazib yubormasligi kerak — eski, ketma-ket yo'l o'z holicha qoladi.
  check('akkauntsiz: bog\'lanish ro\'yxati ham bo\'sh', plan.reassignable.size === 0,
    `${plan.reassignable.size}`);
}

// ─── Qidiruv rejimi ('lookup') ───────────────────────────────────────────
// Xabar va qidiruv kvotalari ALOHIDA hisoblanadi: bittasini ikkinchisi
// o'rniga ishlatish mijozlarni ishlamaydigan akkauntga tashlab yuborardi.

// 7. Xabar kvotasi tugagan akkaunt hali qidira oladi.
{
  const planner = build({
    accounts: [account({ id: 'a', dailyLimit: 40, sentToday: 40, lookupLimit: 50, lookupsToday: 0 })],
    reassignable: ['c1', 'c2'],
  });
  const outreach = await planner.plan(['c1', 'c2'], ['a']);
  const lookup = await planner.plan(['c1', 'c2'], ['a'], { maqsad: 'lookup' });

  // Taqsimlagich kvotadan ortiqni TASHLAMAYDI — biriktiradi va ortig'ini
  // `overQuota` da ko'rsatadi. Farq shu yerda ko'rinadi: bir xil akkaunt
  // xabar rejimida kvotadan chiqib ketadi, qidiruv rejimida esa sig'adi.
  check('xabar kvotasi tugagan — hammasi kvotadan ortiqcha',
    outreach.accountPlan[0]?.overQuota === 2, String(outreach.accountPlan[0]?.overQuota));
  check('o\'sha akkaunt qidiruvda kvotaga sig\'adi',
    lookup.assignments.size === 2 && lookup.accountPlan[0]?.overQuota === 0,
    String(lookup.accountPlan[0]?.overQuota));
  check('qidiruvda qolgan kvota qidiruv hisoblagichidan',
    lookup.accountPlan[0]?.remainingToday === 50, String(lookup.accountPlan[0]?.remainingToday));
}

// 8. Qidiruv kvotasi tugagan akkaunt tanlanmaydi.
{
  const planner = build({
    accounts: [account({ id: 'a', lookupLimit: 50, lookupsToday: 50 })],
    reassignable: ['c1'],
  });
  const plan = await planner.plan(['c1'], ['a'], { maqsad: 'lookup' });
  check('qidiruv kvotasi tugagan — bo\'sh reja', plan.accountPlan.length === 0);
}

// 9. Ulanmagan akkaunt qidira olmaydi (xabar rejimidan farqi shu).
{
  const planner = build({
    accounts: [account({ id: 'a', status: 'error' })],
    reassignable: ['c1'],
  });
  check('ulanmagan akkaunt qidiruvga olinmaydi',
    (await planner.plan(['c1'], ['a'], { maqsad: 'lookup' })).accountPlan.length === 0);
  check('lekin xabar rejimida biriktirish uchun yaroqli',
    (await planner.plan(['c1'], ['a'])).assignments.size === 1);
}

// 10. Kvotadan ortiq mijoz — sig'gani taqsimlanadi, qolgani ko'rinadi.
{
  const planner = build({
    accounts: [
      account({ id: 'a', lookupLimit: 2, lookupsToday: 0 }),
      account({ id: 'b', lookupLimit: 1, lookupsToday: 0 }),
    ],
    reassignable: ['c1', 'c2', 'c3', 'c4', 'c5'],
  });
  const plan = await planner.plan(['c1', 'c2', 'c3', 'c4', 'c5'], ['a', 'b'], { maqsad: 'lookup' });
  const jami = plan.accountPlan.reduce((sum, p) => sum + p.count, 0);
  const ortiqcha = plan.accountPlan.reduce((sum, p) => sum + p.overQuota, 0);
  // Hammasi biriktiriladi (hech kim yo'qolmaydi), lekin kvotaga sig'magani
  // alohida sanaladi — interfeys aynan shu raqamni ko'rsatadi.
  check('hammasi biriktirildi', jami === 5, String(jami));
  check('kvotadan ortig\'i sanaldi', ortiqcha === 2, String(ortiqcha));
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
