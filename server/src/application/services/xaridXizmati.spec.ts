import { XaridXizmati } from '@/application/services/XaridXizmati';
import type { Purchase, XaridBosqichi } from '@/domain/entities/Purchase';
import type { Course } from '@/domain/entities/Course';

/** Qo'lda ishga tushiriladi: npm run test:xarid-xizmati --workspace=server (bazasiz). */
let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

const FAOL = (s: XaridBosqichi): boolean => s !== 'toladi' && s !== 'rad_etdi';

function qurish(boshlang: Array<Partial<Purchase> & { id: string }> = [], setStageXato?: { code: string }) {
  let n = 0;
  const rows: Purchase[] = boshlang.map((p) => ({
    clientId: 'c1', courseId: null, stage: 'yangi', stageChangedAt: new Date(), totalAmount: null,
    paidAmount: 0, installment: false, linkSentAt: null, remindedStages: [], createdAt: new Date(), ...p,
  }));
  const purchases = {
    findActiveByClient: async (c: string) => rows.find((r) => r.clientId === c && FAOL(r.stage)) ?? null,
    findLatestByClient: async (c: string) => [...rows].reverse().find((r) => r.clientId === c) ?? null,
    create: async (d: { clientId: string; courseId: string | null; totalAmount: number | null }) => {
      const r: Purchase = {
        id: `n${++n}`, clientId: d.clientId, courseId: d.courseId, stage: 'yangi', stageChangedAt: new Date(),
        totalAmount: d.totalAmount, paidAmount: 0, installment: false, linkSentAt: null, remindedStages: [],
        createdAt: new Date(),
      };
      rows.push(r);
      return r;
    },
    setStage: async (id: string, stage: XaridBosqichi) => {
      if (setStageXato) throw setStageXato;
      const r = rows.find((x) => x.id === id)!;
      r.stage = stage;
      return r;
    },
    listPaidCourseIds: async (c: string) =>
      rows.filter((r) => r.clientId === c && r.stage === 'toladi' && r.courseId).map((r) => r.courseId as string),
    setCourse: async (id: string, courseId: string, totalAmount: number) => {
      const r = rows.find((x) => x.id === id)!;
      r.courseId = courseId;
      r.totalAmount = totalAmount;
      return r;
    },
  };
  const kurs = { id: 'k1', price: 1000 } as Course;
  const kurs2 = { id: 'k2', price: 2000 } as Course;
  const courses = { findById: async (id: string) => (id === 'k1' ? kurs : id === 'k2' ? kurs2 : null) };
  const events: unknown[] = [];
  const audits: Array<Record<string, unknown>> = [];
  const xizmat = new XaridXizmati(
    purchases as never, courses as never, { publish: (e: unknown) => events.push(e) } as never,
    { record: async (a: Record<string, unknown>) => { audits.push(a); } } as never,
    { now: () => new Date('2026-10-20T00:00:00Z') } as never,
  );
  return { xizmat, rows, events, audits };
}

