import { norozilikBormi, norozilikSozi } from '@/domain/services/norozilikLugati';

/** Qo'lda ishga tushiriladi: npm run test:norozilik --workspace=server */

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const ok = actual === expected;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${String(actual)} (kutilgan: ${String(expected)})`}`);
};

// ─── Topilishi kerak ──────────────────────────────────────────────────────
check('sudga beraman', norozilikBormi('Sudga beraman sizlarni'), true);
check('shikoyat', norozilikBormi('Prezidentga shikoyat yozaman'), true);
check('prokuratura', norozilikBormi('prokuraturaga murojaat qilaman'), true);
check('aldadingiz', norozilikBormi('Siz meni aldadingiz'), true);
check('firibgar', norozilikBormi('Bu firibgarlik'), true);
check('bezor', norozilikBormi('Bezor qildingiz meni'), true);
check('bosh harf', norozilikBormi('SUDGA BERAMAN'), true);
check('kirill', norozilikBormi('судга бераман'), true);
check("o' harfi apostrof bilan", norozilikBormi("Bu uyat, o'zingiz o'ylang"), true);

// ─── Topilmasligi kerak ───────────────────────────────────────────────────
check('oddiy javob', norozilikBormi('Ertaga to\'layman, xafa bo\'lmang'), false);
check('bo\'sh matn', norozilikBormi(''), false);
// So'z ichidagi tasodifiy moslik hisobga olinmaydi.
// Lug'atda yalang "sud" YO'Q — bo'lsa, "sudralib" ham tushardi.
check('sudralib — norozilik emas', norozilikBormi('Ishlar sudralib ketdi'), false);
check('sudya — topiladi', norozilikBormi('Sudya qo\'shnim aytdi'), true);

check('qaysi so\'z', norozilikSozi('Prezidentga shikoyat yozaman'), 'shikoyat');
check('yo\'q bo\'lsa null', norozilikSozi('Rahmat, tushundim'), null);

// ─── Qiya apostrof (U+2019) testlari ───────────────────────────────────
check("curly apostrofli o’ — oddiy javob", norozilikBormi('Bu o’zi tushunarli, ertaga to’layman'), false);
check('curly apostrof yonida shikoyat', norozilikBormi('O’zim shikoyat qilaman'), true);

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
