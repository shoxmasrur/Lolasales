import { logEntryToRow } from '@/shared/logEntry';

/**
 * Qo'lda ishga tushiriladi: npm run test:log-entry
 *
 * NEGA TEKSHIRILADI: bu funksiya jurnalning bazadagi ko'rinishini
 * belgilaydi. Daraja filtri buzilsa jadval `info` qatorlari bilan
 * to'lib ketadi; ustun ajratish buzilsa dashboarddagi filtrlar
 * ishlamaydi.
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

const ASOS = { time: 1786190965467, pid: 93549, hostname: 'muhtasham' };

// ── 1. Past darajalar tashlanadi ────────────────────────────────────────
eq('debug (20)', logEntryToRow({ ...ASOS, level: 20, msg: 'x' }), null);
eq('info (30)', logEntryToRow({ ...ASOS, level: 30, msg: 'x' }), null);

// ── 2. warn va error qabul qilinadi ────────────────────────────────────
eq('warn (40)', logEntryToRow({ ...ASOS, level: 40, msg: 'x' })?.level, 'warn');
eq('error (50)', logEntryToRow({ ...ASOS, level: 50, msg: 'x' })?.level, 'error');
// `fatal` uchun jadvalda uchinchi daraja yo'q — u ham "xato".
eq('fatal (60)', logEntryToRow({ ...ASOS, level: 60, msg: 'x' })?.level, 'error');

// ── 3. Kontekst maydonlari ustunlarga ajraladi ─────────────────────────
{
  const row = logEntryToRow({
    ...ASOS,
    level: 50,
    scope: 'dispatcher',
    msg: 'Xabar yuborilmadi',
    shartnoma: '3090MSO25A5',
    akkaunt: 'Madina',
    mijoz: 'Aziz Karimov',
    conversationId: '21c2483b',
    err: { message: 'PEER_ID_INVALID' },
  });
  eq('shartnoma ustunda', row?.shartnoma, '3090MSO25A5');
  eq('akkaunt ustunda', row?.akkaunt, 'Madina');
  eq('mijoz ustunda', row?.mijoz, 'Aziz Karimov');
  eq('scope ustunda', row?.scope, 'dispatcher');

  // ── 4. Ustunga chiqqanlar payload'da TAKRORLANMAYDI ──────────────────
  // Aks holda har qator ikki marta saqlanardi va jadval behuda o'sardi.
  eq('payload faqat qolganini saqlaydi', row?.payload, {
    conversationId: '21c2483b',
    err: { message: 'PEER_ID_INVALID' },
  });
}

// ── 5. Yo'q maydonlar null bo'ladi, bo'sh satr emas ────────────────────
{
  const row = logEntryToRow({ ...ASOS, level: 40, msg: 'x' });
  eq('scope yo\'q', row?.scope, null);
  eq('shartnoma yo\'q', row?.shartnoma, null);
  eq('payload bo\'sh', row?.payload, {});
}

// ── 5b. Telegram bayrog'i `info` ni jurnalga o'tkazadi ─────────────────
// Bu YAGONA istisno: 052-migratsiya `info` ni ataylab to'sadi, chunki
// hajmi bir necha barobar katta. Audit izi esa aynan shu darajada
// yoziladi va alohida filtrda ko'riladi.
{
  const row = logEntryToRow({
    ...ASOS,
    level: 30,
    flag: 'telegram',
    scope: 'tg-api',
    msg: '→ messages.SendMessage',
    akkaunt: 'Madina',
    metod: 'messages.SendMessage',
  });
  eq('bayroqli info o\'tadi', row?.level, 'info');
  eq('bayroq ustunda', row?.flag, 'telegram');
  eq('akkaunt ustunda', row?.akkaunt, 'Madina');
  // Bayroq ustunga chiqqan — payloadda takrorlanmaydi.
  eq('bayroq payloadda yo\'q', row?.payload, { metod: 'messages.SendMessage' });
}

// ── 5c. Bayroqsiz `info` avvalgidek tashlanadi ─────────────────────────
eq('bayroqsiz info', logEntryToRow({ ...ASOS, level: 30, msg: 'x' }), null);

// ── 5d. Notanish bayroq `info` ni o'tkazmaydi ──────────────────────────
// Aks holda istalgan kod `flag` yozib, jadvalni to'ldirib yuborishi mumkin.
eq('notanish bayroq', logEntryToRow({ ...ASOS, level: 30, flag: 'boshqa', msg: 'x' }), null);

// ── 5e. Bayroqli xato ikkala ro'yxatga ham tushadi ─────────────────────
{
  const row = logEntryToRow({ ...ASOS, level: 50, flag: 'telegram', msg: '← 420 FLOOD_WAIT_35' });
  eq('daraja xato bo\'lib qoladi', row?.level, 'error');
  eq('bayroq ham turadi', row?.flag, 'telegram');
}

// ── 5f. Bayroqsiz warn/error da `flag` null ────────────────────────────
eq('bayroqsizda null', logEntryToRow({ ...ASOS, level: 40, msg: 'x' })?.flag, null);

// ── 6. Uzun msg kesiladi ───────────────────────────────────────────────
{
  const row = logEntryToRow({ ...ASOS, level: 40, msg: 'a'.repeat(2500) });
  eq('msg uzunligi', row?.msg.length, 2000);
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
