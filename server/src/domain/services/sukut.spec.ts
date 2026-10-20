import { sukutKunlari } from '@/domain/services/sukut';

/**
 * Qo'lda ishga tushiriladi: npm run test:sukut --workspace=server
 *
 * Sukut KUN ALMASHUVI bo'yicha sanaladi, soat bo'yicha emas: xabar ish
 * oynasida (09:00–19:00) ketadi, ya'ni eng qisqa oraliq ham bir tunni
 * o'z ichiga oladi. Soat qo'shish hisobni murakkablashtiradi, natijani
 * esa o'zgartirmaydi.
 *
 * YAKSHANBA SANOQQA KIRMAYDI: banklar ishlamaydi, ya'ni o'sha kuni
 * to'lov o'tmagan bo'lishi mumkin — bu mijozning javob bermagani
 * emas. Shanba yozilgan xabar uchun sukutning birinchi kuni dushanba.
 */
const TZ = 'Asia/Tashkent';

/** Toshkent vaqti bo'yicha sana va soatdan Date yasaydi (UTC+5). */
const t = (isoLocal: string): Date => new Date(`${isoLocal}+05:00`);

const HOLATLAR: Array<{ nom: string; chiquvchi: string; hozir: string; kutilgan: number }> = [
  {
    nom: 'o\'sha kuni kechqurun — hali sukut yo\'q',
    chiquvchi: '2026-08-17T10:00:00', // dushanba
    hozir: '2026-08-17T18:00:00',
    kutilgan: 0,
  },
  {
    nom: 'ertasi kuni ertalab — 1 kun',
    chiquvchi: '2026-08-17T10:00:00', // dushanba
    hozir: '2026-08-18T09:00:00', // seshanba
    kutilgan: 1,
  },
  {
    nom: 'juma → shanba — 1 kun',
    chiquvchi: '2026-08-21T10:00:00', // juma
    hozir: '2026-08-22T09:00:00', // shanba
    kutilgan: 1,
  },
  {
    nom: 'shanba → yakshanba — yakshanba sanalmaydi',
    chiquvchi: '2026-08-22T10:00:00', // shanba
    hozir: '2026-08-23T09:00:00', // yakshanba
    kutilgan: 0,
  },
  {
    nom: 'shanba → dushanba — 1 kun (yakshanba tushib qoldi)',
    chiquvchi: '2026-08-22T10:00:00',
    hozir: '2026-08-24T09:00:00', // dushanba
    kutilgan: 1,
  },
  {
    nom: 'juma → dushanba — 2 kun (shanba + dushanba)',
    chiquvchi: '2026-08-21T10:00:00',
    hozir: '2026-08-24T09:00:00',
    kutilgan: 2,
  },
  {
    nom: 'oy chegarasi: 31-avgust → 1-sentyabr',
    chiquvchi: '2026-08-31T10:00:00', // dushanba
    hozir: '2026-09-01T09:00:00', // seshanba
    kutilgan: 1,
  },
  {
    nom: 'kelajakdagi sana — manfiy emas, nol',
    chiquvchi: '2026-08-18T10:00:00',
    hozir: '2026-08-17T10:00:00',
    kutilgan: 0,
  },
];

let failed = 0;
for (const h of HOLATLAR) {
  const got = sukutKunlari(t(h.chiquvchi), t(h.hozir), TZ);
  if (got === h.kutilgan) {
    console.log(`✓ ${h.nom}`);
  } else {
    failed += 1;
    console.log(`✗ ${h.nom}: kutilgan ${h.kutilgan}, olingan ${got}`);
  }
}

console.log(failed ? `\n${failed} ta holat yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
