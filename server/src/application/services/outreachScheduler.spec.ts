import { OutreachScheduler } from '@/application/services/OutreachScheduler';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type {
  StartConversationResult,
  StartConversationUseCase,
} from '@/application/usecases/messaging/StartConversationUseCase';
import type { ICampaignRepository } from '@/domain/repositories/ICampaignRepository';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IClock, IEventBus } from '@/domain/services/support';
import { TelegramError } from '@/shared/errors';

/**
 * Qo'lda ishga tushiriladi: npm run test:outreach-scheduler --workspace=server
 * (soxta DATABASE_URL/JWT_SECRET/ENCRYPTION_KEY bilan — `shared/config` ni tortadi).
 *
 * Kampaniya nishoni akkaunt VAQTINCHA band bo'lganda (kunlik kvota, flood)
 * tashlab yuborilmaydi: `pending` qoladi, urinish sanalmaydi, keyinroq qayta
 * olinadi. Doimiy sabab (bog'lanib bo'lmaydi) — avvalgidek `skipped`.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

// Seshanba, 10:00 Toshkent — ish vaqti ichida.
const NOW = new Date('2026-10-20T05:00:00Z');

function build(natija: StartConversationResult | Error) {
  const deferlar: Array<{ id: string; until: Date; reason: string }> = [];
  const yangilashlar: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const campaigns = {
    findRunning: async () => [{ id: 'k1', name: 'Kampaniya', dailyLimit: 30, windowStart: null, windowEnd: null }],
    countSentToday: async () => 0,
    claimNextTargets: async () => [{ id: 't1', clientId: 'c1', attempts: 0 }],
    deferTarget: async (id: string, until: Date, reason: string) => void deferlar.push({ id, until, reason }),
    updateTarget: async (id: string, patch: Record<string, unknown>) => void yangilashlar.push({ id, patch }),
    setStatus: async () => undefined,
    stats: async () => ({ pending: 1 }),
  } as unknown as ICampaignRepository;
  const accounts = {
    listConnected: async () => [
      { id: 'a1', isEnabled: true, status: 'connected', spamStatus: 'ok', dailyLimit: 30, sentToday: 0, counterDate: '2026-10-20', floodWaitUntil: null },
    ],
  } as unknown as ITelegramAccountRepository;
  const start = {
    execute: async () => {
      if (natija instanceof Error) throw natija;
      return natija;
    },
  } as unknown as StartConversationUseCase;
  const s = new OutreachScheduler(
    campaigns,
    accounts,
    start,
    {
      get: async () => ({
        killSwitch: false, windowStart: '00:00', windowEnd: '23:59', weekdays: [0, 1, 2, 3, 4, 5, 6],
        minDelaySec: 60, maxDelaySec: 180,
      }),
    } as unknown as RuntimeSettings,
    { record: async () => undefined } as unknown as IAuditRepository,
    { publish: () => undefined } as unknown as IEventBus,
    { now: () => NOW, todayIso: () => '2026-10-20' } as unknown as IClock,
  );
  return { s, deferlar, yangilashlar };
}

{
  const m = build({ status: 'skipped', reason: '"Akk 1" kunlik limitini to\'ldirgan', conversation: null, retryLater: true });
  await m.s.runOnceForTesting();
  check('kvota tugagan — nishon keyinga qoldirildi', m.deferlar.length === 1 && m.deferlar[0]?.id === 't1', JSON.stringify(m.deferlar));
  check('kvota tugagan — skipped QILINMADI', !m.yangilashlar.some((u) => u.patch.state === 'skipped'), JSON.stringify(m.yangilashlar));
  check('kvota tugagan — keyinroq (kelajakda) qayta olinadi', (m.deferlar[0]?.until.getTime() ?? 0) > NOW.getTime());
}
{
  const m = build({ status: 'skipped', reason: 'Mijoz bilan bog\'lanish taqiqlangan yoki raqami yo\'q', conversation: null });
  await m.s.runOnceForTesting();
  check('doimiy sabab — skipped', m.yangilashlar.some((u) => u.patch.state === 'skipped') && m.deferlar.length === 0, JSON.stringify(m.yangilashlar));
}
{
  const err = new TelegramError('FLOOD_WAIT 120', 'FLOOD_WAIT', 120);
  const m = build(err);
  await m.s.runOnceForTesting();
  check('FLOOD_WAIT — nishon pending (defer), urinish sanalmadi', m.deferlar.length === 1 && !m.yangilashlar.length, JSON.stringify([m.deferlar, m.yangilashlar]));
  check('FLOOD_WAIT — kutish retryAfter bo\'yicha', m.deferlar[0]?.until.getTime() === NOW.getTime() + 120_000);
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
