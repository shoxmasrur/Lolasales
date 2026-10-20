import {
  planAccountSplit,
  planManualSplit,
  type SplitAccount,
} from '@/application/services/accountSplit';

/**
 * Qo'lda ishga tushiriladi: npm run test:account-split --workspace=server
 *
 * Bu funksiya operator ko'rgan sonni ham, haqiqatda bajariladigan ishni
 * ham belgilaydi — ikkalasi bitta chaqiruvdan chiqadi. Shuning uchun
 * determinizm alohida tekshiriladi: bir xil kirishda bir xil natija.
 */

const acc = (id: string, currentLoad = 0, remainingQuota = 40): SplitAccount => ({
  id, currentLoad, remainingQuota,
});

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => `c${i + 1}`);

let failed = 0;

function check(holat: string, ok: boolean, izoh = ''): void {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${holat}${ok ? '' : `  ${izoh}`}`);
}

// 1. Teng yuk — teng bo'linadi.
{
  const r = planAccountSplit(ids(10), [acc('a'), acc('b')]);
  const a = r.perAccount.get('a') ?? 0;
  const b = r.perAccount.get('b') ?? 0;
  check('teng yuk: 10 ta ikkiga teng bo\'linadi', a === 5 && b === 5, `a=${a} b=${b}`);
  check('hamma mijoz biriktirildi', r.assignments.size === 10, `${r.assignments.size}`);
}

// 2. Mavjud yuk hisobga olinadi — kam yuklanganga ko'proq tushadi.
{
  const r = planAccountSplit(ids(10), [acc('a', 8), acc('b', 0)]);
  const a = r.perAccount.get('a') ?? 0;
  const b = r.perAccount.get('b') ?? 0;
  check('mavjud yuk: kam yuklanganga ko\'proq tushadi', b > a, `a=${a} b=${b}`);
  check('mavjud yuk: yakuniy yuk tenglashadi', 8 + a === b, `a=${a} b=${b}`);
}

// 3. Bitta akkaunt — hammasi unga.
{
  const r = planAccountSplit(ids(7), [acc('a')]);
  check('bitta akkaunt: hammasi unga', r.perAccount.get('a') === 7, `${r.perAccount.get('a')}`);
}

// 4. Kvotadan oshish — hammasi biriktiriladi, oshgani sanaladi.
{
  const r = planAccountSplit(ids(100), [acc('a', 0, 40), acc('b', 0, 40)]);
  check('kvota: hammasi biriktirildi', r.assignments.size === 100, `${r.assignments.size}`);
  check('kvota: oshgani 20 ta', r.overQuota === 20, `${r.overQuota}`);
}

// 5. Kvota yetarli bo'lsa oshgani nol.
{
  const r = planAccountSplit(ids(10), [acc('a', 0, 40)]);
  check('kvota yetarli: overQuota=0', r.overQuota === 0, `${r.overQuota}`);
}

// 6. Bo'sh kirishlar — xato tashlamaydi.
{
  const bosh = planAccountSplit([], [acc('a')]);
  check('bo\'sh mijozlar ro\'yxati', bosh.assignments.size === 0 && bosh.overQuota === 0);
  const akkauntsiz = planAccountSplit(ids(5), []);
  check('bo\'sh akkauntlar ro\'yxati', akkauntsiz.assignments.size === 0 && akkauntsiz.overQuota === 0);
}

// 7. Determinizm — bir xil kirish, bir xil natija.
{
  const a1 = planAccountSplit(ids(13), [acc('a', 3), acc('b', 1), acc('c', 7)]);
  const a2 = planAccountSplit(ids(13), [acc('a', 3), acc('b', 1), acc('c', 7)]);
  const bir = [...a1.assignments.entries()].every(([k, v]) => a2.assignments.get(k) === v);
  check('determinizm: ikki chaqiruv bir xil', bir && a1.assignments.size === a2.assignments.size);
}

// ─── Qo'lda taqsimlash ───────────────────────────────────────────────────
// Bu yerda hech narsa HISOBLANMAYDI: qaysi akkauntga nechta mijoz
// tushishini odam aytadi. Funksiya faqat sonlarni bajaradi.

// 8. Sonlar aynan bajariladi.
{
  const r = planManualSplit(ids(10), [acc('a'), acc('b')], { a: 7, b: 3 });
  check('a ga 7 ta', r.perAccount.get('a') === 7, String(r.perAccount.get('a')));
  check('b ga 3 ta', r.perAccount.get('b') === 3, String(r.perAccount.get('b')));
  check('hammasi biriktirildi', r.assignments.size === 10, String(r.assignments.size));
  // Tartib muhim: oynada ko'rsatilgan reja bilan haqiqiy ish bir xil
  // bo'lishi uchun mijozlar ketma-ket bo'lib beriladi.
  check('birinchi 7 tasi a da', r.assignments.get('c1') === 'a' && r.assignments.get('c7') === 'a');
  check('qolgan 3 tasi b da', r.assignments.get('c8') === 'b' && r.assignments.get('c10') === 'b');
}

// 9. Yig'indi mijozlar sonidan KAM — ortiqchasi biriktirilmaydi.
// Operator "bugun faqat shuncha" deb chegaralay olishi kerak.
{
  const r = planManualSplit(ids(10), [acc('a'), acc('b')], { a: 2, b: 3 });
  check('faqat 5 tasi biriktirildi', r.assignments.size === 5, String(r.assignments.size));
  check('qolgani biriktirilmadi', !r.assignments.has('c6'));
}

// 10. Yig'indi mijozlar sonidan KO'P — bori bo'linadi, xato yo'q.
{
  const r = planManualSplit(ids(4), [acc('a'), acc('b')], { a: 10, b: 10 });
  check('bori bo\'lindi', r.assignments.size === 4, String(r.assignments.size));
  check('birinchi akkaunt hammasini oldi', r.perAccount.get('a') === 4, String(r.perAccount.get('a')));
  check('ikkinchisiga qolmadi', r.perAccount.get('b') === 0, String(r.perAccount.get('b')));
}

// 11. Kvotadan oshgani sanaladi (taqsimlashni to'xtatmaydi).
{
  const r = planManualSplit(ids(10), [acc('a', 0, 3), acc('b', 0, 40)], { a: 8, b: 2 });
  check('kvotadan oshgani 5 ta', r.overQuota === 5, String(r.overQuota));
  check('lekin baribir biriktirildi', r.perAccount.get('a') === 8, String(r.perAccount.get('a')));
}

// 12. Buzuq kirishlar ish buzmaydi.
{
  const manfiy = planManualSplit(ids(5), [acc('a')], { a: -3 });
  check('manfiy son — nol deb qabul qilinadi', manfiy.assignments.size === 0);

  const kasr = planManualSplit(ids(5), [acc('a')], { a: 2.7 });
  check('kasr son — pastga yaxlitlanadi', kasr.perAccount.get('a') === 2, String(kasr.perAccount.get('a')));

  const yoq = planManualSplit(ids(5), [acc('a'), acc('b')], { a: 2 });
  check('son ko\'rsatilmagan akkaunt — nol', yoq.perAccount.get('b') === 0);

  const bosh = planManualSplit([], [acc('a')], { a: 5 });
  check('bo\'sh ro\'yxat', bosh.assignments.size === 0 && bosh.overQuota === 0);
}

// 13. Determinizm — oyna va haqiqiy ish bir xil natija berishi shart.
{
  const a1 = planManualSplit(ids(9), [acc('a'), acc('b'), acc('c')], { a: 4, b: 3, c: 2 });
  const a2 = planManualSplit(ids(9), [acc('a'), acc('b'), acc('c')], { a: 4, b: 3, c: 2 });
  const bir = [...a1.assignments.entries()].every(([k, v]) => a2.assignments.get(k) === v);
  check('determinizm: ikki chaqiruv bir xil', bir && a1.assignments.size === a2.assignments.size);
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
