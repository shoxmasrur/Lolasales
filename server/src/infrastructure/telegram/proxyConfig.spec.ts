import { proxyErrorMessage, toSocksProxy } from '@/infrastructure/telegram/proxyConfig';

/**
 * Qo'lda ishga tushiriladi: npm run test:proxy-config
 *
 * Ikki narsa tekshiriladi:
 *   toSocksProxy      — bizning obyektimiz teleproto kutgan shaklga
 *                       to'g'ri aylanishi (bitta maydon adashsa akkaunt
 *                       jim turib to'g'ridan-to'g'ri ulanib ketardi).
 *   proxyErrorMessage — proksi nosozligi operator tushunadigan matnga
 *                       aylanishi va proksi manzili matnda turishi.
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

const PROXY = { host: '185.22.10.7', port: 1080, username: 'user', password: 'pass' };

// ── 1. Proksisiz akkaunt — sozlama umuman bo'lmaydi ─────────────────────
// `undefined` muhim: `TelegramClient` ga `proxy: null` berilsa u buni
// sozlama deb qabul qilib, ulanish buziladi.
eq('proksisiz', toSocksProxy(null), undefined);

// ── 2. To'liq proksi ────────────────────────────────────────────────────
eq('to\'liq proksi', toSocksProxy(PROXY), {
  socksType: 5,
  ip: '185.22.10.7',
  port: 1080,
  username: 'user',
  password: 'pass',
  timeout: 10,
});

// ── 3. Loginsiz proksi — bo'sh satr emas, maydon yo'q ───────────────────
eq('loginsiz proksi', toSocksProxy({ ...PROXY, username: null, password: null }), {
  socksType: 5,
  ip: '185.22.10.7',
  port: 1080,
  timeout: 10,
});

// ── 4. Proksi xatolari to'g'ri toifaga tarjima qilinadi ──────────────────
// Har bir tarmoq (auth/manzil/timeout/umumiy) o'ziga xos xabar berishi
// shart — hammasi bitta umumiy matnga qisqarib qolsa, operator auth
// xatosini timeout'dan ajrata olmay qoladi. Shu sabab bu yerda ANIQ
// matn tekshiriladi, shunchaki manzil borligi emas.
const MANZIL = '185.22.10.7:1080';
const XATOLAR: Array<{ nom: string; matn: string; kutilgan: string }> = [
  {
    nom: 'auth xatosi',
    matn: 'Socks5 Authentication failed',
    kutilgan: `Proksi logini yoki paroli noto'g'ri (${MANZIL})`,
  },
  {
    nom: 'manzil topilmadi',
    matn: 'getaddrinfo ENOTFOUND 185.22.10.7',
    kutilgan: `Proksi manzili topilmadi (${MANZIL})`,
  },
  {
    nom: 'timeout (matnda "timed out")',
    matn: 'Proxy connection timed out',
    kutilgan: `Proksi javob bermadi (${MANZIL})`,
  },
  {
    nom: 'timeout (ETIMEDOUT)',
    matn: 'connect ETIMEDOUT 185.22.10.7:1080',
    kutilgan: `Proksi javob bermadi (${MANZIL})`,
  },
  {
    nom: 'umumiy (ECONNREFUSED)',
    matn: 'connect ECONNREFUSED 185.22.10.7:1080',
    kutilgan: `Proksiga ulanib bo'lmadi (${MANZIL})`,
  },
  {
    nom: 'umumiy (Socket closed)',
    matn: 'Socket closed',
    kutilgan: `Proksiga ulanib bo'lmadi (${MANZIL})`,
  },
];
for (const { nom, matn, kutilgan } of XATOLAR) {
  eq(`proksi xatosi: ${nom}`, proxyErrorMessage(new Error(matn), PROXY), kutilgan);
}

// ── 5. Proksiga aloqasi yo'q xato tegilmaydi ────────────────────────────
eq(
  'begona xato',
  proxyErrorMessage(new Error('PHONE_CODE_INVALID'), PROXY),
  null,
);

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
