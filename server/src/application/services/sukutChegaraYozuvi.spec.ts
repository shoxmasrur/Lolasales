import { SilenceWatcher } from '@/application/services/SilenceWatcher';
import type { IHolidayRepository } from '@/domain/repositories/IHolidayRepository';
import type { Conversation } from '@/domain/entities/Conversation';
import type { AgentRunner } from '@/application/services/AgentRunner';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IPaymentPromiseRepository } from '@/domain/repositories/IPaymentPromiseRepository';
import type { AuditEntry, IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { IClock } from '@/domain/services/support';

/**
 * Qo'lda ishga tushiriladi: npm run test:sukut-chegara --workspace=server
 *
 * Bazaga ham, Telegramga ham chiqmaydi — hamma port soxta.
 *
 * NEGA KERAK: oxirgi urinishda hisoblagich chegaraga yetadi va suhbat
 * `findSilent` dan BUTUNLAY chiqib ketadi — endi unga hech kim, hech
 * qachon o'zi yozmaydi. Buni operatorga bildiradigan yagona iz —
 * 'nudge.exhausted' jurnal yozuvi. Yozuv agent chaqiruvidan KEYIN
 * yozilardi, ya'ni chaqiruv yiqilsa (model xatosi, peer topilmadi,
 * akkaunt kvotasi) hisoblagich sarflangan, xabar ketmagan va iz ham
 * qolmagan holat paydo bo'lardi: suhbat jimgina yo'qolardi.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : ` — ${izoh}`}`);
};

const t = (isoLocal: string): Date => new Date(`${isoLocal}+05:00`);
const HOZIR = t('2026-08-18T09:00:00'); // seshanba, ish oynasi ichida

/** `nudgeCount: 1` va chegara 2 — ya'ni bu OXIRGI urinish. */
const SUHBAT: Conversation = {
  id: 'cv1',
  clientId: 'cl1',
  telegramAccountId: null,
  peerId: null,
  peerAccessHash: null,
  state: 'contacted',
  stage: 'soft',
  agentEnabled: true,
  needsHuman: false,
  humanReason: null,
  humanKind: null,
  agentSessionId: null,
  lastMessageAt: null,
  lastInboundAt: null,
  lastOutboundAt: t('2026-08-17T10:00:00'),
  unreadCount: 0,
  nudgeCount: 1,
  summary: null,
  createdAt: t('2026-08-17T10:00:00'),
  updatedAt: t('2026-08-17T10:00:00'),
};

const yozuvlar: AuditEntry[] = [];
const bumped: string[] = [];

const watcher = new SilenceWatcher(
  {
    findSilent: async () => [SUHBAT],
    findById: async () => SUHBAT,
    bumpNudgeCount: async (id: string) => {
      bumped.push(id);
    },
  } as unknown as IConversationRepository,
  { findActiveByConversation: async () => null } as unknown as IPaymentPromiseRepository,
  { findByClientId: async () => [] } as unknown as IContractRepository,
  {
    // Agent chaqiruvi YIQILADI — texnik nosozlik taqlidi.
    silenceNudge: async () => {
      throw new Error('model javob bermadi');
    },
  } as unknown as AgentRunner,
  {
    get: async () => ({
      minDelaySec: 0,
      maxDelaySec: 0,
      windowStart: '00:00',
      windowEnd: '23:59',
      weekdays: [1, 2, 3, 4, 5, 6],
      killSwitch: false,
      silenceNudge: true,
      silenceNudgeDays: 1,
      silenceNudgeMax: 2,
    }),
  } as unknown as RuntimeSettings,
  {
    record: async (e: AuditEntry) => {
      yozuvlar.push(e);
    },
  } as unknown as IAuditRepository,
  { now: () => HOZIR, todayIso: () => '2026-08-18' } as unknown as IClock,
  { list: async () => [] } as unknown as IHolidayRepository,
  { sukutdami: async () => false },
);

const sent = await watcher.nudge();

check('hisoblagich oshirildi (chegara sarflandi)', bumped.includes('cv1'), JSON.stringify(bumped));
check('xabar ketmadi — chaqiruv yiqildi', sent === 0, String(sent));
check(
  'agent yiqilsa ham chegara yozuvi qoldi',
  yozuvlar.some((y) => y.action === 'nudge.exhausted' && y.entityId === 'cv1'),
  JSON.stringify(yozuvlar),
);
check(
  'yozuvda nechanchi urinish ekani ko\'rinadi',
  yozuvlar.find((y) => y.action === 'nudge.exhausted')?.payload?.attempts === 2,
  JSON.stringify(yozuvlar),
);

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
