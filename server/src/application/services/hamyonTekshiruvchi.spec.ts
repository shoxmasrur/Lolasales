import { HamyonTekshiruvchi } from '@/application/services/HamyonTekshiruvchi';
import type { HamyonTushum } from '@/domain/services/hamyonMosligi';
import type { HamyonChek } from '@/infrastructure/db/repositories/PgHamyonRepository';

/**
 * Qo'lda ishga tushiriladi: npm run test:hamyon-tekshiruvchi --workspace=server
 *
 * Fake'lar bilan: mos tushum → chek tasdiqlanadi; shubha va kutish tugashi →
 * menejerga + admin botiga; kutish davomida jim; o'chiq/kill switch → hech narsa;
 * Hamyoncha ishlamasa → kutish tugagach admin xabardor.
 */
let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

const HOZIR = new Date('2026-11-19T10:00:00Z');
const daqOldin = (m: number): Date => new Date(HOZIR.getTime() - m * 60_000);

function qur(o: {
  chekYoshiDaq: number;
  tushumlar?: HamyonTushum[] | Error;
  band?: string[];
  yoqilgan?: boolean;
  killSwitch?: boolean;
  tasdiqNatijasi?: string;
  /** Chekdan o'qilgan ma'lumot; berilmasa — tushumga mos (200 000, 14:55, karta 2996). */
  receiptInfo?: { amount: number | null; paidAt: string | null; card4: string | null } | null;
}) {
  const chek: HamyonChek = {
    id: 'ch1', conversationId: 'cv1', clientId: 'cl1', purchaseId: 'p1', createdAt: daqOldin(o.chekYoshiDaq),
    // Tushum 09:55Z (HOZIR - 5 daq) = mahalliy 14:55.
    receiptInfo: o.receiptInfo === undefined ? { amount: 200_000, paidAt: '2026-11-19 14:55', card4: '2996' } : o.receiptInfo,
  };
  const mijozXabarlari: string[] = [];
  const log = { tasdiq: [] as Array<[string, string, number]>, update: [] as unknown[], xabar: [] as string[], holat: [] as unknown[], egalla: [] as string[], bosh: [] as string[] };
  const servis = new HamyonTekshiruvchi(
    { kirimlar: async () => { if (o.tushumlar instanceof Error) throw o.tushumlar; return o.tushumlar ?? []; } },
    {
      kutayotganCheklar: async () => [chek],
      bandIdlar: async () => new Set(o.band ?? []),
      egalla: async (id: string) => { log.egalla.push(id); return true; },
      bosh: async (id: string) => { log.bosh.push(id); },
      holat: async (...a: unknown[]) => { log.holat.push(a); },
    } as never,
    { confirmReceipt: async (c: string, a: string, s: number) => { log.tasdiq.push([c, a, s]); return { kind: o.tasdiqNatijasi ?? 'confirmed' }; } } as never,
    { findById: async () => ({ id: 'p1', courseId: 'k1', installment: true, paidAmount: 0, totalAmount: null, stage: 'chek_keldi' }) } as never,
    { findById: async () => ({ id: 'k1', price: 300_000, installmentFirstMin: 200_000, installmentAllowed: true }) } as never,
    { update: async (...a: unknown[]) => { log.update.push(a); } } as never,
    { findById: async () => ({ id: 'cl1', fullName: 'Sinov Mijoz' }) } as never,
    { xabarYubor: async (m: string) => { log.xabar.push(m); return true; } },
    {
      get: async () => ({
        hamyonYoqilgan: o.yoqilgan ?? true, hamyonKutishDaq: 30, killSwitch: o.killSwitch ?? false,
        paymentCards: [{ id: 'k', number: '4073420068052996', holder: 'X', bank: 'Y', active: true }],
      }),
    } as never,
    { record: async () => undefined } as never,
    { publish: () => undefined } as never,
    { now: () => HOZIR, todayIso: () => '2026-11-19' } as never,
    async (_c: string, matn: string) => { mijozXabarlari.push(matn); },
  );
  return { servis, log, mijozXabarlari };
}

