import { NotogriKirish, QongiroqNatijasi, type QongiroqNatijasiDeps } from '@/application/services/QongiroqNatijasi';
import { ShartnomaTopilmadi } from '@/application/services/QongiroqBrifi';
import type { PhoneCall } from '@/domain/entities/PhoneCall';
import type { PhoneCallUpsert } from '@/domain/repositories/IPhoneCallRepository';

/** Qo'lda ishga tushiriladi: npm run test:qongiroq-natijasi --workspace=server */
let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

const SHARTNOMA = { id: 'ct1', clientId: 'cl1', contractNo: '5582MSO25F3', virtualStatus: 'sold', debtFirst: 0, debtMonthly: 17_356_000 };

function muhit(o: { suhbat?: boolean; ochiq?: { id: string; promisedDate: Date; amount: number } | null; shartnomalar?: unknown[]; mavjud?: Record<string, unknown> } = {}) {
  const qatorlar = new Map<string, PhoneCall>();
  const vadalar: Array<Record<string, unknown>> = [];
  const bekor: string[] = [];
  let id = 0;
  const deps = {
    phoneCalls: {
      findByExternal: async (u: string, e: string) => qatorlar.get(`${u}|${e}`) ?? null,
      upsert: async (d: PhoneCallUpsert) => {
        const kalit = `${d.createdByUserId}|${d.externalId}`;
        const eski = qatorlar.get(kalit);
        const p = { ...d, id: eski?.id ?? `pc${++id}`, promiseId: eski?.promiseId ?? null,
          createdAt: new Date(), updatedAt: new Date() } as unknown as PhoneCall;
        qatorlar.set(kalit, p);
        return p;
      },
      setPromiseId: async (pid: string, promiseId: string | null) => {
        for (const [k, v] of qatorlar) if (v.id === pid) qatorlar.set(k, { ...v, promiseId });
      },
    },
    contracts: {
      findByContractNo: async (no: string) => (no === '5582MSO25F3' ? SHARTNOMA : null),
      findByClientId: async () => o.shartnomalar ?? [SHARTNOMA],
    },
    conversations: { findByClientId: async () => (o.suhbat === false ? null : { id: 'cv1', clientId: 'cl1' }) },
    promises: {
      findActiveByConversation: async () => o.ochiq ?? null,
      findById: async (pid: string) => (o.mavjud?.[pid] ?? null),
      updateStatus: async (pid: string) => { bekor.push(pid); },
      create: async (d: Record<string, unknown>) => { vadalar.push(d); return { id: `pr${vadalar.length}`, ...d }; },
    },
    clock: { todayIso: () => '2026-10-14' },
  } as unknown as QongiroqNatijasiDeps;
  return { xizmat: new QongiroqNatijasi(deps), qatorlar, vadalar, bekor };
}

const asos = {
  shartnoma_raqami: '5582MSO25F3', qongiroq_id: 'call-1', agent_kaliti: 'madina-orzular', agent_ismi: 'Madina',
  boshlandi: '2026-10-14T05:00:00Z', davomiylik_soniya: 95, natija: 'gaplashildi' as const,
  xulosa: 'Juma kuni to\'lashini aytdi', vada: { kun: '2026-10-17', summa: 8_339_000 },
};
const xatoNomi = async (fn: () => Promise<unknown>): Promise<string> => {
  try { await fn(); return 'xato yo\'q'; } catch (e) { return e instanceof Error ? e.name : String(e); }
};

// ─── Saqlash va va'da ─────────────────────────────────────────────────────
{
  const m = muhit();
  const j = await m.xizmat.yoz(asos, 'u1');
  check('yangi qator', j, { qongiroq_id: 'call-1', saqlandi: 'yangi', vada: 'yozildi' });
  check('va\'da Telegram suhbatiga', [m.vadalar[0]?.conversationId, m.vadalar[0]?.source, m.vadalar[0]?.amount], ['cv1', 'phone', 8_339_000]);
  check('va\'da call_id bilan', m.vadalar[0]?.callId, 'pc1');
  check('qatorga promiseId yozildi', [...m.qatorlar.values()][0]?.promiseId, 'pr1');

  // Review Focus 1: takroriy yuborish.
  const j2 = await m.xizmat.yoz({ ...asos, xulosa: 'Juma to\'laydi (tuzatilgan)' }, 'u1');
  check('takror — yangilandi', j2.saqlandi, 'yangilandi');
  check('takror — bitta qator', m.qatorlar.size, 1);
  check('takror — ikkinchi va\'da yo\'q', m.vadalar.length, 1);
}

