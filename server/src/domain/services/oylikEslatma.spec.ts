import {
  boshlanishSanasi,
  eslatmaMalumoti,
  eslatmaQarori,
  ertami,
  kunQosh,
  oldingiIshKuniga,
  oynadami,
  qatorKaliti,
  type EslatmaQoidalari,
  type JadvalQatori,
} from '@/domain/services/oylikEslatma';
import type { Bayram } from '@/domain/entities/bayram';

/**
 * Qo'lda ishga tushiriladi: npm run test:oylik-eslatma --workspace=server
 *
 * Bazasiz: faqat sana va guruh qarorlari.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : ` — ${izoh}`}`);
};

const MUSTAQILLIK: Bayram = { id: 'b1', name: 'Mustaqillik', startsOn: '2026-09-01', endsOn: '2026-09-01', yillik: false };
const Q: EslatmaQoidalari = { oldinKun: 2, keyinKun: 0, bayramlar: [MUSTAQILLIK], weekdays: [1, 2, 3, 4, 5, 6] };

const oy = (contractId: string, datePayment: string, amount: number, amountPaid = 0, status = 'waiting'): JadvalQatori => ({
  contractId, datePayment, amount, amountPaid, status, type: 'monthly',
});

// ── sana arifmetikasi
check('kunQosh oy chegarasidan o\'tadi', kunQosh('2026-09-30', 1) === '2026-10-01');
check('kunQosh manfiy', kunQosh('2026-10-01', -2) === '2026-09-29');
// 2026-09-20 — yakshanba → shanba 19-sentabr
check('oldingi ish kuni: yakshanba → shanba', oldingiIshKuniga('2026-09-20', [], [1, 2, 3, 4, 5, 6]) === '2026-09-19');
check('oldingi ish kuni: bayram → oldingi kun', oldingiIshKuniga('2026-09-01', [MUSTAQILLIK], [1, 2, 3, 4, 5, 6]) === '2026-08-31');

// ── boshlanish sanasi
// D = 2026-09-22 (seshanba): B → 20-sentabr yakshanba → 19-sentabr shanba
check('B: D-2 yakshanbaga tushsa shanbaga suriladi', boshlanishSanasi('2026-09-22', 'B', Q) === '2026-09-19');
// D = 2026-09-25 (juma): B → 23-sentabr chorshanba
check('B: oddiy holat D-2', boshlanishSanasi('2026-09-25', 'B', Q) === '2026-09-23');
// D = 2026-09-27 (yakshanba): C → 28-sentabr dushanba
check('C: D yakshanba bo\'lsa dushanbaga', boshlanishSanasi('2026-09-27', 'C', Q) === '2026-09-28');
// D = 2026-09-01 (bayram): C → 2-sentabr
check('C: D bayram bo\'lsa keyingi ish kuniga', boshlanishSanasi('2026-09-01', 'C', Q) === '2026-09-02');

// ── oyna
check('B: boshlanishdan oldin — yo\'q', !oynadami('2026-09-25', 'B', '2026-09-22', Q));
check('B: boshlanish kuni — ha', oynadami('2026-09-25', 'B', '2026-09-23', Q));
check('C: D kuni — ha', oynadami('2026-09-22', 'C', '2026-09-22', Q));
check('C: D dan bir kun oldin — yo\'q', !oynadami('2026-09-22', 'C', '2026-09-21', Q));
check('D+30 — ha (yetkazib olish)', oynadami('2026-08-23', 'C', '2026-09-22', Q));
check('D+31 — yo\'q', !oynadami('2026-08-22', 'C', '2026-09-22', Q));

// ── erta (sinxdan oldingi filtr)
// D = 2026-09-25: eng erta boshlanish (B) — 23-sentabr
check('erta: B boshlanishidan oldin — ha', ertami('2026-09-25', '2026-09-22', Q));
check('erta: B boshlanish kuni — yo\'q', !ertami('2026-09-25', '2026-09-23', Q));
// D = 2026-09-22: B 19-sentabrdan boshlanadi — C hali kelmagan bo'lsa ham erta EMAS
check('erta: sana kuni — yo\'q', !ertami('2026-09-22', '2026-09-22', Q));
check('erta: sanasi o\'tgan — yo\'q', !ertami('2026-08-23', '2026-09-22', Q));

// ── qaror
const BUGUN = '2026-09-22';

{
  // Faqat sentabr ochiq, avgust to'langan → B
  const jadval = [oy('s1', '2026-08-25', 3_000_000, 3_000_000, 'paid'), oy('s1', '2026-09-25', 3_000_000)];
  const q = eslatmaQarori(new Set([qatorKaliti('s1', '2026-09-25')]), jadval, BUGUN, 100_000, Q);
  check('faqat shu oy ochiq → B', q.guruh === 'B', q.guruh);
  check('B, D=25, bugun 22 → hali tayyor emas', q.tayyor.length === 0, String(q.tayyor.length));
  check('to\'langan nomzod yo\'q', q.tolangan.length === 0);
}
{
  // Avgust ham, sentabr ham ochiq, ikkalasi oynada → C, ikkalasi tayyor
  const jadval = [oy('s1', '2026-08-25', 3_000_000), oy('s1', '2026-09-21', 3_000_000)];
  const kalitlar = new Set([qatorKaliti('s1', '2026-08-25'), qatorKaliti('s1', '2026-09-21')]);
  const q = eslatmaQarori(kalitlar, jadval, BUGUN, 100_000, Q);
  check('avgust + sentabr ochiq → C', q.guruh === 'C', q.guruh);
  check('C: ikkala oy tayyor', q.tayyor.length === 2, String(q.tayyor.length));
}
{
  // Iyul (oynadan tashqari) ochiq, sentabr nomzod → C
  const jadval = [oy('s1', '2026-07-21', 3_000_000), oy('s1', '2026-09-21', 3_000_000)];
  const q = eslatmaQarori(new Set([qatorKaliti('s1', '2026-09-21')]), jadval, BUGUN, 100_000, Q);
  check('oynadan tashqaridagi eski kechikish ham C qiladi', q.guruh === 'C', q.guruh);
}
{
  // Eski qoldiq minDebt dan kichik → B
  const jadval = [oy('s1', '2026-08-21', 3_000_000, 2_950_000, 'partially'), oy('s1', '2026-09-21', 3_000_000)];
  const q = eslatmaQarori(new Set([qatorKaliti('s1', '2026-09-21')]), jadval, BUGUN, 100_000, Q);
  check('50 000 qoldiq minDebt dan kichik → B', q.guruh === 'B', q.guruh);
  check('B, sanasi o\'tgan (21) → tayyor', q.tayyor.length === 1);
}
{
  // Sinxdan keyin nomzod to'langan bo'lib chiqdi
  const jadval = [oy('s1', '2026-09-21', 3_000_000, 3_000_000, 'paid')];
  const q = eslatmaQarori(new Set([qatorKaliti('s1', '2026-09-21')]), jadval, BUGUN, 100_000, Q);
  check('to\'langan nomzod → tolangan ro\'yxatida', q.tolangan.length === 1);
  check('to\'langan nomzod → tayyor emas', q.tayyor.length === 0);
}
{
  // Ikki shartnoma: biri kechikkan (C), ikkinchisida yangi oy
  const jadval = [oy('s1', '2026-08-10', 2_000_000), oy('s2', '2026-09-20', 4_000_000)];
  const q = eslatmaQarori(new Set([qatorKaliti('s2', '2026-09-20')]), jadval, BUGUN, 100_000, Q);
  check('boshqa shartnomadagi kechikish ham C qiladi', q.guruh === 'C', q.guruh);
}

// ── agent uchun ma'lumot
{
  const jadval = [oy('s1', '2026-07-21', 3_000_000, 1_000_000, 'partially'), oy('s1', '2026-09-21', 3_000_000)];
  const tayyor = [jadval[1]!];
  const m = eslatmaMalumoti('C', tayyor, jadval, new Map([['s1', '5582MSO25F3']]), BUGUN);
  check('C: kechikkanlar ro\'yxatida iyul qoldig\'i', m.kechikkanlar.length === 1 && m.kechikkanlar[0]!.qoldiq === 2_000_000);
  check('C: jami = 2 mln + 3 mln', m.jami === 5_000_000, String(m.jami));
  check('sanasi o\'tgan', m.sanaOtgan);
  check('bitta shartnoma', m.bittaShartnoma);
}
{
  const jadval = [oy('s1', '2026-09-25', 3_000_000)];
  const m = eslatmaMalumoti('B', jadval, jadval, new Map([['s1', 'X1']]), BUGUN);
  check('B: kechikkanlar bo\'sh', m.kechikkanlar.length === 0);
  check('B: jami = shu oy', m.jami === 3_000_000);
  check('B: sana hali kelmagan', !m.sanaOtgan);
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