async function main(): Promise<void> {
  {
    const { servis, log } = qur({ chekYoshiDaq: 2, tushumlar: [{ id: 't1', amount: 200_000, date: daqOldin(5) }] });
    const hal = await servis.bajar();
    check('mos tushum → tasdiqlandi', [hal, log.tasdiq], [1, [['cv1', 'hamyoncha', 200_000]]]);
    check('tushum chekka biriktirildi', log.egalla, ['t1']);
    check('muvaffaqiyatda admin bezovta qilinmaydi', log.xabar.length, 0);
  }
  {
    const { servis, log } = qur({ chekYoshiDaq: 2, tushumlar: [{ id: 't1', amount: 200_000, date: daqOldin(5) }], band: ['t1'] });
    await servis.bajar();
    check('takroriy chek → tasdiqlanmadi, menejerga + admin', [log.tasdiq.length, log.update.length, log.xabar.length], [0, 1, 1]);
    check('admin xabarida mijoz nomi bor', log.xabar[0]?.includes('Sinov Mijoz'), true);
  }
  {
    const { servis, log } = qur({ chekYoshiDaq: 5, tushumlar: [] });
    const hal = await servis.bajar();
    check("pul hali yo'q, kutish tugamagan → jim kutadi", [hal, log.tasdiq.length, log.xabar.length, log.update.length], [0, 0, 0, 0]);
  }
  {
    const { servis, log } = qur({ chekYoshiDaq: 31, tushumlar: [] });
    const hal = await servis.bajar();
    check("kutish tugadi, pul yo'q → admin", [hal, log.xabar.length, log.update.length], [1, 1, 1]);
  }
  {
    const { servis, log } = qur({ chekYoshiDaq: 2, tushumlar: [{ id: 't1', amount: 150_000, date: daqOldin(5) }] });
    await servis.bajar();
    check('summa mos emas, kutish davom etadi → jim', [log.tasdiq.length, log.xabar.length], [0, 0]);
  }
  {
    const { servis, log } = qur({ chekYoshiDaq: 31, tushumlar: new Error('HTTP 500') });
    await servis.bajar();
    check('Hamyoncha ishlamayapti va kutish tugagan → admin', [log.xabar.length, log.update.length], [1, 1]);
  }
  {
    const { servis, log } = qur({ chekYoshiDaq: 2, tushumlar: new Error('HTTP 500') });
    const hal = await servis.bajar();
    check('Hamyoncha ishlamayapti, hali erta → jim', [hal, log.xabar.length], [0, 0]);
  }
  {
    const { servis, log } = qur({ chekYoshiDaq: 2, tushumlar: [{ id: 't1', amount: 200_000, date: daqOldin(5) }], yoqilgan: false });
    check("o'chiq → hech narsa", [await servis.bajar(), log.tasdiq.length], [0, 0]);
  }
  {
    const { servis, log } = qur({ chekYoshiDaq: 2, tushumlar: [{ id: 't1', amount: 200_000, date: daqOldin(5) }], killSwitch: true });
    check('kill switch → hech narsa', [await servis.bajar(), log.tasdiq.length], [0, 0]);
  }
  {
    const { servis, log } = qur({ chekYoshiDaq: 2, tushumlar: [{ id: 't1', amount: 200_000, date: daqOldin(5) }], tasdiqNatijasi: 'needs_human' });
    await servis.bajar();
    check("tasdiq bo'ldi, lekin havola/rahmat ketmadi → admin xabardor", log.xabar.length, 1);
  }
  {
    const { servis, log } = qur({ chekYoshiDaq: 2, tushumlar: [{ id: 't1', amount: 200_000, date: daqOldin(5) }], tasdiqNatijasi: 'no_review' });
    await servis.bajar();
    check("menejer shu orada yopgan → tushum bo'shatildi", [log.bosh, log.xabar.length], [['t1'], 0]);
  }

  const T = [{ id: 't1', amount: 200_000, date: daqOldin(5) }];
  {
    const { servis, log, mijozXabarlari } = qur({ chekYoshiDaq: 2, tushumlar: T, receiptInfo: { amount: 700_000, paidAt: '2026-11-19 14:55', card4: '2996' } });
    await servis.bajar();
    check("chekdagi summa Hamyonchadan farq qiladi → tasdiqlanmadi, admin + mijozga neutral xabar", [log.tasdiq.length, log.xabar.length, mijozXabarlari.length], [0, 1, 1]);
    check('admin xabarida ikki summa ham bor', [log.xabar[0]?.includes('700000'), log.xabar[0]?.includes('200000')], [true, true]);
    check('mijozga ayblovsiz matn', mijozXabarlari[0]?.includes('tekshiryapmiz'), true);
  }
  {
    const { servis, log } = qur({ chekYoshiDaq: 2, tushumlar: T, receiptInfo: { amount: 200_000, paidAt: '2026-11-19 14:55', card4: '1111' } });
    await servis.bajar();
    check('chekdagi karta bizniki emas → shubha', [log.tasdiq.length, log.xabar.length], [0, 1]);
  }
  {
    const { servis, log } = qur({ chekYoshiDaq: 2, tushumlar: T, receiptInfo: { amount: 200_000, paidAt: '2026-11-19 12:00', card4: '2996' } });
    await servis.bajar();
    check('chekdagi vaqt tushum vaqtidan ancha farq qiladi → shubha', [log.tasdiq.length, log.xabar.length], [0, 1]);
  }
  {
    const { servis, log } = qur({ chekYoshiDaq: 2, tushumlar: T, receiptInfo: null });
    await servis.bajar();
    check("chek o'qilmadi (ma'lumot yo'q) → avtomatik tasdiqlanmaydi, admin", [log.tasdiq.length, log.xabar.length], [0, 1]);
  }
  {
    const { servis, log } = qur({ chekYoshiDaq: 2, tushumlar: T, receiptInfo: { amount: 200_000, paidAt: null, card4: null } });
    await servis.bajar();
    check("karta va vaqt chekda ko'rinmasa — faqat summa solishtiriladi → tasdiqlandi", log.tasdiq.length, 1);
  }

  if (failed) {
    console.error(`\n${failed} ta tekshiruv muvaffaqiyatsiz`);
    process.exit(1);
  }
  console.log("\nHammasi o'tdi");
}

void main();
