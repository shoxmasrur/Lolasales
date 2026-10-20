import { bayramTekshiruvi } from '@/domain/entities/bayramTekshiruvi';

/**
 * Qo'lda ishga tushiriladi: npm run test:bayram-tekshiruvi --workspace=server
 *
 * NEGA BU TEST KERAK: eng muhimi — YILLIK oraliq yil chegarasidan
 * o'tmasligi. `bayramKuni` yillik yozuvni oy-kun bo'yicha ikki tomonlama
 * solishtiradi; "12-30 dan 01-02 gacha" bunday solishtiruvda HECH QACHON
 * to'g'ri kelmaydi, ya'ni bayram jimgina ishlamay qolardi. Kiritishda
 * rad etish — buni ushlab qolishning yagona joyi.
 */

let failed = 0;

function eq(nom: string, actual: unknown, kutilgan: unknown): void {
  const a = JSON.stringify(actual);
  const k = JSON.stringify(kutilgan);
  if (a === k) {
    console.log(`✓ ${nom}`);
  } else {
    failed += 1;
    console.log(`✗ ${nom}: ${a}  (kutilgan: ${k})`);
  }
}

const ok = { name: 'Navro\'z', startsOn: '2026-03-21', endsOn: '2026-03-21', yillik: true };

// ── 1. To'g'ri yozuvlar ───────────────────────────────────────────────
eq('bir kunlik yillik', bayramTekshiruvi(ok), null);
eq('oraliq bir martalik', bayramTekshiruvi({
  name: 'Mustaqillik', startsOn: '2026-08-28', endsOn: '2026-09-02', yillik: false,
}), null);
eq('yillik oraliq bir oy ichida', bayramTekshiruvi({
  name: 'Hayit', startsOn: '2026-03-20', endsOn: '2026-03-23', yillik: true,
}), null);

// ── 2. Nom ────────────────────────────────────────────────────────────
eq('bo\'sh nom rad etiladi', bayramTekshiruvi({ ...ok, name: '   ' }) !== null, true);
eq('juda uzun nom rad etiladi', bayramTekshiruvi({ ...ok, name: 'x'.repeat(81) }) !== null, true);

// ── 3. Sana formati ───────────────────────────────────────────────────
eq('noto\'g\'ri format', bayramTekshiruvi({ ...ok, startsOn: '21.03.2026' }) !== null, true);
eq('mavjud bo\'lmagan sana', bayramTekshiruvi({ ...ok, startsOn: '2026-02-30', endsOn: '2026-02-30' }) !== null, true);

// ── 4. Tartib ─────────────────────────────────────────────────────────
eq('tugash boshlanishdan oldin', bayramTekshiruvi({
  ...ok, startsOn: '2026-03-25', endsOn: '2026-03-21',
}) !== null, true);

// ── 5. YILLIK oraliq yil chegarasidan o'ta olmaydi ────────────────────
{
  const xato = bayramTekshiruvi({
    name: 'Yangi yil', startsOn: '2026-12-30', endsOn: '2027-01-02', yillik: true,
  });
  eq('yillik yil chegarasi rad etiladi', xato !== null, true);
  eq('xato sababi tushunarli', (xato ?? '').includes('yil chegarasidan'), true);
}
// Xuddi shu oraliq BIR MARTALIK bo'lsa — ruxsat.
eq('bir martalik yil chegarasidan o\'tishi mumkin', bayramTekshiruvi({
  name: 'Yangi yil', startsOn: '2026-12-30', endsOn: '2027-01-02', yillik: false,
}), null);

console.log(failed === 0 ? '\nHammasi o\'tdi' : `\n${failed} ta test yiqildi`);
process.exit(failed === 0 ? 0 : 1);
