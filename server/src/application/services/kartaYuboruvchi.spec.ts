import { KartaYuboruvchi, KARTANI_YUBORING, SABAB_MATNI } from '@/application/services/KartaYuboruvchi';
import type { MessageDispatcher } from '@/application/services/MessageDispatcher';
import type { RuntimeSettings } from '@/application/services/RuntimeSettings';
import type { XaridXizmati } from '@/application/services/XaridXizmati';
import type { Course } from '@/domain/entities/Course';
import type { Purchase } from '@/domain/entities/Purchase';
import type { ConversationPatch, IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { ICourseRepository } from '@/domain/repositories/ICourseRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IEventBus } from '@/domain/services/support';

/**
 * Qo'lda ishga tushiriladi: npm run test:karta-yuboruvchi --workspace=server (bazasiz).
 *
 * `KartaYuboruvchi.yubor` — agent navbati ham, menejerning "Kartani yuborish"
 * tugmasi (`POST /conversations/:id/send-card`) ham shu yo'ldan:
 *   • faol xarid yo'q — yangi xarid OCHILMAYDI, `kurs_yoq`, menejerga;
 *   • faol xarid + kurs + karta — karta ketadi, bosqich `karta_yuborildi`;
 *   • karta kutib menejerda turgan suhbat — muvaffaqiyatdan keyin eskalatsiya yechiladi;
 *   • boshqa sabab bilan menejerdagi suhbat — eskalatsiyaga tegilmaydi.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

const KURS = { id: 'k1', price: 1_500_000, installmentAllowed: false, installmentFirstMin: null } as unknown as Course;
const KARTA = { id: 'kr1', number: '8600123456789012', holder: 'ALIYEV ALI', bank: 'Kapitalbank', active: true };

function build(o: { faol: Partial<Purchase> | null; suhbat?: Record<string, unknown>; kartalar?: unknown[] }) {
  const yuborilgan: string[] = [];
  const bosqichlar: string[] = [];
  const patchlar: ConversationPatch[] = [];
  let ochildi = 0;
  const xarid = {
    faol: async () => (o.faol ? ({ id: 'p1', paidAmount: 0, installment: false, totalAmount: 1_500_000, ...o.faol } as Purchase) : null),
    faolXarid: async () => { ochildi += 1; return { id: 'yangi' }; },
    bosqich: async (_c: string, st: string, aktor: string) => void bosqichlar.push(`${st}:${aktor}`),
  } as unknown as XaridXizmati;
  const k = new KartaYuboruvchi(
    { get: async () => ({ paymentCards: o.kartalar ?? [KARTA] }) } as unknown as RuntimeSettings,
    { findById: async (id: string) => (id === KURS.id ? KURS : null) } as unknown as ICourseRepository,
    xarid,
    {
      findById: async () => ({ id: 'cv1', clientId: 'c1', needsHuman: false, humanReason: null, ...o.suhbat }),
      update: async (_id: string, p: ConversationPatch) => void patchlar.push(p),
    } as unknown as IConversationRepository,
    { send: async ({ body }: { body: string }) => void yuborilgan.push(body) } as unknown as MessageDispatcher,
    { record: async () => undefined } as unknown as IAuditRepository,
    { publish: () => undefined } as unknown as IEventBus,
  );
  return { k, yuborilgan, bosqichlar, patchlar, ochildi: () => ochildi };
}

(async () => {
  {
    const m = build({ faol: null });
    const r = await m.k.yubor('cv1', 'c1');
    check('faol xarid yo\'q — kurs_yoq', !r.sent && r.reason === 'kurs_yoq', JSON.stringify(r));
    check('faol xarid yo\'q — yangi xarid ochilmadi', m.ochildi() === 0);
    check('faol xarid yo\'q — karta ketmadi', m.yuborilgan.length === 0);
    check('faol xarid yo\'q — menejerga sabab', m.patchlar.some((p) => p.needsHuman === true && p.humanReason === SABAB_MATNI.kurs_yoq));
  }
  {
    const m = build({ faol: { stage: 'qiziqdi', courseId: null } });
    const r = await m.k.yubor('cv1', 'c1');
    check('kurssiz faol xarid — kurs_yoq', !r.sent && r.reason === 'kurs_yoq');
  }
  {
    const m = build({ faol: { stage: 'qiziqdi', courseId: 'k1' }, kartalar: [] });
    const r = await m.k.yubor('cv1', 'c1');
    check('faol karta yo\'q — karta_yoq', !r.sent && r.reason === 'karta_yoq');
  }
  {
    const m = build({ faol: { stage: 'qiziqdi', courseId: 'k1' }, suhbat: { needsHuman: true, humanReason: KARTANI_YUBORING } });
    const r = await m.k.yubor('cv1', 'c1');
    check('karta ketdi', r.sent && m.yuborilgan.length === 1 && m.yuborilgan[0]!.includes('8600 1234 5678 9012'), JSON.stringify(m.yuborilgan));
    check('bosqich karta_yuborildi (tizim)', m.bosqichlar.join() === 'karta_yuborildi:tizim', m.bosqichlar.join());
    check('"kartani yuboring" eskalatsiyasi yechildi', m.patchlar.some((p) => p.needsHuman === false && p.humanReason === null), JSON.stringify(m.patchlar));
  }
  {
    const m = build({ faol: { stage: 'qiziqdi', courseId: 'k1' }, suhbat: { needsHuman: true, humanReason: 'pulni qaytarish talabi' } });
    await m.k.yubor('cv1', 'c1');
    check('boshqa sababli eskalatsiyaga tegilmadi', !m.patchlar.some((p) => p.needsHuman === false), JSON.stringify(m.patchlar));
  }
  console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
  process.exitCode = failed ? 1 : 0;
})();
