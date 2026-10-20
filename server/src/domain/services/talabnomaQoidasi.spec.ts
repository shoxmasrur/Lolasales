import type { Bayram } from '@/domain/entities/bayram';
import { ikkiOyTushmagan, ishKuniQosh, talabnomaMuddatlari } from '@/domain/services/talabnomaQoidasi';

/** Qo'lda: npm run test:talabnoma-qoidasi --workspace=server */
let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};
const oy = (dateIso: string, amount: number, paid: number, type = 'monthly') => ({
  dateIso,
  amount,
  paid,
  status: paid >= amount ? 'paid' : paid > 0 ? 'partially' : 'waiting',
  type,
});
const T = '2026-10-16';
check("oxirgi ikki oy to'lanmagan", ikkiOyTushmagan([oy('2026-08-01', 5e6, 5e6), oy('2026-09-01', 5e6, 0), oy('2026-10-01', 5e6, 0), oy('2026-11-01', 5e6, 0)], T), true);
check("biri qisman → yo'q", ikkiOyTushmagan([oy('2026-09-01', 5e6, 0), oy('2026-10-01', 5e6, 3e6)], T), false);
check("eski oylar to'lanmagan, oxirgilari to'langan → yo'q", ikkiOyTushmagan([oy('2026-06-01', 5e6, 0), oy('2026-07-01', 5e6, 0), oy('2026-09-01', 5e6, 5e6), oy('2026-10-01', 5e6, 5e6)], T), false);
check("faqat bitta o'tgan oy → yo'q", ikkiOyTushmagan([oy('2026-10-01', 5e6, 0), oy('2026-11-01', 5e6, 0)], T), false);
check("bugungi sana hali o'tmagan", ikkiOyTushmagan([oy('2026-09-01', 5e6, 0), oy('2026-10-16', 5e6, 0)], T), false);
check("hisoblagich va boshlang'ich e'tiborsiz", ikkiOyTushmagan([oy('2026-09-01', 5e6, 0), oy('2026-09-15', 1e5, 0, 'meter'), oy('2026-10-01', 5e6, 0), oy('2026-10-05', 1e6, 0, 'initial_payment')], T), true);
check('amount 0 qatori sanalmaydi', ikkiOyTushmagan([oy('2026-09-01', 5e6, 0), oy('2026-10-01', 0, 0)], T), false);
// CRM ba'zan oyni `paid` deb belgilaydi-yu `paid` summasini 0 qoldiradi
// (masalan, chegirma yoki boshqa shartnomadan o'tkazma) — u oy yopilgan.
check("status 'paid', paid 0 → yo'q", ikkiOyTushmagan([{ ...oy('2026-09-01', 5e6, 0), status: 'paid' }, { ...oy('2026-10-01', 5e6, 0), status: 'paid' }], T), false);
check("bittasi status 'paid', paid 0 → yo'q", ikkiOyTushmagan([oy('2026-09-01', 5e6, 0), { ...oy('2026-10-01', 5e6, 0), status: 'paid' }], T), false);
check('tartibsiz kelgan jadval', ikkiOyTushmagan([oy('2026-10-01', 5e6, 0), oy('2026-06-01', 5e6, 5e6), oy('2026-09-01', 5e6, 0)], T), true);
// 2026-10-16 juma. +3 ish kuni: 19,20,21 → 21 (chorshanba); +5: 22,23,26,27,28 → 28.
check('muddatlar', talabnomaMuddatlari('2026-10-16', []), { kuchgaKirishIso: '2026-10-21', muddatIso: '2026-10-28' });
const bayram: Bayram = { id: 'b1', name: 'Test', startsOn: '2026-10-20', endsOn: '2026-10-20', yillik: false };
check("bayram o'tkaziladi", ishKuniQosh('2026-10-16', 3, [bayram]), '2026-10-22');
check('boshning o\'zi sanalmaydi', ishKuniQosh('2026-10-16', 1, []), '2026-10-19');
console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
