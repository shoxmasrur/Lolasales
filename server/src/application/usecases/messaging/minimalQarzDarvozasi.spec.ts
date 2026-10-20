import { StartConversationUseCase } from '@/application/usecases/messaging/StartConversationUseCase';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IEventBus } from '@/domain/services/support';
import type { ITelegramGateway } from '@/domain/services/ITelegramGateway';
import type { AgentRunner } from '@/application/services/AgentRunner';
import type { ClientTelegramResolver } from '@/application/services/ClientTelegramResolver';
import type { ContractSyncService } from '@/application/services/ContractSyncService';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import { formatSom } from '@/shared/money';

/**
 * Qo'lda ishga tushiriladi: npm run test:minimal-qarz-darvozasi --workspace=server
 *
 * Bazaga, Telegramga va modelga chiqmaydi — hamma port soxta.
 *
 * Nima qo'riqlanadi: chegaradan kichik kechikishda mijozga xabar
 * KETMASLIGI, va tekshiruv Telegram qidiruvidan OLDIN bo'lishi. Ikkinchisi
 * muhim: qidiruv haqiqiy MTProto so'rovi va uni behuda sarflash akkauntni
 * spam filtriga yaqinlashtiradi.
 */
let failed = 0;
const check = (nom: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${nom}${ok || !izoh ? '' : `  ${izoh}`}`);
};

/**
 * Bitta shartnomaning kechikkan qismi. `debtFirst` va `debtMonthly` alohida
 * beriladi — "qaror MIJOZ bo'yicha, IKKALA ustun ham qo'shiladi" degan
 * qoidani per-shartnoma yoki bitta ustunga qaytarib qo'yadigan regressiyani
 * ushlab qolish uchun (pastdagi ko'p-shartnomali holat shu sababli qo'shildi).
 */
interface KontraktUlushi {
  readonly debtFirst?: number;
  readonly debtMonthly?: number;
}

function build(kontraktlar: readonly KontraktUlushi[], minDebt: number): {
  useCase: StartConversationUseCase;
  qidirildi: () => boolean;
  agentChaqirildi: () => boolean;
} {
  let qidirildi = false;
  let agentChaqirildi = false;

  const clients = {
    findById: async (id: string) => ({
      id,
      fullName: 'Aziz Azizov',
      firstName: 'Aziz',
      phone: '+998901112233',
      extraPhones: [],
      telegramUserId: null,
      telegramStatus: 'unknown',
      doNotContact: false,
    }),
  } as unknown as IClientRepository;

  const contracts = {
    findByClientId: async () =>
      kontraktlar.map((k, i) => {
        const debtFirst = k.debtFirst ?? 0;
        const debtMonthly = k.debtMonthly ?? 0;
        return {
          id: `ct${i + 1}`,
          virtualStatus: 'sold',
          debtFirst,
          debtMonthly,
          daysOverdue: debtFirst + debtMonthly > 0 ? 30 : 0,
        };
      }),
    findPrimaryForClient: async () => null,
  } as unknown as IContractRepository;

  const conversations = {
    findByClientId: async () => null,
  } as unknown as IConversationRepository;

  const resolver = {
    resolve: async () => {
      qidirildi = true;
      // Darvozadan o'tganini bilish uchun yetarli — undan keyingi yo'lni
      // shu yerda uzamiz, ya'ni model va Telegram umuman chaqirilmaydi.
      return { kind: 'no_phone' as const };
    },
  } as unknown as ClientTelegramResolver;

  const agent = {
    firstContact: async () => {
      agentChaqirildi = true;
      return { sent: true, reply: 'salom' };
    },
  } as unknown as AgentRunner;

  const useCase = new StartConversationUseCase(
    clients,
    contracts,
    conversations,
    resolver,
    agent,
    { record: async () => undefined } as unknown as IAuditRepository,
    { publish: () => undefined } as unknown as IEventBus,
    {
      syncOne: async () => ({ outcome: 'disabled' as const }),
      lastSyncedAt: async () => new Date(),
    } as unknown as ContractSyncService,
    { saveContact: async () => undefined } as unknown as ITelegramGateway,
    { get: async () => ({ minDebt }) } as unknown as RuntimeSettings,
    { hasPossiblyDeliveredOutbound: async () => false } as unknown as IMessageRepository,
    { sukutdami: async () => false },
    { todayIso: () => '2026-10-19' },
  );

  return { useCase, qidirildi: () => qidirildi, agentChaqirildi: () => agentChaqirildi };
}

// ─── Chegaradan kichik — umuman tegilmaydi ─────────────────────────────
{
  const t = build([{ debtMonthly: 800 }], 100_000);
  const natija = await t.useCase.execute('c1');
  check('800 so\'m, chegara 100 000 — o\'tkazib yuboriladi', natija.status === 'skipped');
  check(
    'sabab summalarni ko\'rsatadi',
    natija.status === 'skipped' &&
      natija.reason.includes(formatSom(800)) &&
      natija.reason.includes(formatSom(100_000)),
    natija.status === 'skipped' ? natija.reason : '',
  );
  // DIQQAT: solishtirish `formatSom` orqali. `Intl.NumberFormat('ru-RU')`
  // razryadlarni UZILMAYDIGAN probel (U+00A0) bilan ajratadi, ya'ni
  // qo'lda yozilgan '100 000' (oddiy probel) hech qachon mos kelmaydi.
  check('Telegramda QIDIRILMAYDI', !t.qidirildi());
  check('agent CHAQIRILMAYDI', !t.agentChaqirildi());
}

// ─── Aynan chegaraga teng ──────────────────────────────────────────────
{
  const t = build([{ debtMonthly: 100_000 }], 100_000);
  const natija = await t.useCase.execute('c1');
  check('aynan chegaraga teng — o\'tkazib yuboriladi', natija.status === 'skipped');
  check('teng bo\'lganda ham qidirilmaydi', !t.qidirildi());
}

// ─── Chegaradan katta — darvozadan o'tadi ──────────────────────────────
{
  const t = build([{ debtMonthly: 150_000 }], 100_000);
  await t.useCase.execute('c1');
  check('150 000 so\'m — darvozadan o\'tadi va qidiruvga boradi', t.qidirildi());
}

// ─── Qaror MIJOZ bo'yicha: ikkita shartnoma, ikkalasi ham chegaradan ────
// kichik, lekin YIG'INDI oshadi ──────────────────────────────────────────
//
// Bu holat per-shartnoma tekshiruviga (yoki `debtFirst`ni tashlab
// qo'yishga) qaytarib qo'yadigan regressiyani ushlaydi: 60 000+60 000 dan
// birortasi yolg'iz 100 000 dan oshmaydi, lekin ikkalasi (va ularning
// ichidagi `debtFirst` ulushi ham) qo'shilganda 120 000 chiqadi.
{
  const t = build(
    [
      { debtFirst: 40_000, debtMonthly: 20_000 },
      { debtFirst: 30_000, debtMonthly: 30_000 },
    ],
    100_000,
  );
  await t.useCase.execute('c1');
  check(
    'ikki shartnoma (60 000 + 60 000 = 120 000) — darvozadan o\'tadi',
    t.qidirildi(),
  );
}

// ─── Chegara 0 — eski xatti-harakat ────────────────────────────────────
{
  const t = build([{ debtMonthly: 800 }], 0);
  await t.useCase.execute('c1');
  check('chegara 0 — 800 so\'m ham darvozadan o\'tadi', t.qidirildi());
}
{
  const t = build([{ debtMonthly: 0 }], 0);
  const natija = await t.useCase.execute('c1');
  check('chegara 0, kechikish 0 — o\'tkazib yuboriladi', natija.status === 'skipped');
  check(
    'chegara 0 da sabab eski matnda qoladi',
    natija.status === 'skipped' && natija.reason === 'Kechikkan to\'lov yo\'q',
    natija.status === 'skipped' ? natija.reason : '',
  );
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
