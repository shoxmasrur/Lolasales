import { OylikEslatmaWatcher } from '@/application/services/OylikEslatmaWatcher';
import type { AgentRunner } from '@/application/services/AgentRunner';
import type { ContractSyncService } from '@/application/services/ContractSyncService';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { Conversation } from '@/domain/entities/Conversation';
import type { IContractPaymentRepository, SchedulePayment } from '@/domain/repositories/IContractPaymentRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IHolidayRepository } from '@/domain/repositories/IHolidayRepository';
import type { IOylikEslatmaRepository, OylikEslatmaYozuvi } from '@/domain/repositories/IOylikEslatmaRepository';
import type { AuditEntry, IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { OylikEslatmaMalumoti } from '@/domain/services/oylikEslatma';
import type { IClock } from '@/domain/services/support';
import { CrmUnavailableError, KillSwitchError } from '@/shared/errors';

/**
 * Qo'lda ishga tushiriladi: npm run test:oylik-eslatma-watcher --workspace=server
 *
 * Bazaga ham, Telegramga ham chiqmaydi — hamma port soxta.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : ` — ${izoh}`}`);
};

const t = (isoLocal: string): Date => new Date(`${isoLocal}+05:00`);
// Seshanba, 2026-09-22 10:00
const HOZIR = t('2026-09-22T10:00:00');

const conv = (over: Partial<Conversation> = {}): Conversation => ({
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
  lastOutboundAt: t('2026-08-20T10:00:00'),
  unreadCount: 0,
  nudgeCount: 2,
  summary: null,
  createdAt: t('2026-08-20T10:00:00'),
  updatedAt: t('2026-08-20T10:00:00'),
  ...over,
});

interface Sahna {
  suhbat?: Partial<Conversation>;
  jadval?: SchedulePayment[];
  bugunYuborilgan?: number;
  yoqilgan?: boolean;
  agentXatosi?: Error;
  /** `syncIfStale` `outcome: 'error'` qaytaradi (CRM javob bermadi). */
  syncXatosi?: boolean;
  /** Muvaffaqiyatli yuborishdan KEYIN `resetNudgeCount` yiqiladi. */
  resetXatosi?: Error;
  /** Nomzod qatorining sanasi (standart — 2026-09-21). */
  nomzodSanasi?: string;
  /**
   * Suhbatni IKKINCHI o'qishda `lastOutboundAt` shu qiymatga o'zgaradi —
   * oradagi vaqtda boshqa tizim xabari (masalan, sukut) ketgan.
   */
  oradaYuborildi?: Date;
  /** `skipped/tolangan` yozuvini qo'shish yiqiladi. */
  tolanganYozuvXatosi?: Error;
  /** `sukutdami` javoblari chaqiruv tartibida (oxirgisi takrorlanadi); standart — `[false]`. */
  sukut?: boolean[];
}

interface Natija {
  chaqiruvlar: OylikEslatmaMalumoti[];
  yozuvlar: OylikEslatmaYozuvi[];
  holatlar: string[];
  ochirildi: number;
  reset: number;
  holatYangilandi: string[];
  /** `syncIfStale` ga berilgan `maxAgeMinutes` argumentlari — chaqiruv tartibida. */
  syncMaxAge: number[];
  auditlar: AuditEntry[];
  /** `sukutdami` ga berilgan `[clientId, todayIso]`. */
  sukutSorovlari: Array<[string, string]>;
}

const SENTABR: SchedulePayment = { dateIso: '2026-09-21', amount: 3_000_000, paid: 0, status: 'waiting', type: 'monthly' };

