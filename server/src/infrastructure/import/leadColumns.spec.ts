import { leadUstunlari, leadSarlavhaBali } from '@/infrastructure/import/leadColumns';

/** Qo'lda ishga tushiriladi: npm run test:lead-columns */
let failed = 0;
function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failed += 1;
    console.error(`FAIL ${name}\n  kutilgan: ${JSON.stringify(expected)}\n  bor:      ${JSON.stringify(actual)}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

check("o'zbekcha", leadUstunlari(['Ism', 'Telefon raqam', 'Kurs']), { name: 0, phone: 1, course: 2 });
check('ruscha', leadUstunlari(['Имя', 'Телефон']), { name: 0, phone: 1, course: null });
check('telefonsiz', leadUstunlari(['Ism']).phone, null);
check('inglizcha', leadUstunlari(['Name', 'Phone', 'Course']), { name: 0, phone: 1, course: 2 });
check('FIO va Клиент', leadUstunlari(['FIO', 'Raqam']), { name: 0, phone: 1, course: null });
check('Клиент / Курс', leadUstunlari(['Клиент', 'Курс', 'Телефон']), { name: 0, phone: 2, course: 1 });
check('tartib farqi', leadUstunlari(['Kurs', 'Telefon', 'Ism']), { name: 2, phone: 1, course: 0 });
check('bo\'sh va noma\'lum', leadUstunlari(['', 'Izoh']), { name: null, phone: null, course: null });
check('takroriy telefon — birinchisi', leadUstunlari(['Telefon', 'Ism', 'Telefon']).phone, 0);
check('sarlavha bali', leadSarlavhaBali(['Ism', 'Telefon', 'Kurs']), 3);
check('sarlavha bali — ma\'lumot qatori', leadSarlavhaBali(['Aziz', '+998901234567']), 0);

process.exitCode = failed ? 1 : 0;
