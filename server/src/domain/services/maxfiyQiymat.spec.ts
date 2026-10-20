import { HAVOLA_BELGISI, KARTA_BELGISI, maxfiyQiymatBormi, tarixMatni } from '@/domain/services/maxfiyQiymat';

/** Qo'lda: npm run test:maxfiy-qiymat --workspace=server */
let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};

// Kirish: tarix matni
check('karta xabari belgiga', tarixMatni({ kind: 'karta' }, '8600 1234 5678 9012'), KARTA_BELGISI);
check('havola xabari belgiga', tarixMatni({ kind: 'havola' }, 'https://t.me/+abc'), HAVOLA_BELGISI);
check('oddiy xabar o\'zgarmaydi', tarixMatni({ model: true }, 'Salom'), 'Salom');
check('meta yo\'q', tarixMatni(undefined, 'Salom'), 'Salom');

// Chiqish: model javobi
check('16 raqam bo\'shliqsiz', maxfiyQiymatBormi('Karta: 8600123456789012'), true);
check('16 raqam bo\'shliq bilan', maxfiyQiymatBormi('8600 1234 5678 9012 ga tashlang'), true);
check('16 raqam chiziqcha bilan', maxfiyQiymatBormi('8600-1234-5678-9012'), true);
check('t.me/+ havola', maxfiyQiymatBormi('Guruh: https://t.me/+AbC123'), true);
check('joinchat havola', maxfiyQiymatBormi('t.me/joinchat/XYZ'), true);
check('narx — maxfiy emas', maxfiyQiymatBormi("Narxi 1 500 000 so'm, birinchi qism 500 000 so'm"), false);
check('telefon — maxfiy emas', maxfiyQiymatBormi('+998 90 123 45 67'), false);
check('ochiq kanal havolasi — maxfiy emas', maxfiyQiymatBormi('https://t.me/lolasales'), false);
check('17 raqam — karta emas', maxfiyQiymatBormi('86001234567890123'), false);
check('null', maxfiyQiymatBormi(null), false);

console.log(failed ? `\n${failed} ta tekshiruv yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