async function ishlat(s: Sahna = {}): Promise<Natija> {
  const n: Natija = { chaqiruvlar: [], yozuvlar: [], holatlar: [], ochirildi: 0, reset: 0, holatYangilandi: [], syncMaxAge: [], auditlar: [], sukutSorovlari: [] };
  let oqishlar = 0;
  let suhbat = conv(s.suhbat);
  const jadval = s.jadval ?? [SENTABR];

  const watcher = new OylikEslatmaWatcher(
    {
      nomzodlar: async () => [{ conversationId: 'cv1', clientId: 'cl1', contractId: 's1', datePayment: s.nomzodSanasi ?? '2026-09-21' }],
      yoz: async (y: OylikEslatmaYozuvi[]) => {
        if (s.tolanganYozuvXatosi && y.some((q) => q.sabab === 'tolangan')) throw s.tolanganYozuvXatosi;
        n.yozuvlar.push(...y);
        return y.length;
      },
      holatniOzgartir: async (_k: unknown, holat: string, sabab: string | null) => { n.holatlar.push(`${holat}:${sabab}`); },
      ochir: async () => { n.ochirildi += 1; },
      bugunYuborilgan: async () => s.bugunYuborilgan ?? 0,
    } as unknown as IOylikEslatmaRepository,
    {
      findById: async () => {
        oqishlar += 1;
        if (s.oradaYuborildi && oqishlar === 2) suhbat = { ...suhbat, lastOutboundAt: s.oradaYuborildi };
        return suhbat;
      },
      resetNudgeCount: async () => {
        n.reset += 1;
        if (s.resetXatosi) throw s.resetXatosi;
      },
      update: async (_id: string, patch: { state?: Conversation['state'] }) => {
        if (patch.state) { n.holatYangilandi.push(patch.state); suhbat = { ...suhbat, state: patch.state }; }
        return suhbat;
      },
    } as unknown as IConversationRepository,
    {
      findByClientId: async () => [{ id: 's1', contractNo: '5582MSO25F3', virtualStatus: 'sold' }],
    } as unknown as IContractRepository,
    { listSchedule: async () => jadval } as unknown as IContractPaymentRepository,
    {
      syncIfStale: async (_id: string, maxAge: number) => {
        n.syncMaxAge.push(maxAge);
        if (s.syncXatosi) return { outcome: 'error', contractId: 's1', debtTotal: 0, newPhones: [] };
        return null;
      },
    } as unknown as ContractSyncService,
    {
      monthlyReminder: async (_id: string, m: OylikEslatmaMalumoti) => {
        if (s.agentXatosi) throw s.agentXatosi;
        n.chaqiruvlar.push(m);
        return { sent: true, reply: 'matn', escalated: false, promiseRecorded: false };
      },
    } as unknown as AgentRunner,
    {
      get: async () => ({
        killSwitch: false,
        windowStart: '09:00',
        windowEnd: '19:00',
        weekdays: [1, 2, 3, 4, 5, 6],
        minDelaySec: 0,
        maxDelaySec: 0,
        minDebt: 100_000,
        oylikEslatma: s.yoqilgan ?? true,
        oylikEslatmaOldinKun: 2,
        oylikEslatmaKeyinKun: 0,
        oylikEslatmaKunlik: 60,
      }),
    } as unknown as RuntimeSettings,
    { now: () => HOZIR, todayIso: () => '2026-09-22' } as unknown as IClock,
    { list: async () => [] } as unknown as IHolidayRepository,
    { record: async (e: AuditEntry) => { n.auditlar.push(e); } } as unknown as IAuditRepository,
    {
      sukutdami: async (clientId: string, today: string) => {
        const javoblar = s.sukut ?? [false];
        n.sukutSorovlari.push([clientId, today]);
        return javoblar[Math.min(n.sukutSorovlari.length - 1, javoblar.length - 1)]!;
      },
    },
  );

  await watcher.run();
  return n;
}