(async () => {
  {
    const { xizmat, rows, events, audits } = qurish([{ id: 'p1', stage: 'toladi' }]);
    const r = await xizmat.bosqich('c1', 'qiziqdi', 'menejer', 'u1');
    check('menejer: tugallangan xarid qaytariladi (o\'sha id)', [r?.id, r?.stage], ['p1', 'qiziqdi']);
    check('menejer: yangi qator ochilmadi', rows.length, 1);
    check('audit purchase.stage', [audits[0]?.action, audits[0]?.actor], ['purchase.stage', 'u1']);
    check('hodisa client.updated', events, [{ type: 'client.updated', clientId: 'c1' }]);
  }
  {
    const { xizmat, rows } = qurish([{ id: 'p1', stage: 'toladi' }]);
    const r = await xizmat.bosqich('c1', 'toladi', 'menejer');
    check('bir xil bosqich — null, fantom qator yo\'q', [r, rows.length], [null, 1]);
  }
  {
    const { xizmat, rows } = qurish();
    const r = await xizmat.bosqich('c1', 'qiziqdi', 'menejer');
    check('xaridsiz mijoz: bitta yaratiladi', [r?.stage, rows.length], ['qiziqdi', 1]);
  }
  {
    const { xizmat } = qurish([{ id: 'p1', stage: 'toladi' }], { code: '23505' });
    let kod: unknown = null;
    try { await xizmat.bosqich('c1', 'qiziqdi', 'menejer'); } catch (e) { kod = (e as { statusCode?: number }).statusCode; }
    check('unique konflikt — 409', kod, 409);
  }
  {
    const { xizmat, rows } = qurish([{ id: 'p1', stage: 'suhbatda' }]);
    const a = await xizmat.kursBelgila('c1', 'k1');
    check('kursBelgila: suhbatda — belgilandi', [a.courseId, a.totalAmount], ['k1', 1000]);
    rows[0]!.stage = 'karta_yuborildi';
    rows[0]!.courseId = null;
    const b = await xizmat.kursBelgila('c1', 'k1');
    check('kursBelgila: karta yuborilgach o\'zgarmaydi', b.courseId, null);
  }
  // ── Fantom xarid himoyasi (yakuniy sharh, 1-topilma) ──
  {
    const { xizmat, rows } = qurish([{ id: 'p1', stage: 'toladi', courseId: 'k1' }]);
    const r = await xizmat.bosqich('c1', 'qiziqdi', 'agent');
    check('agent: faol xarid yo\'q — bosqich no-op, xarid ochilmadi', [r, rows.length], [null, 1]);
    const t = await xizmat.bosqich('c1', 'suhbatda', 'agent');
    check('agent: suhbatda ham no-op', [t, rows.length], [null, 1]);
  }
  {
    const { xizmat, rows } = qurish([{ id: 'p1', stage: 'suhbatda' }]);
    const r = await xizmat.bosqich('c1', 'qiziqdi', 'agent');
    check('agent: faol xaridda oldinga', [r?.id, r?.stage, rows.length], ['p1', 'qiziqdi', 1]);
  }
  {
    const { xizmat, rows } = qurish([{ id: 'p1', stage: 'toladi', courseId: 'k1' }]);
    const r = await xizmat.agentKursi('c1', 'k1');
    check('agentKursi: to\'langan kursning o\'zi — xarid ochilmadi', [r, rows.length], [null, 1]);
  }
  {
    const { xizmat, rows } = qurish([{ id: 'p1', stage: 'rad_etdi', courseId: 'k1' }]);
    const r = await xizmat.agentKursi('c1', 'k1');
    check('agentKursi: rad etilgan xarid kursi — ochilmadi', [r, rows.length], [null, 1]);
  }
  {
    const { xizmat, rows } = qurish([
      { id: 'p0', stage: 'toladi', courseId: 'k2' },
      { id: 'p1', stage: 'rad_etdi', courseId: 'k1' },
    ]);
    const r = await xizmat.agentKursi('c1', 'k2');
    check('agentKursi: oldin to\'langan (boughtCourses) kurs — ochilmadi', [r, rows.length], [null, 2]);
  }
  {
    const { xizmat, rows } = qurish([{ id: 'p1', stage: 'toladi', courseId: 'k1' }]);
    const r = await xizmat.agentKursi('c1', 'k2');
    check('agentKursi: yangi kurs — yangi xarid shu kurs bilan', [r?.id, r?.courseId, r?.totalAmount, rows.length], ['n1', 'k2', 2000, 2]);
  }
  {
    const { xizmat, rows } = qurish([{ id: 'p1', stage: 'suhbatda', courseId: 'k1' }]);
    const r = await xizmat.agentKursi('c1', 'k2');
    check('agentKursi: faol xaridda kurs almashadi', [r?.id, r?.courseId, rows.length], ['p1', 'k2', 1]);
  }
  console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
  process.exitCode = failed ? 1 : 0;
})();
