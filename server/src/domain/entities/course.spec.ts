import { sotuvdagiKurslar, keyingiKurs, type Course } from '@/domain/entities/Course';

/** Qo'lda: npm run test:course --workspace=server */
let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};
const BASE: Course = {
  id: 'b', name: 'Kurs', description: null, salesStart: '2026-11-01', salesEnd: '2026-11-30',
  price: 1_500_000, duration: null, topics: [], startsOn: null, groupLink: null, isActive: true,
  installmentAllowed: false, installmentParts: null, installmentFirstMin: null, linkAfter: 'toliq',
};
const k = (id: string, s: string, e: string, active = true): Course => ({ ...BASE, id, salesStart: s, salesEnd: e, isActive: active });
const C = [k('nov', '2026-11-01', '2026-11-30'), k('dek', '2026-12-01', '2026-12-31'), k('off', '2026-11-01', '2026-11-30', false)];
check('davr boshi kiradi', sotuvdagiKurslar(C, '2026-11-01').map((c) => c.id), ['nov']);
check('davr oxiri kiradi', sotuvdagiKurslar(C, '2026-11-30').map((c) => c.id), ['nov']);
check('faol emas chiqmaydi', sotuvdagiKurslar(C, '2026-11-15').some((c) => c.id === 'off'), false);
check('ikki kurs bir vaqtda', sotuvdagiKurslar([...C, k('x', '2026-11-20', '2026-12-05')], '2026-12-01').map((c) => c.id), ['x', 'dek']);
check("sotuvda yo'q", sotuvdagiKurslar(C, '2027-01-02'), []);
check('keyingi kurs', keyingiKurs(C, '2026-10-20')?.id, 'nov');
check("keyingi yo'q", keyingiKurs(C, '2027-01-02'), null);
check('keyingi: bugun boshlansa emas', keyingiKurs(C, '2026-11-01')?.id, 'dek');
check('keyingi: faol emas hisobga olinmaydi', keyingiKurs([k('off', '2026-11-01', '2026-11-30', false)], '2026-10-20'), null);
check('bir xil salesStart: id bo\'yicha', sotuvdagiKurslar([k('b', '2026-11-01', '2026-11-30'), k('a', '2026-11-01', '2026-11-30')], '2026-11-02').map((c) => c.id), ['a', 'b']);
console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