{
  const n = await ishlat();
  check('sanasi o\'tgan sentabr — eslatma ketdi', n.chaqiruvlar.length === 1, String(n.chaqiruvlar.length));
  check('yozuv sent bo\'lib qo\'shildi', n.yozuvlar.length === 1 && n.yozuvlar[0]!.holat === 'sent');
  check('guruh B (oldingi oylar yopiq)', n.chaqiruvlar[0]?.guruh === 'B');
  check('sukut hisoblagichi nolga qaytdi', n.reset === 1);
}
{
  const n = await ishlat({ yoqilgan: false });
  check('sozlama o\'chiq — hech narsa', n.chaqiruvlar.length === 0 && n.yozuvlar.length === 0);
}
{
  const n = await ishlat({ bugunYuborilgan: 60 });
  check('kunlik chegara to\'lgan — hech narsa', n.chaqiruvlar.length === 0);
}
{
  const n = await ishlat({ suhbat: { lastInboundAt: t('2026-09-22T08:00:00') } });
  check('faol suhbat (2 soat oldin javob) — keyinga qoldi', n.chaqiruvlar.length === 0 && n.yozuvlar.length === 0);
}
{
  const n = await ishlat({ jadval: [{ ...SENTABR, paid: 3_000_000, status: 'paid' }] });
  check('sinxdan keyin to\'langan — xabar yo\'q', n.chaqiruvlar.length === 0);
  check('to\'langan — skipped/tolangan yozildi', n.yozuvlar.length === 1 && n.yozuvlar[0]!.holat === 'skipped' && n.yozuvlar[0]!.sabab === 'tolangan');
}
{
  const n = await ishlat({ suhbat: { state: 'unreachable' } });
  check('unreachable — eslatma ketdi', n.chaqiruvlar.length === 1);
  check('unreachable → contacted (sukut davom etsin)', n.holatYangilandi.includes('contacted'));
}
{
  const n = await ishlat({ jadval: [{ dateIso: '2026-08-21', amount: 3_000_000, paid: 0, status: 'waiting', type: 'monthly' }, SENTABR] });
  check('avgust ham ochiq — C guruhi', n.chaqiruvlar[0]?.guruh === 'C');
  check('C: jami 6 mln', n.chaqiruvlar[0]?.jami === 6_000_000, String(n.chaqiruvlar[0]?.jami));
}
{
  const n = await ishlat({ agentXatosi: new CrmUnavailableError('crm') });
  check('CRM yiqildi — yozuv o\'chirildi (keyingi tsiklda qayta)', n.ochirildi === 1);
  check('CRM yiqildi — holat o\'zgartirilmadi', n.holatlar.length === 0);
}
{
  const n = await ishlat({ agentXatosi: new Error('model') });
  check('agent xatosi — skipped:agent_xato', n.holatlar.includes('skipped:agent_xato'));
  const a = n.auditlar[0];
  check(
    'agent xatosi — audit yozuvi (oylik_eslatma.failed)',
    n.auditlar.length === 1 && a?.action === 'oylik_eslatma.failed' && a.entity === 'conversation'
      && a.entityId === 'cv1' && a.actor === 'system'
      && JSON.stringify(a.payload) === JSON.stringify({ sabab: 'agent_xato', qatorlar: 1 }),
    JSON.stringify(n.auditlar),
  );
}
{
  const n = await ishlat({ agentXatosi: new KillSwitchError() });
  check('kill switch tsikl o\'rtasida — yozuv o\'chirildi (keyin qayta)', n.ochirildi === 1);
  check('kill switch — holat agent_xato bo\'lmadi', n.holatlar.length === 0, JSON.stringify(n.holatlar));
}
{
  // Sukut xabari (yoki boshqa tizim xabari) sinx va yozuv orasida ketdi.
  const n = await ishlat({ oradaYuborildi: t('2026-08-20T10:01:00') });
  check('orada boshqa xabar ketdi — agent chaqirilmadi', n.chaqiruvlar.length === 0, String(n.chaqiruvlar.length));
  check('orada boshqa xabar ketdi — yozuv o\'chirildi', n.ochirildi === 1, String(n.ochirildi));
}
{
  // D = 30-sentabr: B 28-sentabrdan boshlanadi — bugun (22) hali erta.
  const n = await ishlat({ nomzodSanasi: '2026-09-30', jadval: [{ ...SENTABR, dateIso: '2026-09-30' }] });
  check('hali erta — CRM sinx qilinmadi', n.syncMaxAge.length === 0, JSON.stringify(n.syncMaxAge));
  check('hali erta — agent chaqirilmadi', n.chaqiruvlar.length === 0);
}
{
  let yiqildi = false;
  const n = await ishlat({ jadval: [{ ...SENTABR, paid: 3_000_000, status: 'paid' }], tolanganYozuvXatosi: new Error('db') })
    .catch(() => { yiqildi = true; return null; });
  check('tolangan yozuvi xatosi tsiklni yiqitmaydi', !yiqildi && n !== null);
}
{
  const n = await ishlat({ syncXatosi: true });
  check('sync xatosi — agent chaqirilmadi', n.chaqiruvlar.length === 0, String(n.chaqiruvlar.length));
  check('sync xatosi — yozuv qo\'shilmadi', n.yozuvlar.length === 0, String(n.yozuvlar.length));
}
{
  const n = await ishlat();
  check('sync har doim yangi (maxAge=0)', n.syncMaxAge.length > 0 && n.syncMaxAge.every((a) => a === 0), JSON.stringify(n.syncMaxAge));
}
{
  // 2026-09-30, Maxkamova N.S.: 29-da agent kechikish haqida birinchi
  // xabarni yozdi, javob kelmadi, 24 soatdan keyin shu to'lov uchun
  // eslatma ham ketdi. To'lov sanasidan KEYIN yozilgan bo'lsa — mavzu
  // ochilgan, davomi sukut kuzatuvchisiniki.
  const n = await ishlat({
    nomzodSanasi: '2026-09-18',
    jadval: [{ ...SENTABR, dateIso: '2026-09-18' }],
    suhbat: { lastOutboundAt: t('2026-09-19T14:07:00') },
  });
  check('sanadan keyin allaqachon yozilgan — eslatma ketmadi', n.chaqiruvlar.length === 0, String(n.chaqiruvlar.length));
  check(
    'sanadan keyin yozilgan — skipped/yozilgan qayd etildi',
    n.yozuvlar.length === 1 && n.yozuvlar[0]!.holat === 'skipped' && n.yozuvlar[0]!.sabab === 'yozilgan',
    JSON.stringify(n.yozuvlar),
  );
}
{
  const n = await ishlat({
    nomzodSanasi: '2026-09-18',
    jadval: [{ ...SENTABR, dateIso: '2026-09-18' }],
    suhbat: { lastOutboundAt: t('2026-09-17T14:07:00') },
  });
  check('sanadan OLDIN yozilgan — eslatma ketdi', n.chaqiruvlar.length === 1, String(n.chaqiruvlar.length));
}
{
  // Aynan to'lov kuni yozilgan xabar kechikish haqida emas (A guruhi eslatmasi ham shu kuni ketadi).
  const n = await ishlat({ suhbat: { lastOutboundAt: t('2026-09-21T09:00:00') } });
  check('to\'lov kunining o\'zida yozilgan — eslatma ketdi', n.chaqiruvlar.length === 1, String(n.chaqiruvlar.length));
}
{
  const n = await ishlat({ resetXatosi: new Error('db') });
  check('resetNudgeCount xato — xabar baribir yuborilgan hisoblanadi', n.chaqiruvlar.length === 1);
  check('resetNudgeCount xato — yozuv holati o\'zgarmadi (baribir "sent")', n.holatlar.length === 0);
}

