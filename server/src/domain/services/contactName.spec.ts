import { contactName } from '@/domain/services/contactName';

/**
 * Qo'lda: npm run test:contact-name --workspace=server
 *
 * Kontakt nomi: "<qisqa shartnoma> <murojaat>" → "3090MSO Aziz aka".
 */
let failed = 0;
const check = (name: string, ok: boolean, extra = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${extra}`}`);
};

const eq = (name: string, got: { first: string; last: string }, first: string, last: string): void =>
  check(name, got.first === first && got.last === last, `${got.first} | ${got.last}`);

// ── 1. Ruscha tartib: Familiya Ism Otasining-ismi ────────────────────────
eq(
  'erkak — 3090MSO Aziz aka',
  contactName('3090MSO25A5', 'Aliyev Aziz Rustamovich'),
  '3090MSO',
  'Aziz aka',
);

// ── 2. Ayol ─────────────────────────────────────────────────────────────
eq(
  'ayol — 1493ZUR Nargiza opa',
  contactName('1493ZUR24KV', 'Mirzayeva Nargiza Nasirdjanovna'),
  '1493ZUR',
  'Nargiza opa',
);

// ── 3. O'zbekcha tartib: Ism Otasining-ismi o'g'li ──────────────────────
eq(
  "o'zbekcha tartib — ism birinchi",
  contactName('3090MSO25A5', "Aziz Karim o'g'li"),
  '3090MSO',
  'Aziz aka',
);

// ── 4. Jinsi aniqlanmadi → murojaat shaklisiz, faqat ism ────────────────
// `detectGender('Kim Sergey')` → null (tekshirilgan).
eq('jins noaniq — murojaatsiz', contactName('3090MSO25A5', 'Kim Sergey'), '3090MSO', 'Kim');

// ── 5. Shartnomasiz mijoz ───────────────────────────────────────────────
eq('shartnomasiz — faqat ism', contactName(null, 'Aliyev Aziz Rustamovich'), '', 'Aziz aka');

// ── 6. Naqshga tushmaydigan raqam → to'liq qoladi ───────────────────────
// Kesib tashlashdan ko'ra uzun bo'lgani yaxshi: raqam tanib olinsin.
eq("harfsiz raqam — to'liq", contactName('12345', 'Aliyev Aziz Rustamovich'), '12345', 'Aziz aka');

// ── 7. Ism umuman bo'sh bo'lsa yiqilmaydi ───────────────────────────────
eq("bo'sh ism", contactName('3090MSO25A5', ''), '3090MSO', '');

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
