import { kontekst } from '@/shared/logContext';

/**
 * Qo'lda ishga tushiriladi: npm run test:log-context
 *
 * NEGA TEKSHIRILADI: bu funksiyaning butun ma'nosi — jurnal kalitlari
 * hamma joyda BIR XIL bo'lishi. Kalit bir joyda `akkaunt`, boshqasida
 * `account` bo'lib qolsa, operator `grep` bilan qidira olmaydi va
 * boyitishning foydasi yo'qoladi. Shuning uchun kalitlar shu yerda
 * qotirilgan.
 */

let failed = 0;

function eq(nom: string, actual: unknown, kutilgan: unknown): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(kutilgan);
  if (a === b) {
    console.log(`✓ ${nom}`);
  } else {
    failed += 1;
    console.log(`✗ ${nom}: ${a}  (kutilgan: ${b})`);
  }
}

// ── 1. To'liq kontekst ──────────────────────────────────────────────────
eq(
  'uchala maydon',
  kontekst({ shartnoma: '3090MSO25A5', akkaunt: 'Madina', mijoz: 'Aziz Karimov' }),
  { shartnoma: '3090MSO25A5', akkaunt: 'Madina', mijoz: 'Aziz Karimov' },
);

// ── 2. Bo'sh maydonlar jurnalga TUSHMAYDI ──────────────────────────────
// `"shartnoma":null` qatorni uzaytiradi va hech narsa aytmaydi.
eq('null tashlanadi', kontekst({ shartnoma: null, akkaunt: 'Madina', mijoz: null }), {
  akkaunt: 'Madina',
});
eq('undefined tashlanadi', kontekst({ akkaunt: 'Madina' }), { akkaunt: 'Madina' });
eq('bo\'sh satr tashlanadi', kontekst({ akkaunt: '  ', mijoz: 'Aziz' }), { mijoz: 'Aziz' });

// ── 3. Hech narsa bo'lmasa — bo'sh obyekt, xato emas ────────────────────
// Chaqiruvchi joylarda `...kontekst(...)` deb yoziladi, ya'ni bo'sh
// obyekt hech narsa qo'shmaydi va jurnal qatori buzilmaydi.
eq('hammasi bo\'sh', kontekst({}), {});

// ── 4. Kalitlar tartibi barqaror ────────────────────────────────────────
// Jurnal qatorlarini ko'z bilan solishtirish oson bo'lishi uchun tartib
// har doim bir xil: shartnoma → akkaunt → mijoz.
eq(
  'tartib barqaror',
  Object.keys(kontekst({ mijoz: 'Aziz', akkaunt: 'Madina', shartnoma: '3090MSO' })),
  ['shartnoma', 'akkaunt', 'mijoz'],
);

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