{
  // Talabnoma muddati ichida — agent o'zi yozmaydi, qator ham yozilmaydi:
  // muddat tugagach (eslatma oynasi ichida bo'lsa) eslatma o'z navbatini oladi.
  const n = await ishlat({ sukut: [true] });
  check('talabnoma muddati — eslatma agentga BORMADI', n.chaqiruvlar.length === 0, String(n.chaqiruvlar.length));
  check('talabnoma muddati — qator yozilmadi', n.yozuvlar.length === 0, JSON.stringify(n.yozuvlar));
  check(
    'talabnoma muddati — mijoz va bugungi sana bilan so\'raldi',
    n.sukutSorovlari.some(([c, d]) => c === 'cl1' && d === '2026-09-22'),
    JSON.stringify(n.sukutSorovlari),
  );
}
{
  // Sinx va yozuv orasida operator talabnoma yubordi — oxirgi tekshiruv ushlaydi.
  const n = await ishlat({ sukut: [false, true] });
  check('talabnoma oradan yuborildi — agent chaqirilmadi', n.chaqiruvlar.length === 0, String(n.chaqiruvlar.length));
  check('talabnoma oradan yuborildi — yozuv qaytarildi', n.ochirildi === 1, String(n.ochirildi));
}
{
  const n = await ishlat({ sukut: [false] });
  check('talabnoma sukuti yo\'q — eslatma avvalgidek ketdi', n.chaqiruvlar.length === 1, String(n.chaqiruvlar.length));
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
