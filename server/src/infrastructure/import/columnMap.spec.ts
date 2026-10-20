import { findPhoneColumns } from '@/infrastructure/import/columnMap';

/**
 * Qo'lda ishga tushiriladi: npm run test:column-map
 *
 * Real xatoni qo'riqlaydi: "debitor_prod_test.xlsx" faylida "Телефон" nomli
 * IKKITA ustun bor edi — 4-si mijozning raqami, 32-si esa ogohlantirish
 * bloki ortidagi butunlay boshqa raqam. Parser ikkalasini ham olib, begona
 * raqamni mijozning qo'shimcha raqami qilib yozib qo'ygan edi.
 */
const CASES: Array<{ name: string; headers: string[]; expect: number[] }> = [
  {
    name: 'real fayl — "Телефон" ikki marta, faqat birinchisi olinadi',
    headers: [
      'ID', 'СТАТУС', '№ договора', 'Телефон', 'Объект', 'Клиент',
      'Виртуальный статус', 'Телефон',
    ],
    expect: [4],
  },
  {
    name: 'farqlanadigan nom — ikkalasi ham olinadi',
    headers: ['Клиент', 'Телефон', 'Телефон 2'],
    expect: [2, 3],
  },
  {
    name: 'qo\'shimcha telefon o\'zbekcha nom bilan',
    headers: ['Mijoz', 'Telefon', 'Qo\'shimcha telefon'],
    expect: [2],
  },
  {
    name: 'bitta telefon ustuni',
    headers: ['Клиент', 'Телефон', 'Долг'],
    expect: [2],
  },
  {
    name: 'telefon ustuni yo\'q',
    headers: ['Клиент', 'Долг', 'Объект'],
    expect: [],
  },
  {
    name: 'uch marta takrorlangan — baribir bitta',
    headers: ['Телефон', 'Клиент', 'Телефон', 'Телефон'],
    expect: [1],
  },
];

let failed = 0;
for (const c of CASES) {
  const actual = findPhoneColumns(c.headers);
  const ok = JSON.stringify(actual) === JSON.stringify(c.expect);
  if (!ok) failed += 1;
  console.log(
    `${ok ? '✓' : '✗'} ${c.name} → [${actual.join(', ')}]${ok ? '' : `  (kutilgan: [${c.expect.join(', ')}])`}`,
  );
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
