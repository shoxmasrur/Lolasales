import { validateProxy } from '@/domain/entities/telegramProxy';

/**
 * Qo'lda ishga tushiriladi: npm run test:proxy-validation
 *
 * Proksi noto'g'ri saqlansa akkaunt ulanmay qoladi va buni faqat
 * ulanish paytida bilamiz — shuning uchun qoida kiritish nuqtasida,
 * sof funksiyada tekshiriladi.
 */

let failed = 0;

function ok(nom: string, fn: () => void): void {
  try {
    fn();
    console.log(`✓ ${nom}`);
  } catch (err) {
    failed += 1;
    console.log(`✗ ${nom}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function xato(nom: string, fn: () => void): void {
  try {
    fn();
    failed += 1;
    console.log(`✗ ${nom}: xato kutilgandi, lekin o'tib ketdi`);
  } catch {
    console.log(`✓ ${nom}`);
  }
}

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

function maydonBor(nom: string, obj: object, maydon: string): void {
  if (Object.prototype.hasOwnProperty.call(obj, maydon)) {
    console.log(`✓ ${nom}`);
  } else {
    failed += 1;
    console.log(`✗ ${nom}: maydon '${maydon}' yo'q`);
  }
}

function maydonYoq(nom: string, obj: object, maydon: string): void {
  if (!Object.prototype.hasOwnProperty.call(obj, maydon)) {
    console.log(`✓ ${nom}`);
  } else {
    failed += 1;
    console.log(`✗ ${nom}: maydon '${maydon}' bo'lmasligi kerak, lekin bor`);
  }
}

// ── 1. To'g'ri kirish normallashtiriladi ────────────────────────────────
eq(
  'to\'liq proksi',
  validateProxy({ host: ' 185.22.10.7 ', port: 1080, username: 'user', password: 'pass' }),
  { host: '185.22.10.7', port: 1080, username: 'user', password: 'pass' },
);

// ── 2. Bo'sh login/parol null ga aylanadi ───────────────────────────────
eq(
  'loginsiz proksi',
  validateProxy({ host: '185.22.10.7', port: 1080, username: '  ', password: '' }),
  { host: '185.22.10.7', port: 1080, username: null, password: null },
);

// ── 2b. Login o'chirilsa, parol maydoni berilmagan bo'lsa ham parol
// bazadan tozalanadi ────────────────────────────────────────────────────
// Login yo'q joyda saqlangan parolning ma'nosi yo'q: operator faqat
// loginni tozalab, parol maydoniga tegmasa (`password` kirishda umuman
// yo'q), natijada BAZADAGI parol saqlanib qolmasligi kerak — aks holda
// akkaunt loginsiz-parolli holatga tushib, ulanish `error`ga aylanadi.
{
  const result2b = validateProxy({ host: '185.22.10.7', port: 1080, username: null });
  maydonBor('login null, parol berilmagan: password maydon bor', result2b, 'password');
  eq('login null, parol berilmagan: qiymati null', result2b.password, null);
}

// ── 3. Parol berilmasa maydon umuman bo'lmaydi ──────────────────────────
// Bu "bazadagi parolga tegilmasin" degani — `null` bilan aralashmasligi
// kerak, `null` esa parolni o'chiradi.
eq(
  'parol berilmagan',
  validateProxy({ host: '185.22.10.7', port: 1080, username: 'user' }),
  { host: '185.22.10.7', port: 1080, username: 'user' },
);

// Strukturaviy tekshiruv: parol berilmagani → maydon yo'q
const result1 = validateProxy({ host: '185.22.10.7', port: 1080, username: 'user' });
maydonYoq('parol berilmagani: password maydon yo\'q', result1, 'password');

// Strukturaviy tekshiruv: parol null → maydon bor, qiymati null
const result2 = validateProxy({ host: '185.22.10.7', port: 1080, username: 'user', password: null });
maydonBor('parol null: password maydon bor', result2, 'password');
eq('parol null: qiymati null', result2.password, null);

// ── 4. Host bo'sh bo'lolmaydi ───────────────────────────────────────────
xato('bo\'sh host', () => validateProxy({ host: '   ', port: 1080 }));

// ── 5. Port chegaralari ─────────────────────────────────────────────────
xato('port 0', () => validateProxy({ host: '185.22.10.7', port: 0 }));
xato('port 65536', () => validateProxy({ host: '185.22.10.7', port: 65536 }));
xato('kasr port', () => validateProxy({ host: '185.22.10.7', port: 1080.5 }));
ok('port 1', () => validateProxy({ host: '185.22.10.7', port: 1 }));
ok('port 65535', () => validateProxy({ host: '185.22.10.7', port: 65535 }));

// ── 6. Loginsiz parol — SOCKS5 da ma'nosiz ──────────────────────────────
xato('parol bor, login yo\'q', () =>
  validateProxy({ host: '185.22.10.7', port: 1080, password: 'pass' }));

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
