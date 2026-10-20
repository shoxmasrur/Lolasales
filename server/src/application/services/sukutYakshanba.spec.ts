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
 * Qo'lda ishga tushiriladi: npm run test:sukut-yakshanba --workspace=server
 *
 * Bazaga ham, Telegramga ham chiqmaydi — hamma port soxta.
 *
 * NEGA KERAK: yakshanba qayta murojaat uchun yopiq kun va bu QOIDA, sozlama
 * emas. Sukut kunlarini sanashda yakshanba tashlab ketiladi (`sukutKunlari`),
 * sozlamalar sahifasidagi yordam matni ham "Yakshanba hisobga olinmaydi"
 * deydi. Lekin yuborish kunlari umumiy `weekdays` sozlamasidan olinardi va
 * uni operator dashboarddan yoqib qo'yishi mumkin — o'shanda xabar
 * "javob bermadingiz" degan da'vo bilan yakshanba kuni ketardi. Da'vo esa
 * asossiz: bank ishlamaydi, mijoz to'lagan bo'lsa ham pul o'tmagan
 * bo'lishi mumkin.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : ` — ${izoh}`}`);
};

const t = (isoLocal: string): Date => new Date(`${isoLocal}+05:00`);

const conv = (): Conversation => ({
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
  // Juma 10:00 — yakshanbagacha ham, dushanbagacha ham sukut yetarli.
  lastOutboundAt: t('2026-08-21T10:00:00'),
  unreadCount: 0,
  nudgeCount: 0,
  summary: null,
  createdAt: t('2026-08-21T10:00:00'),
  updatedAt: t('2026-08-21T10:00:00'),
});

/** Operator yakshanbani ham yoqib qo'ygan sozlama. */
const YETTI_KUN = [1, 2, 3, 4, 5, 6, 7];

async function yoziladimi(hozir: Date, weekdays: number[]): Promise<number> {
  const chaqiruvlar: string[] = [];
  const watcher = new SilenceWatcher(
    {
      findSilent: async () => [conv()],
      findById: async () => conv(),
      bumpNudgeCount: async () => undefined,
    } as unknown as IConversationRepository,
    { findActiveByConversation: async () => null } as unknown as IPaymentPromiseRepository,
    { findByClientId: async () => [] } as unknown as IContractRepository,
    {
      silenceNudge: async (conversationId: string) => {
        chaqiruvlar.push(conversationId);
        return { sent: true, reply: 'matn', escalated: false, promiseRecorded: false };
      },
    } as unknown as AgentRunner,
    {
      get: async () => ({
        minDelaySec: 0,
        maxDelaySec: 0,
        windowStart: '09:00',
        windowEnd: '19:00',
        weekdays,
        killSwitch: false,
        silenceNudge: true,
        silenceNudgeDays: 1,
        silenceNudgeMax: 2,
      }),
    } as unknown as RuntimeSettings,
    { record: async () => undefined } as unknown as IAuditRepository,
    {
      now: () => hozir,
      todayIso: () => hozir.toISOString().slice(0, 10),
    } as unknown as IClock,
    { list: async () => [] } as unknown as IHolidayRepository,
    { sukutdami: async () => false },
  );

  await watcher.nudge();
  return chaqiruvlar.length;
}

// Yakshanba, 10:00 — ish oynasi ichida, sozlamada yakshanba YOQILGAN.
const yakshanba = await yoziladimi(t('2026-08-23T10:00:00'), YETTI_KUN);
check('yakshanba kuni xabar ketmadi (sozlama yoqilgan bo\'lsa ham)', yakshanba === 0, String(yakshanba));

// Ko'zgu holat: bir xil sozlama, faqat kun boshqa. Ushbu tekshiruvsiz
// yuqoridagi nol boshqa sababdan ham kelib chiqqan bo'lishi mumkin edi
// (masalan nomzod umuman tanlanmagan).
const dushanba = await yoziladimi(t('2026-08-24T10:00:00'), YETTI_KUN);
check('dushanba kuni xabar ketdi (nazorat)', dushanba === 1, String(dushanba));

// Faqat yakshanba tanlangan sozlama: bo'sh ro'yxatni oyna qoidasi
// "barcha kunlar" deb tushunadi, ya'ni filtrdan keyin qolgan bo'shliq
// qayta murojaatni HAR KUNI yoqib yuborardi.
const faqatYakshanba = await yoziladimi(t('2026-08-24T10:00:00'), [7]);
check(
  'sozlamada faqat yakshanba qolsa — hech qachon yozilmaydi',
  faqatYakshanba === 0,
  String(faqatYakshanba),
);

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
