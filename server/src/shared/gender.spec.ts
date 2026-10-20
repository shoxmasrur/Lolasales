import { addressForm, detectGender } from '@/shared/gender';

/** Qo'lda ishga tushiriladi: npm run test:gender */
const CASES: Array<{ name: string; expect: string | null }> = [
  // Bazadagi haqiqiy mijozlar — otasining ismi bo'yicha
  { name: 'Axmatxodjayev Zokirjon Maxmutovich', expect: 'Zokirjon aka' },
  { name: 'Mirzayeva Nargiza Nasirdjanovna', expect: 'Nargiza opa' },
  { name: 'Abdukadirov Farux Shovkatovich', expect: 'Farux aka' },
  // telegram_oila arxividan
  { name: "KO'CHIYEVA MAVJUDA ABDIAXMONOVNA", expect: 'MAVJUDA opa' },

  // Kirill yozuvi
  { name: 'Ахмедова Насиба Каримовна', expect: 'Насиба opa' },
  { name: 'Каримов Улугбек Рустамович', expect: 'Улугбек aka' },

  // O'zbekcha uslub: o'g'li / qizi
  { name: "Aziz Karim o'g'li", expect: 'Aziz aka' },
  { name: 'Nilufar Karim qizi', expect: 'Nilufar opa' },

  // Aralash uslub: FAMILIYA + ism + otasining ismi + o'g'li/qizi.
  // Ilgari bu yerda familiya ism deb olinardi ("Raximbayev aka") — eng
  // ko'p uchraydigan yozuv bo'lgani uchun xato ham eng ko'p shu yerda edi.
  { name: "Raximbayev Aziz Karim o'g'li", expect: 'Aziz aka' },
  { name: "Mirzayeva Nargiza Nasir qizi", expect: 'Nargiza opa' },
  { name: "Testov Testoy Test o'g'li", expect: 'Testoy aka' },
  { name: "Каримов Улугбек Рустам ўғли", expect: 'Улугбек aka' },

  // Faqat familiya qo'shimchasi
  { name: 'Yusupova Gulnoza', expect: 'Gulnoza opa' },
  { name: 'Yusupov Sardor', expect: 'Sardor aka' },

  // Faqat ism — ro'yxatdan
  { name: 'Madina', expect: 'Madina opa' },
  { name: 'Sherzod', expect: 'Sherzod aka' },
  { name: "Ulug'bek", expect: "Ulug'bek aka" },

  // Aniqlanmaydigan holatlar — TAXMIN QILINMASLIGI kerak
  { name: 'Salokhiddin Inv1sible', expect: 'Salokhiddin aka' },
  { name: 'Firdavs 3189mso', expect: 'Firdavs aka' },
  { name: 'Jasmina Xolmatova', expect: 'Jasmina opa' },
  { name: 'Nomsiz', expect: null },
  { name: '', expect: null },
];

let failed = 0;
for (const c of CASES) {
  const actual = addressForm(c.name);
  const ok = actual === c.expect;
  if (!ok) failed += 1;
  console.log(
    `${ok ? '✓' : '✗'} "${c.name}" → ${actual ?? 'null'}${ok ? '' : `  (kutilgan: ${c.expect ?? 'null'})`}`,
  );
}

// ─── CRM'dan kelgan aniq ism taxmindan USTUN turadi ──────────────────────
const known: Array<{ full: string; first: string | null; expect: string | null }> = [
  // Taxmin ham to'g'ri ishlaydigan holat — natija o'zgarmasligi kerak.
  { full: "Raximbayev Aziz Karim o'g'li", first: 'Aziz', expect: 'Aziz aka' },
  // Taxmin ojiz: bazada faqat familiya bor, CRM esa ismni biladi.
  { full: 'Raximbayev', first: 'Aziz', expect: 'Aziz aka' },
  // CRM'da ism yo'q — taxminga qaytiladi.
  { full: "Raximbayev Aziz Karim o'g'li", first: null, expect: 'Aziz aka' },
  { full: "Raximbayev Aziz Karim o'g'li", first: '   ', expect: 'Aziz aka' },
  // Jins TO'LIQ ismdan aniqlanadi: faqat `first_name` dan jins bilinmaydi,
  // shuning uchun bu yerda ham "ANIQLANMADI" bo'lishi kerak.
  { full: 'Nomsiz', first: 'Aziz', expect: null },
];

for (const c of known) {
  const actual = addressForm(c.full, c.first);
  const ok = actual === c.expect;
  if (!ok) failed += 1;
  console.log(
    `${ok ? '✓' : '✗'} "${c.full}" + first_name=${c.first === null ? 'null' : `"${c.first}"`} → ` +
      `${actual ?? 'null'}${ok ? '' : `  (kutilgan: ${c.expect ?? 'null'})`}`,
  );
}

// Noto'g'ri jinsda murojaat qilish — eng qimmat xato, shuning uchun
// aniqlanmagan holat aniq null qaytarishi shart.
const unknown = detectGender('Nomsiz');
if (unknown !== null) {
  failed += 1;
  console.log(`✗ noma'lum ism uchun taxmin qilindi: ${unknown}`);
} else {
  console.log('✓ noma\'lum ism uchun taxmin qilinmadi');
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
