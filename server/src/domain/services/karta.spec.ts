import type { Course } from '@/domain/entities/Course';
import type { Purchase } from '@/domain/entities/Purchase';
import { kartaSummasi, kartaTayyorligi, kartaXabari, tanlanganKarta, type PaymentCard } from '@/domain/services/karta';

/** Qo'lda: npm run test:karta --workspace=server */
let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};

const K1: PaymentCard = { id: 'k1', number: '8600111122223333', holder: 'ALIYEV ALI', bank: 'Kapitalbank', active: true };
const K2: PaymentCard = { id: 'k2', number: '8600444455556666', holder: 'VALIYEV VALI', bank: 'Ipoteka', active: true };
const K3: PaymentCard = { id: 'k3', number: '8600777788889999', holder: 'KARIMOV KARIM', bank: 'Xalq', active: true };

const COURSE: Course = {
  id: 'c1', name: 'Kurs', description: null, salesStart: '2026-01-01', salesEnd: '2026-12-31', price: 1_500_000,
  duration: null, topics: [], startsOn: null, groupLink: null, isActive: true,
  installmentAllowed: false, installmentParts: null, installmentFirstMin: null, linkAfter: 'toliq',
};
const COURSE_BT: Course = { ...COURSE, installmentAllowed: true, installmentParts: 3, installmentFirstMin: 500_000, linkAfter: 'birinchi_qism' };
const P: Purchase = {
  id: 'p1', clientId: 'cl1', courseId: 'c1', stage: 'qiziqdi', stageChangedAt: new Date(0),
  totalAmount: 1_500_000, paidAmount: 0, installment: false, linkSentAt: null, remindedStages: [], createdAt: new Date(0),
};

check('birinchi faol', tanlanganKarta([{ ...K1, active: false }, K2, K3])?.id, K2.id);
check("faol yo'q", tanlanganKarta([{ ...K1, active: false }]), null);
check("to'liq — xariddagi summa, kurs narxi emas", kartaSummasi({ ...COURSE, price: 2_000_000 }, { ...P, totalAmount: 1_500_000 }), 1_500_000);
check("to'liq — totalAmount null bo'lsa kurs narxi", kartaSummasi(COURSE, { ...P, totalAmount: null }), 1_500_000);
check('birinchi qism', kartaSummasi(COURSE_BT, { ...P, installment: true, paidAmount: 0 }), 500_000);
check('keyingi qism', kartaSummasi(COURSE_BT, { ...P, installment: true, paidAmount: 500_000 }), null);
check("kurs yo'q", kartaTayyorligi({ cards: [K2], course: null, purchase: P }), { ok: false, reason: 'kurs_yoq' });
check("karta yo'q", kartaTayyorligi({ cards: [], course: COURSE, purchase: P }), { ok: false, reason: 'karta_yoq' });
check("bo'lib to'lash ruxsat emas", kartaTayyorligi({ cards: [K2], course: COURSE, purchase: { ...P, installment: true } }), { ok: false, reason: 'bolib_tolash_yoq' });
check('tayyor', kartaTayyorligi({ cards: [K2], course: COURSE, purchase: P }), { ok: true, card: K2, amount: 1_500_000 });
check('matn', kartaXabari({ id: 'a', number: '8600123456789012', holder: 'ALIYEV ALI', bank: 'Kapitalbank', active: true }, 1_500_000),
  "To'lov uchun karta:\n8600 1234 5678 9012\nEgasi: ALIYEV ALI\nBank: Kapitalbank\nSumma: 1 500 000 so'm");
check('summasiz', kartaXabari(K2, null).includes('Summa'), false);
check('raqam bo\'shliqlari tozalanadi', kartaXabari({ ...K2, number: '8600 4444 5555 6666' }, null).includes('8600 4444 5555 6666'), true);

if (failed) {
  console.error(`\n${failed} ta test yiqildi`);
  process.exitCode = 1;
} else {
  console.log('\nHammasi o\'tdi');
}
