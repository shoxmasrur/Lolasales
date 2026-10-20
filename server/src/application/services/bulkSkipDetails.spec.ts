import {
  BulkConversationStart,
  SKIP_DETAILS_LIMIT,
  type BulkStartJob,
} from '@/application/services/BulkConversationStart';
import type { StartConversationUseCase } from '@/application/usecases/messaging/StartConversationUseCase';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { BulkStartPlanner } from '@/application/services/BulkStartPlanner';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { AccountLabels } from '@/application/services/AccountLabels';
import type { IClock, IEventBus } from '@/domain/services/support';

/**
 * Qo'lda ishga tushiriladi: npm run test:bulk-skip-details --workspace=server
 *
 * Telegramga ham, bazaga ham chiqmaydi.
 *
 * NEGA KERAK: progressda "9 tasi o'tkazib yuborildi" degan qator
 * ko'rinardi, lekin QAYSI mijozlar ekani hech qayerda yo'q edi. Endi har
 * bir o'tkazib yuborilgan mijoz ismi va sababi bilan yoziladi.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

const NOW = new Date('2026-08-11T10:00:00Z');

/** Tsikl tugaguncha kutamiz — `start()` darhol qaytadi, ish fonda ketadi. */
async function tugashiniKut(bulk: BulkConversationStart): Promise<BulkStartJob> {
  for (let i = 0; i < 200; i += 1) {
    const job = bulk.current();
    if (job && job.status !== 'running') return job;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('ish tugamadi');
}

function build(opts: {
  /** clientId → o'tkazib yuborish sababi (null — muvaffaqiyatli). */
  natija: (id: string) => string | null;
}): BulkConversationStart {
  const startConversation = {
    execute: async (id: string) => {
      const reason = opts.natija(id);
      return reason ? { status: 'skipped', reason } : { status: 'started' };
    },
  } as unknown as StartConversationUseCase;

  const settings = {
    get: async () => ({
      killSwitch: false,
      windowStart: '00:00',
      windowEnd: '23:59',
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      // Pauzasiz — sinov tez tugasin.
      minDelaySec: 0,
      maxDelaySec: 0,
      outreachDailyLimit: 1000,
    }),
  } as unknown as RuntimeSettings;

  const clients = {
    findById: async (id: string) => ({ id, fullName: `Mijoz ${id}`, telegramAccountId: null }),
  } as unknown as IClientRepository;


  return new BulkConversationStart(
    startConversation,
    settings,
    { publish: () => undefined } as unknown as IEventBus,
    { now: () => NOW, todayIso: () => '2026-08-11' } as unknown as IClock,
    {} as unknown as BulkStartPlanner,
    clients,
    {
      // Ulangan akkaunt yo'q → kunlik sig'im nol → `meanDelayMs` null
      // qaytaradi va pauza `minDelaySec`/`maxDelaySec` ga (ya'ni nolga)
      // tushadi. Shu sabab sinov soniyalar emas, millisekundlarda tugaydi.
      listConnected: async () => [],
      list: async () => [],
    } as unknown as ITelegramAccountRepository,
    { labelOf: () => null } as unknown as AccountLabels,
  );
}

// ─── Sabab bilan birga KIM ekani ham yoziladi ────────────────────────────
{
  const bulk = build({
    natija: (id) => (id === 'c2' ? null : 'Telegramda topilmadi'),
  });
  bulk.start(['c1', 'c2', 'c3'], 'j1');
  const job = await tugashiniKut(bulk);

  check('bittasi boshlandi', job.started === 1, String(job.started));
  check('ikkitasi o\'tkazib yuborildi', job.skipped === 2, String(job.skipped));
  check(
    'sabab bo\'yicha son o\'zgarmadi',
    job.skipReasons['Telegramda topilmadi'] === 2,
    JSON.stringify(job.skipReasons),
  );
  check('tafsilotlar yozildi', job.skippedItems.length === 2, String(job.skippedItems.length));
  check('ism bor', job.skippedItems.every((x) => x.fullName.startsWith('Mijoz')));
  check(
    'faqat o\'tkazib yuborilganlar — boshlangani ro\'yxatda yo\'q',
    !job.skippedItems.some((x) => x.clientId === 'c2'),
  );
  check(
    'har biriga o\'z sababi biriktirilgan',
    job.skippedItems.every((x) => x.reason === 'Telegramda topilmadi'),
  );
}

// ─── Turli sabablar aralashmaydi ─────────────────────────────────────────
// Interfeys sabab bo'yicha ochadi, ya'ni har yozuv o'z sababida turishi shart.
{
  const bulk = build({
    natija: (id) => (id === 'c1' ? 'Telegramda topilmadi' : 'Ism mos kelmadi'),
  });
  bulk.start(['c1', 'c2'], 'j2');
  const job = await tugashiniKut(bulk);

  const topilmagan = job.skippedItems.filter((x) => x.reason === 'Telegramda topilmadi');
  const ism = job.skippedItems.filter((x) => x.reason === 'Ism mos kelmadi');
  check('birinchi sabab bitta', topilmagan.length === 1 && topilmagan[0]?.clientId === 'c1');
  check('ikkinchi sabab bitta', ism.length === 1 && ism[0]?.clientId === 'c2');
}

// ─── Ro'yxat cheklangan ──────────────────────────────────────────────────
// Bu ro'yxat har progress yangilanishida veb-soket orqali TO'LIQ uzatiladi,
// shuning uchun u cheksiz o'sishi mumkin emas.
{
  const ids = Array.from({ length: SKIP_DETAILS_LIMIT + 5 }, (_, i) => `c${i}`);
  const bulk = build({ natija: () => 'Sabab' });
  bulk.start(ids, 'j4');
  const job = await tugashiniKut(bulk);

  check('ro\'yxat chegaradan oshmadi', job.skippedItems.length === SKIP_DETAILS_LIMIT,
    String(job.skippedItems.length));
  check('oshgani alohida sanaldi', job.skippedItemsTruncated === 5,
    String(job.skippedItemsTruncated));
  // Umumiy son ro'yxat cheklovidan MUSTAQIL bo'lishi kerak.
  check('umumiy son to\'liq', job.skipped === ids.length, String(job.skipped));
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
