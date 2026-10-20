import { parseIpifyResponse, socksErrorMessage } from '@/infrastructure/telegram/proxyProbe';

/**
 * Qo'lda ishga tushiriladi: npm run test:proxy-probe
 *
 * Tarmoqqa chiqadigan qism (`probeProxy`) bu yerda tekshirilmaydi —
 * u haqiqiy proksi talab qiladi. Tekshiriladigani ikki sof funksiya:
 * javobdan IP ajratish va SOCKS xatosini o'zbekchaga aylantirish.
 */

let failed = 0;

function eq(nom: string, actual: unknown, kutilgan: unknown): void {
  if (actual === kutilgan) {
    console.log(`✓ ${nom}`);
  } else {
    failed += 1;
    console.log(`✗ ${nom}: ${String(actual)}  (kutilgan: ${String(kutilgan)})`);
  }
}

// ── 1. HTTP javobidan IP ajratiladi ─────────────────────────────────────
eq(
  'oddiy javob',
  parseIpifyResponse('HTTP/1.1 200 OK\r\nContent-Length: 11\r\n\r\n185.22.10.7'),
  '185.22.10.7',
);

// ── 2. Chunked javob ham qabul qilinadi ─────────────────────────────────
// Ba'zi proksilar javobni qayta o'raydi — IP satrini topish kifoya.
eq(
  'chunked javob',
  parseIpifyResponse('HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\nb\r\n185.22.10.7\r\n0\r\n\r\n'),
  '185.22.10.7',
);

// ── 3. IPv6 ham IP ────────────────────────────────────────────────────
eq(
  'IPv6',
  parseIpifyResponse('HTTP/1.1 200 OK\r\n\r\n2a02:6ea0:c700::1'),
  '2a02:6ea0:c700::1',
);

// ── 4. IP topilmasa null ────────────────────────────────────────────────
eq('IP yo\'q', parseIpifyResponse('HTTP/1.1 502 Bad Gateway\r\n\r\n<html>xato</html>'), null);
eq('bo\'sh javob', parseIpifyResponse(''), null);

// ── 4b. IP'ga o'xshagan, lekin IP bo'lmagan matnlar rad etiladi ─────────
// Naqsh juda erkin bo'lsa, vaqt belgisi yoki noto'g'ri oktetli satr ham
// "muvaffaqiyatli" IP sifatida qabul qilinib, operatorni chalg'itardi.
eq('soat, IPv6 emas', parseIpifyResponse('HTTP/1.1 200 OK\r\n\r\n10:20:30'), null);
eq('oktet 255 dan katta', parseIpifyResponse('HTTP/1.1 200 OK\r\n\r\n999.1.2.3'), null);
eq('tasodifiy heks, IPv6 emas', parseIpifyResponse('HTTP/1.1 200 OK\r\n\r\naa:bb:cc'), null);
eq(
  'IP faqat sarlavhada, tanada yo\'q',
  parseIpifyResponse('HTTP/1.1 200 OK\r\nX-Forwarded-For: 203.0.113.5\r\n\r\n'),
  null,
);

// ── 5. SOCKS xatolari o'zbekchaga aylanadi ──────────────────────────────
const XATOLAR: Array<[string, string]> = [
  ['Socks5 Authentication failed', 'Proksi logini yoki paroli noto\'g\'ri'],
  ['connect ECONNREFUSED', 'Proksi ulanishni rad etdi'],
  ['read ECONNRESET', 'Proksi ulanishni kutilmaganda uzdi'],
  ['getaddrinfo ENOTFOUND proxy.example.com', 'Proksi manzili topilmadi'],
  ['Proxy connection timed out', 'Proksi javob bermadi'],
];
for (const [xom, kutilgan] of XATOLAR) {
  eq(`xato: ${xom}`, socksErrorMessage(new Error(xom)), kutilgan);
}

// ── 6. Notanish xato o'z matni bilan qaytadi ────────────────────────────
eq('notanish xato', socksErrorMessage(new Error('Nimadir noto\'g\'ri')), 'Nimadir noto\'g\'ri');

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
