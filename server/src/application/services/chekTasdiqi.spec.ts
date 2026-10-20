import { CHEK_SABABLARI, PaymentCheckService } from '@/application/services/PaymentCheckService';
import { XaridXizmati } from '@/application/services/XaridXizmati';
import type { Course } from '@/domain/entities/Course';
import type { Conversation } from '@/domain/entities/Conversation';
import type { PaymentCheck } from '@/domain/entities/PaymentCheck';
import type { Purchase, XaridBosqichi } from '@/domain/entities/Purchase';
import type { ConversationPatch, IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IPaymentCheckRepository } from '@/domain/repositories/IPaymentCheckRepository';
import type { IPurchaseRepository } from '@/domain/repositories/IPurchaseRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { ICourseRepository } from '@/domain/repositories/ICourseRepository';
import type { IClock, IEventBus } from '@/domain/services/support';

/**
 * Qo'lda ishga tushiriladi: npm run test:chek-tasdiqi --workspace=server
 * (bazasiz, Telegramsiz, modelsiz — xotiradagi dublyorlar).
 *
 * Menejer chekni tasdiqlaydi (summa bilan) yoki rad etadi (spec 6.5):
 *   • summa `paid_amount` ga qo'shiladi, bosqich `qisman_toladi`/`toladi`;
 *   • havola kurs qoidasi bo'yicha, xaridga BIR MARTA, `meta.kind = 'havola'`;
 *   • rad etishda bosqich `karta_yuborildi`, eslatma qayta yozilmaydi.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

const NOW = new Date('2026-10-20T06:00:00Z');
const MENEJER = 'menejer@lola.uz';
const LINK = 'https://t.me/+abc';
const HAVOLA_MATNI = `Yopiq guruhga havola: ${LINK}\nQo'shilish so'rovini yuboring, tez orada qabul qilamiz.`;

const KURS: Course = {
  id: 'k1', name: 'Kurs', description: null, salesStart: '2026-01-01', salesEnd: '2026-12-31', price: 1_500_000,
  duration: null, topics: [], startsOn: null, groupLink: LINK, isActive: true,
  installmentAllowed: true, installmentParts: 3, installmentFirstMin: 500_000, linkAfter: 'birinchi_qism',
};

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function build(opts: {
  course?: Partial<Course> | null;
  purchase?: Partial<Purchase>;
  killSwitch?: boolean;
  agentThrows?: boolean;
  sendThrows?: boolean;
  checkCreatedAt?: Date;
  noReview?: boolean;
} = {}) {
  const tartib: string[] = [];
  const patches: ConversationPatch[] = [];
  const audits: Array<{ action: string; payload: Record<string, unknown> }> = [];
  const sends: Array<{ body: string; meta: unknown; author: string }> = [];
  const thanks: Array<Record<string, unknown>> = [];
  const rejects: Array<{ id: string; reason: string }> = [];

  const course: Course | null = opts.course === null ? null : { ...KURS, ...opts.course };
  const purchases: Mutable<Purchase>[] = [{
    id: 'p1', clientId: 'c1', courseId: course?.id ?? null, stage: 'chek_keldi', stageChangedAt: NOW,
    totalAmount: 1_500_000, paidAmount: 0, installment: true, linkSentAt: null, remindedStages: [], createdAt: NOW,
    ...opts.purchase,
  }];
  const faol = (clientId: string) =>
    purchases.find((p) => p.clientId === clientId && p.stage !== 'toladi' && p.stage !== 'rad_etdi') ?? null;
  const purchaseRepo = {
    findById: async (id: string) => purchases.find((p) => p.id === id) ?? null,
    findActiveByClient: async (clientId: string) => faol(clientId),
    findLatestByClient: async (clientId: string) => purchases.filter((p) => p.clientId === clientId).at(-1) ?? null,
    create: async (d: { clientId: string; courseId: string | null; totalAmount: number | null }) => {
      const p: Mutable<Purchase> = {
        id: `p${purchases.length + 1}`, clientId: d.clientId, courseId: d.courseId, stage: 'yangi', stageChangedAt: NOW,
        totalAmount: d.totalAmount, paidAmount: 0, installment: false, linkSentAt: null, remindedStages: [], createdAt: NOW,
      };
      purchases.push(p);
      return p;
    },
    setStage: async (id: string, stage: XaridBosqichi) => {
      const p = purchases.find((x) => x.id === id)!;
      p.stage = stage;
      tartib.push(`stage:${stage}`);
      return { ...p };
    },
    addPaid: async (id: string, amount: number) => {
      const p = purchases.find((x) => x.id === id)!;
      p.paidAmount += amount;
      return { ...p };
    },
    markLinkSent: async (id: string, at: Date) => {
      const p = purchases.find((x) => x.id === id)!;
      if (p.linkSentAt) return false;
      p.linkSentAt = at;
      return true;
    },
    addRemindedStage: async (id: string, stage: XaridBosqichi) => {
      const p = purchases.find((x) => x.id === id)!;
      if (!p.remindedStages.includes(stage)) p.remindedStages = [...p.remindedStages, stage];
    },
  } as unknown as IPurchaseRepository;

  let n = 0;
  const checks: Mutable<PaymentCheck>[] = [];
  const yangiChek = (createdAt = NOW): Mutable<PaymentCheck> => {
    n += 1;
    const c: Mutable<PaymentCheck> = {
      id: `pc${n}`, conversationId: 'cv1', clientId: 'c1', purchaseId: 'p1', messageId: `m${n}`,
      kind: 'receipt_review', status: 'reviewing', receiptSource: 'tolov', sinceIso: '2026-10-20',
      acknowledgedAt: null, confirmedBy: null, confirmedAt: null, confirmedAmount: null, rejectedReason: null, createdAt,
    };
    checks.push(c);
    return c;
  };
  if (!opts.noReview) yangiChek(opts.checkCreatedAt);
  const checkRepo = {
    findOpenByConversation: async (id: string) => checks.find((c) => c.conversationId === id && c.status === 'reviewing') ?? null,
    openReceiptReview: async () => yangiChek(),
    raiseReceiptSource: async () => undefined,
    confirmByOperator: async (id: string, actor: string, amount: number, at: Date) => {
      const c = checks.find((x) => x.id === id && x.status === 'reviewing');
      if (!c) return false;
      Object.assign(c, { status: 'confirmed_by_operator', confirmedBy: actor, confirmedAmount: amount, confirmedAt: at });
      return true;
    },
    reject: async (id: string, actor: string, reason: string, at: Date) => {
      const c = checks.find((x) => x.id === id && x.status === 'reviewing');
      if (!c) return false;
      Object.assign(c, { status: 'rejected', confirmedBy: actor, rejectedReason: reason, confirmedAt: at });
      return true;
    },
    cancel: async (id: string) => {
      for (const c of checks) if (c.conversationId === id && c.status === 'reviewing') c.status = 'cancelled';
    },
    markAcknowledged: async () => true,
  } as unknown as IPaymentCheckRepository;

  const suhbat = { id: 'cv1', clientId: 'c1', needsHuman: true, humanReason: 'Mijoz to\'lov cheki yubordi — tekshiring' } as Conversation;
  const conversations = {
    findById: async () => suhbat,
    update: async (_id: string, p: ConversationPatch) => {
      patches.push(p);
      Object.assign(suhbat, p);
      return suhbat;
    },
  } as unknown as IConversationRepository;
  const courses = { findById: async (id: string) => (course && course.id === id ? course : null) } as unknown as ICourseRepository;
  const audit = {
    record: async (e: { action: string; payload: Record<string, unknown> }) => void audits.push(e),
  } as unknown as IAuditRepository;
  const events = { publish: () => undefined } as unknown as IEventBus;
  const clock = { now: () => NOW, todayIso: () => '2026-10-20' } as IClock;
  const xarid = new XaridXizmati(purchaseRepo, courses, events, audit, clock);

  const agent = {
    receiptConfirmedThanks: async (_id: string, c: Record<string, unknown>) => {
      tartib.push('thanks');
      thanks.push(c);
      if (opts.agentThrows) throw new Error('model yiqildi');
      return { sent: true, reply: 'Rahmat', escalated: false, cardSent: false };
    },
    receiptRejected: async (id: string, reason: string) => {
      rejects.push({ id, reason });
      return { sent: true, reply: 'Qayta yuboring', escalated: false, cardSent: false };
    },
  };
  const dispatcher = {
    send: async (o: { body: string; meta?: unknown; author: string }) => {
      tartib.push('send');
      if (opts.sendThrows) throw new Error('Telegram ulanmagan');
      sends.push({ body: o.body, meta: o.meta, author: o.author });
      return {} as never;
    },
  };
  const settings = { get: async () => ({ killSwitch: opts.killSwitch ?? false }) };

  const service = new PaymentCheckService(
    checkRepo, conversations, purchaseRepo, courses, xarid, agent as never, dispatcher as never,
    audit, events, clock, settings as never,
  );
  return { service, xarid, purchases, checks, patches, audits, sends, thanks, rejects, tartib, suhbat };
}

const oxirgiPatch = (m: ReturnType<typeof build>) => m.patches.at(-1);

// ─── 1. Qisman tasdiq (birinchi_qism) → qisman_toladi + havola ───────────
{
  const m = build();
  const out = await m.service.confirmReceipt('cv1', MENEJER, 500_000);
  check('qisman: natija', out.kind === 'confirmed' && out.stage === 'qisman_toladi' && out.linkSent, JSON.stringify(out));
  check('qisman: paid 500 000', m.purchases[0]!.paidAmount === 500_000, String(m.purchases[0]!.paidAmount));
  check('qisman: bosqich qisman_toladi', m.purchases[0]!.stage === 'qisman_toladi');
  check('qisman: chek summasi bilan yopildi', m.checks[0]!.status === 'confirmed_by_operator' && m.checks[0]!.confirmedAmount === 500_000 && m.checks[0]!.confirmedBy === MENEJER);
  check('qisman: rahmat summalari', JSON.stringify(m.thanks[0]) === JSON.stringify({ paidAmount: 500_000, totalAmount: 1_500_000, remaining: 1_000_000, linkWillBeSent: true }), JSON.stringify(m.thanks));
  check('qisman: havola bir marta, aniq matn', m.sends.length === 1 && m.sends[0]!.body === HAVOLA_MATNI, JSON.stringify(m.sends));
  check('qisman: meta havola', JSON.stringify(m.sends[0]?.meta) === JSON.stringify({ kind: 'havola' }));
  check('qisman: link_sent_at yozildi', m.purchases[0]!.linkSentAt?.getTime() === NOW.getTime());
  check('qisman: tartib bosqich → rahmat → havola', m.tartib.join(',') === 'stage:qisman_toladi,thanks,send', m.tartib.join(','));
  check('qisman: needsHuman tozalandi', m.suhbat.needsHuman === false && m.suhbat.humanReason === null, JSON.stringify(m.patches));
  const a = m.audits.find((x) => x.action === 'receipt_review.confirmed');
  check('qisman: audit summa bilan', a?.payload.amount === 500_000 && a.payload.linkSent === true, JSON.stringify(a));

  // ─── 2. Ikkinchi chek → toladi, havola qayta YO'Q ──────────────────────
  await m.service.openReceiptReview('cv1', 'c1', 'm9', 'tolov');
  await m.xarid.bosqich('c1', 'chek_keldi', 'tizim');
  check('ikkinchi: yangi chek ochildi va xaridga bog\'landi', m.checks[1]?.status === 'reviewing' && m.checks[1]!.purchaseId === 'p1');
  const ikki = await m.service.confirmReceipt('cv1', MENEJER, 1_000_000);
  check('ikkinchi: toladi, havola yo\'q', ikki.kind === 'confirmed' && ikki.stage === 'toladi' && !ikki.linkSent, JSON.stringify(ikki));
  check('ikkinchi: paid 1 500 000', m.purchases[0]!.paidAmount === 1_500_000);
  check('ikkinchi: havola qayta ketmadi', m.sends.length === 1, String(m.sends.length));
  check('ikkinchi: rahmat — qolgan 0, havola yo\'q', m.thanks[1]?.remaining === 0 && m.thanks[1]?.linkWillBeSent === false, JSON.stringify(m.thanks[1]));
}

// ─── 3. toliq qoidasi, qisman to'lov → havola yo'q ──────────────────────
{
  const m = build({ course: { linkAfter: 'toliq' } });
  const out = await m.service.confirmReceipt('cv1', MENEJER, 500_000);
  check('toliq/qisman: havola yo\'q', out.kind === 'confirmed' && out.stage === 'qisman_toladi' && !out.linkSent && m.sends.length === 0, JSON.stringify(out));
  check('toliq/qisman: menejerga o\'tmadi', m.suhbat.needsHuman === false);
  check('toliq/qisman: link_sent_at yo\'q', m.purchases[0]!.linkSentAt === null);
  const toliq = build({ course: { linkAfter: 'toliq' }, purchase: { installment: false } });
  const o2 = await toliq.service.confirmReceipt('cv1', MENEJER, 1_500_000);
  check('toliq/to\'liq: toladi + havola', o2.kind === 'confirmed' && o2.stage === 'toladi' && o2.linkSent && toliq.sends.length === 1, JSON.stringify(o2));
}

// ─── 4. Guruh havolasi kiritilmagan → menejerga ──────────────────────────
{
  const m = build({ course: { groupLink: null } });
  const out = await m.service.confirmReceipt('cv1', MENEJER, 500_000);
  check('havola yo\'q: tasdiqlandi, yuborilmadi', out.kind === 'confirmed' && !out.linkSent && m.sends.length === 0, JSON.stringify(out));
  check('havola yo\'q: humanReason aniq', m.suhbat.needsHuman === true && m.suhbat.humanReason === 'Kursga guruh havolasi kiritilmagan', JSON.stringify(oxirgiPatch(m)));
  check('havola yo\'q: agentga linkWillBeSent false', m.thanks[0]?.linkWillBeSent === false);
  check('havola yo\'q: bosqich baribir', m.purchases[0]!.stage === 'qisman_toladi');
}

// ─── 5. Rad etish ────────────────────────────────────────────────────────
{
  const m = build();
  const out = await m.service.rejectReceipt('cv1', MENEJER, 'Summa ko\'rinmayapti');
  check('rad: natija', out.kind === 'rejected', JSON.stringify(out));
  check('rad: chek rejected + sabab', m.checks[0]!.status === 'rejected' && m.checks[0]!.rejectedReason === 'Summa ko\'rinmayapti');
  check('rad: bosqich karta_yuborildi', m.purchases[0]!.stage === 'karta_yuborildi', m.purchases[0]!.stage);
  check('rad: remindedStages karta_yuborildi', m.purchases[0]!.remindedStages.includes('karta_yuborildi'), JSON.stringify(m.purchases[0]!.remindedStages));
  check('rad: agent sabab bilan', JSON.stringify(m.rejects) === JSON.stringify([{ id: 'cv1', reason: 'Summa ko\'rinmayapti' }]));
  check('rad: needsHuman tozalandi', m.suhbat.needsHuman === false);
  check('rad: to\'lov qo\'shilmadi', m.purchases[0]!.paidAmount === 0);
  check('rad: audit', m.audits.some((a) => a.action === 'receipt_review.rejected' && a.payload.reason === 'Summa ko\'rinmayapti'));
}

// ─── 6. Ochiq tekshiruv yo'q / ikki marta bosish / muddati o'tgan ────────
{
  const m = build({ noReview: true });
  check('tekshiruvsiz: confirm no_review', (await m.service.confirmReceipt('cv1', MENEJER, 500_000)).kind === 'no_review');
  check('tekshiruvsiz: reject no_review', (await m.service.rejectReceipt('cv1', MENEJER, 'x')).kind === 'no_review');
  check('tekshiruvsiz: hech narsa o\'zgarmadi', m.purchases[0]!.paidAmount === 0 && m.thanks.length === 0 && m.sends.length === 0);

  const d = build();
  await d.service.confirmReceipt('cv1', MENEJER, 500_000);
  const ikkinchi = await d.service.confirmReceipt('cv1', MENEJER, 500_000);
  check('ikki marta bosish: no_review', ikkinchi.kind === 'no_review');
  check('ikki marta bosish: summa bir marta', d.purchases[0]!.paidAmount === 500_000, String(d.purchases[0]!.paidAmount));

  const e = build({ checkCreatedAt: new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000) });
  check('muddati o\'tgan: no_review', (await e.service.confirmReceipt('cv1', MENEJER, 500_000)).kind === 'no_review');
  check('muddati o\'tgan: bekor qilindi', e.checks[0]!.status === 'cancelled');
}

// ─── 7. Summa aniqlanmagan ──────────────────────────────────────────────
{
  const m = build({ course: null, purchase: { totalAmount: null } });
  const out = await m.service.confirmReceipt('cv1', MENEJER, 700_000);
  check('summasiz: tasdiqlandi, bosqich o\'zgarmadi', out.kind === 'confirmed' && out.stage === 'chek_keldi' && !out.linkSent, JSON.stringify(out));
  check('summasiz: to\'lov qo\'shildi', m.purchases[0]!.paidAmount === 700_000);
  check('summasiz: menejerga aniq sabab', m.suhbat.needsHuman === true && m.suhbat.humanReason === CHEK_SABABLARI.summaYoq, String(m.suhbat.humanReason));
  check('summasiz: rahmat ham, havola ham yo\'q', m.thanks.length === 0 && m.sends.length === 0);

  const k = build({ purchase: { totalAmount: null } });
  const o2 = await k.service.confirmReceipt('cv1', MENEJER, 1_500_000);
  check('total null → kurs narxi: toladi', o2.kind === 'confirmed' && o2.stage === 'toladi', JSON.stringify(o2));
}

// ─── 8. Agent yiqildi / havola ketmadi / kill switch ─────────────────────
{
  const m = build({ agentThrows: true });
  const out = await m.service.confirmReceipt('cv1', MENEJER, 500_000);
  check('agent yiqildi: not_sent agent_error', out.kind === 'not_sent' && out.reason === 'agent_error', JSON.stringify(out));
  check('agent yiqildi: bosqich va havola baribir', m.purchases[0]!.stage === 'qisman_toladi' && m.sends.length === 1);

  const s = build({ sendThrows: true });
  const o2 = await s.service.confirmReceipt('cv1', MENEJER, 500_000);
  check('havola ketmadi: xato otilmadi', o2.kind === 'confirmed' && !o2.linkSent, JSON.stringify(o2));
  check('havola ketmadi: menejerga', s.suhbat.needsHuman === true && s.suhbat.humanReason === "Guruh havolasini yuborib bo'lmadi", String(s.suhbat.humanReason));

  const k = build({ killSwitch: true });
  const o3 = await k.service.confirmReceipt('cv1', MENEJER, 500_000);
  check('kill switch: not_sent', o3.kind === 'not_sent' && o3.reason === 'kill_switch', JSON.stringify(o3));
  check('kill switch: havola belgilanmadi va yuborilmadi', k.purchases[0]!.linkSentAt === null && k.sends.length === 0);
  check('kill switch: summa va bosqich yozildi', k.purchases[0]!.paidAmount === 500_000 && k.purchases[0]!.stage === 'qisman_toladi');
  check('kill switch: menejerga', k.suhbat.needsHuman === true && k.suhbat.humanReason === CHEK_SABABLARI.havolaKetmadi);
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