// Review Focus 2: Telegramdagi ochiq va'da bilan bir xil / farqli.
{
  const m = muhit({ ochiq: { id: 'old', promisedDate: new Date('2026-10-17T00:00:00Z'), amount: 8_339_000 } });
  check('bir xil va\'da — o\'zgarmadi', (await m.xizmat.yoz(asos, 'u1')).vada, 'ozgarmadi');
  check('bir xil — bekor qilinmadi, yaratilmadi', [m.bekor, m.vadalar.length], [[], 0]);
  check('bir xil — qator mavjud va\'daga bog\'landi', [...m.qatorlar.values()][0]?.promiseId, 'old');
}
{
  const m = muhit({ ochiq: { id: 'old', promisedDate: new Date('2026-10-15T00:00:00Z'), amount: 8_339_000 } });
  await m.xizmat.yoz(asos, 'u1');
  check('farqli — eskisi bekor', m.bekor, ['old']);
  check('farqli — yangisi yozildi', m.vadalar.length, 1);
}

// Review Focus 3: summa berilmagan.
{
  const m = muhit();
  await m.xizmat.yoz({ ...asos, vada: { kun: '2026-10-17' } }, 'u1');
  check('summasiz — kechikkan summa olinadi', m.vadalar[0]?.amount, 17_356_000);
}
{
  const m = muhit({ shartnomalar: [{ ...SHARTNOMA, debtMonthly: 0 }] });
  const j = await m.xizmat.yoz({ ...asos, vada: { kun: '2026-10-17' } }, 'u1');
  check('summasiz va kechikish 0 — faqat qo\'ng\'iroqda', [j.vada, m.vadalar.length], ['faqat_qongiroqda', 0]);
}

// Ko'p shartnoma: va'da mijoz bo'yicha (contractId null), bittada — shartnoma bo'yicha.
{
  const m = muhit({ shartnomalar: [SHARTNOMA, { ...SHARTNOMA, id: 'ct2', contractNo: 'X2' }] });
  await m.xizmat.yoz({ ...asos, vada: { kun: '2026-10-17' } }, 'u1');
  check('ikki shartnoma — contractId null, summa jami', [m.vadalar[0]?.contractId, m.vadalar[0]?.amount], [null, 34_712_000]);
}
{
  const m = muhit();
  await m.xizmat.yoz(asos, 'u1');
  check('bitta shartnoma — contractId ct1', m.vadalar[0]?.contractId, 'ct1');
}

// Suhbatsiz mijoz.
{
  const m = muhit({ suhbat: false });
  const j = await m.xizmat.yoz(asos, 'u1');
  check('suhbatsiz — faqat qo\'ng\'iroqda', [j.vada, m.vadalar.length], ['faqat_qongiroqda', 0]);
  check('suhbatsiz — va\'da qatorda saqlandi', [...m.qatorlar.values()][0]?.promiseDate, '2026-10-17');
}

