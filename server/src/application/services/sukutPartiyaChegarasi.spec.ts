import { SilenceWatcher } from '@/application/services/SilenceWatcher';
import type { IHolidayRepository } from '@/domain/repositories/IHolidayRepository';
import type { Conversation } from '@/domain/entities/Conversation';
import type { AgentRunner } from '@/application/services/AgentRunner';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IPaymentPromiseRepository } from '@/domain/repositories/IPaymentPromiseRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { IClock } from '@/domain/services/support';

/**
 * Qo'lda ishga tushiriladi: npm run test:sukut-partiya --workspace=server
 *
 * Bazaga ham, Telegramga ham chiqmaydi — hamma port soxta.
 *
 * NEGA KERAK: bir tsiklda ketadigan qayta murojaatlar soni chegaralangan
 * (20 ta), lekin chegara YUBORILGAN xabarlarga bog'langan edi. Agent esa
 * `sent: false` qaytaradigan ikkita oddiy holat bor: qo'lda tasdiqlash
 * rejimi (`agentAutoReply` o'chiq — javob qoralama bo'lib qoladi) va
 * modelning "bu yerda yozish noto'g'ri" qarori. Ikkalasida ham hisoblagich
 * qimirlamasdi, ya'ni bitta tsiklda 60 tagacha (`CANDIDATE_LIMIT`) suhbat
 * ketma-ket, PAUZASIZ model chaqiruvini olardi va har birining urinish
 * hisoblagichi oshardi. Pul ham, mijozlarning urinishlari ham shu yerda
 * jimgina yonardi.
 *
 * Shuning uchun chegara AGENT CHAQIRUVLARIGA bog'langan bo'lishi kerak.
 */
const BATCH = 20;
const NOMZODLAR = 25;

let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : ` — ${izoh}`}`);
};

const t = (isoLocal: string): Date => new Date(`${isoLocal}+05:00`);
const HOZIR = t('2026-08-18T09:00:00'); // seshanba, ish oynasi ichida

const conv = (id: string): Conversation => ({
  id,
  clientId: `cl-${id}`,
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
  lastOutboundAt: t('2026-08-17T10:00:00'), // dushanba — 1 ish kuni sukut
  unreadCount: 0,
  nudgeCount: 0,
  summary: null,
  createdAt: t('2026-08-17T10:00:00'),
  updatedAt: t('2026-08-17T10:00:00'),
});

const barchasi = Array.from({ length: NOMZODLAR }, (_, i) => conv(`cv${i + 1}`));
const bazadan = new Map(barchasi.map((c) => [c.id, c]));

const bumped: string[] = [];
const chaqiruvlar: string[] = [];

const conversations = {
  findSilent: async () => barchasi,
  findById: async (id: string) => bazadan.get(id) ?? null,
  bumpNudgeCount: async (id: string) => {
    bumped.push(id);
  },
} as unknown as IConversationRepository;

const watcher = new SilenceWatcher(
  conversations,
  { findActiveByConversation: async () => null } as unknown as IPaymentPromiseRepository,
  { findByClientId: async () => [] } as unknown as IContractRepository,
  {
    // Qo'lda tasdiqlash rejimining taqlidi: javob QORALAMA bo'lib qoladi,
    // ya'ni Telegramga hech narsa ketmaydi — `sent: false`.
    silenceNudge: async (conversationId: string) => {
      chaqiruvlar.push(conversationId);
      return { sent: false, reply: 'qoralama', escalated: false, promiseRecorded: false };
    },
  } as unknown as AgentRunner,
  {
    get: async () => ({
      // Pauza nolga tenglashtirilgan: sinov soniyalab kutmasin, lekin kod
      // yo'li (sleep → qayta o'qish) o'zgarishsiz qolsin.
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
  { record: async () => undefined } as unknown as IAuditRepository,
  { now: () => HOZIR, todayIso: () => '2026-08-18' } as unknown as IClock,
  { list: async () => [] } as unknown as IHolidayRepository,
  { sukutdami: async () => false },
);

const sent = await watcher.nudge();

check(
  `agent chaqiruvi ${BATCH} tada to'xtadi (nomzod ${NOMZODLAR} ta)`,
  chaqiruvlar.length === BATCH,
  `chaqiruvlar: ${chaqiruvlar.length}`,
);
check(
  `hisoblagich ham faqat ${BATCH} ta suhbatda oshirildi`,
  bumped.length === BATCH,
  `bumped: ${bumped.length}`,
);
check('hech narsa yuborilmadi — natija nol', sent === 0, String(sent));

// ── Pauza ichida boshqa tizim xabari (oylik eslatma) ketdi.
//
// Ikkinchi suhbatni pauzadan keyin qayta o'qishda `lastOutboundAt`
// o'zgargan, mijoz esa javob yozmagan (`lastInboundAt` null). Eski
// tekshiruv faqat inbound >= outbound ni solishtirardi — sukut xabari
// eslatmadan bir necha soniya keyin ketardi.
{
  const ikkitasi = [conv('a1'), conv('a2')];
  let a2Oqish = 0;
  const ikkinchiChaqiruvlar: string[] = [];
  const w = new SilenceWatcher(
    {
      findSilent: async () => ikkitasi,
      findById: async (id: string) => {
        const c = ikkitasi.find((x) => x.id === id) ?? null;
        if (id !== 'a2' || !c) return c;
        a2Oqish += 1;
        // 1-o'qish — tsikl boshida, 2-si — pauzadan keyin.
        return a2Oqish >= 2 ? { ...c, lastOutboundAt: t('2026-08-18T08:59:00') } : c;
      },
      bumpNudgeCount: async () => undefined,
    } as unknown as IConversationRepository,
    { findActiveByConversation: async () => null } as unknown as IPaymentPromiseRepository,
    { findByClientId: async () => [] } as unknown as IContractRepository,
    {
      silenceNudge: async (conversationId: string) => {
        ikkinchiChaqiruvlar.push(conversationId);
        return { sent: true, reply: 'matn', escalated: false, promiseRecorded: false };
      },
    } as unknown as AgentRunner,
    {
      get: async () => ({
        minDelaySec: 0, maxDelaySec: 0, windowStart: '00:00', windowEnd: '23:59',
        weekdays: [1, 2, 3, 4, 5, 6], killSwitch: false,
        silenceNudge: true, silenceNudgeDays: 1, silenceNudgeMax: 2,
      }),
    } as unknown as RuntimeSettings,
    { record: async () => undefined } as unknown as IAuditRepository,
    { now: () => HOZIR, todayIso: () => '2026-08-18' } as unknown as IClock,
    { list: async () => [] } as unknown as IHolidayRepository,
    { sukutdami: async () => false },
  );
  await w.nudge();
  check(
    'pauza ichida boshqa xabar ketgan suhbatga sukut yuborilmadi',
    JSON.stringify(ikkinchiChaqiruvlar) === JSON.stringify(['a1']),
    JSON.stringify(ikkinchiChaqiruvlar),
  );
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
