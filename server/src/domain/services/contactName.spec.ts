import { contactName } from '@/domain/services/contactName';

/**
 * Qo'lda: npm run test:contact-name --workspace=server
 *
 * Kontakt nomi: murojaat shakli → "Aziz aka" (`first_name`), familiya yozilmaydi.
 */
let failed = 0;
const check = (name: string, ok: boolean, extra = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${extra}`}`);
};

const eq = (name: string, got: { first: string; last: string }, first: string, last: string): void =>
  check(name, got.first === first && got.last === last, `${got.first} | ${got.last}`);

// ── 1. Ruscha tartib: Familiya Ism Otasining-ismi ────────────────────────
eq('erkak — Aziz aka', contactName('Aliyev Aziz Rustamovich'), 'Aziz aka', '');

// ── 2. Ayol ─────────────────────────────────────────────────────────────
eq('ayol — Nargiza opa', contactName('Mirzayeva Nargiza Nasirdjanovna'), 'Nargiza opa', '');

// ── 3. O'zbekcha tartib: Ism Otasining-ismi o'g'li ──────────────────────
eq("o'zbekcha tartib — ism birinchi", contactName("Aziz Karim o'g'li"), 'Aziz aka', '');

// ── 4. Jinsi aniqlanmadi → murojaat shaklisiz, faqat ism ────────────────
// `detectGender('Kim Sergey')` → null (tekshirilgan).
eq('jins noaniq — murojaatsiz', contactName('Kim Sergey'), 'Kim', '');

// ── 5. Aniq ism berilgan ────────────────────────────────────────────────
eq('aniq ism ustun', contactName('Aliyev Aziz Rustamovich', 'Aziz'), 'Aziz aka', '');

// ── 6. Ism umuman bo'sh bo'lsa yiqilmaydi ───────────────────────────────
eq("bo'sh ism", contactName(''), '', '');

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