// Qayta yuborishda va'da olib tashlansa — shu qo'ng'iroq yaratgan ochiq va'da bekor qilinadi.
{
  const m = muhit({ mavjud: { pr1: { id: 'pr1', status: 'pending', callId: 'pc1' } } });
  await m.xizmat.yoz(asos, 'u1');
  const j = await m.xizmat.yoz({ ...asos, vada: undefined }, 'u1');
  check('va\'da qaytarib olindi — bekor qilindi', [j.vada, m.bekor], ['yoq', ['pr1']]);
  check('va\'da qaytarib olindi — qatordan promiseId olindi', [...m.qatorlar.values()][0]?.promiseId, null);
}
{
  const m = muhit({ mavjud: { pr1: { id: 'pr1', status: 'pending', callId: 'boshqa-qongiroq' } } });
  await m.xizmat.yoz(asos, 'u1');
  await m.xizmat.yoz({ ...asos, vada: undefined }, 'u1');
  check('boshqa qo\'ng\'iroq va\'dasiga tegilmaydi', m.bekor, []);
}
{
  const m = muhit({ mavjud: { pr1: { id: 'pr1', status: 'kept', callId: 'pc1' } } });
  await m.xizmat.yoz(asos, 'u1');
  await m.xizmat.yoz({ ...asos, vada: undefined }, 'u1');
  check('yopilgan va\'da bekor qilinmaydi', m.bekor, []);
}

// boshlandi — vaqt zonasi bilan to'liq ISO 8601.
{
  const m = muhit();
  const t = (boshlandi: string) => xatoNomi(() => m.xizmat.yoz({ ...asos, qongiroq_id: `b-${boshlandi}`, boshlandi, vada: undefined, natija: 'band' as const, xulosa: undefined }, 'u1'));
  check('boshlandi Z — qabul', await t('2026-10-14T05:00:00Z'), 'xato yo\'q');
  check('boshlandi +05:00 — qabul', await t('2026-10-14T10:00:00+05:00'), 'xato yo\'q');
  check('boshlandi "1" — rad', await t('1'), 'NotogriKirish');
  check('boshlandi faqat sana — rad', await t('2026-10-14'), 'NotogriKirish');
  check('boshlandi zonasiz — rad', await t('2026-10-14T05:00:00'), 'NotogriKirish');
  check('boshlandi yaroqsiz oy — rad', await t('2026-13-14T05:00:00Z'), 'NotogriKirish');
}

// Va'dasiz.
{
  const m = muhit();
  const j = await m.xizmat.yoz({ ...asos, natija: 'kotarmadi', xulosa: undefined, vada: undefined }, 'u1');
  check('ko\'tarmadi — va\'da yo\'q', j.vada, 'yoq');
}

// Review Focus 4: noto'g'ri kirish — hech narsa yozilmaydi.
{
  const m = muhit();
  check('topilmadi', await xatoNomi(() => m.xizmat.yoz({ ...asos, shartnoma_raqami: '0000' }, 'u1')), 'ShartnomaTopilmadi');
  check('gaplashildi xulosasiz', await xatoNomi(() => m.xizmat.yoz({ ...asos, xulosa: '  ' }, 'u1')), 'NotogriKirish');
  check('o\'tgan kunga va\'da', await xatoNomi(() => m.xizmat.yoz({ ...asos, vada: { kun: '2026-10-13' } }, 'u1')), 'NotogriKirish');
  check('121 kun keyin', await xatoNomi(() => m.xizmat.yoz({ ...asos, vada: { kun: '2027-02-12' } }, 'u1')), 'NotogriKirish');
  check('120 kun — qabul', await xatoNomi(() => muhit().xizmat.yoz({ ...asos, vada: { kun: '2027-02-11' } }, 'u1')), 'xato yo\'q');
  check('noto\'g\'ri sana', await xatoNomi(() => m.xizmat.yoz({ ...asos, boshlandi: 'kecha' }, 'u1')), 'NotogriKirish');
  check('manfiy summa', await xatoNomi(() => m.xizmat.yoz({ ...asos, vada: { kun: '2026-10-17', summa: -5 } }, 'u1')), 'NotogriKirish');
  check('band + vada', await xatoNomi(() => m.xizmat.yoz({ ...asos, natija: 'band' }, 'u1')), 'NotogriKirish');
  check('xatolardan keyin hech narsa yozilmadi', [m.qatorlar.size, m.vadalar.length], [0, 0]);
  check('ShartnomaTopilmadi turi', ShartnomaTopilmadi.name, 'ShartnomaTopilmadi');
  check('NotogriKirish turi', NotogriKirish.name, 'NotogriKirish');
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
