import bigInt from 'big-integer';
import { MAX_PAYLOAD_BAYT, tgMetod, tgTana } from '@/infrastructure/telegram/tgSanitize';

/**
 * Qo'lda ishga tushiriladi: npm run test:tg-sanitize
 *
 * NEGA TEKSHIRILADI: bu funksiya jurnalga NIMA tushishini belgilaydi.
 * Yashirish qoidasi buzilsa parol yoki SMS kodi ochiq matnda jadvalga
 * yozilib qoladi; chegaralar buzilsa bitta chaqiruv jurnalga yuzlab
 * kilobayt tiqib, jadvalni yeb qo'yadi.
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

// ── 1. Kredensiallar yashiriladi, telefon raqami qoladi ────────────────
// HAR BIR `MAXFIY` a'zosi uchun bitta tekshiruv — ro'yxat shu spec bilan
// QADAM-BAQADAM (lockstep) yangilanishi kerak: tgSanitize.ts'da yangi
// maxfiy kalit qo'shilsa-yu, bu yerga tekshiruv qo'shilmasa, keyingi
// safar xuddi shu tarzda (Fix 2/3'dagidek) sezilmay qolishi mumkin.
{
  const t = tgTana({
    phoneNumber: '+998901234567',
    password: 'maxfiy-parol',
    newPasswordHash: Buffer.alloc(32),
    srpId: 'srp-id-qiymati',
    A: 'srp-A-qiymati',
    M1: 'srp-M1-qiymati',
    phoneCode: '54321',
    phoneCodeHash: 'abc',
    apiHash: 'deadbeef',
    session: 'session-string',
    authKey: 'auth-key-qiymati',
    hint: 'sevimli-mushugim',
    emailUnconfirmedPattern: 'a***b@gmail.com',
    loginEmailPattern: 'c***d@gmail.com',
  }) as Record<string, unknown>;

  eq('phoneNumber qoladi', t.phoneNumber, '+998901234567');
  eq('password yashirin', t.password, '[maxfiy]');
  eq('newPasswordHash yashirin', t.newPasswordHash, '[maxfiy]');
  eq('srpId yashirin', t.srpId, '[maxfiy]');
  eq('A yashirin', t.A, '[maxfiy]');
  eq('M1 yashirin', t.M1, '[maxfiy]');
  eq('phoneCode yashirin', t.phoneCode, '[maxfiy]');
  eq('phoneCodeHash yashirin', t.phoneCodeHash, '[maxfiy]');
  eq('apiHash yashirin', t.apiHash, '[maxfiy]');
  eq('session yashirin', t.session, '[maxfiy]');
  eq('authKey yashirin', t.authKey, '[maxfiy]');
  eq('hint yashirin', t.hint, '[maxfiy]');
  eq('emailUnconfirmedPattern yashirin', t.emailUnconfirmedPattern, '[maxfiy]');
  eq('loginEmailPattern yashirin', t.loginEmailPattern, '[maxfiy]');
}

// ── 2. bigInt va Buffer ────────────────────────────────────────────────
{
  const t = tgTana({
    userId: bigInt('7770000000'),
    bytes: Buffer.alloc(4096),
  }) as Record<string, unknown>;

  eq('bigInt satrga', t.userId, '7770000000');
  eq('Buffer baytlar soni', t.bytes, '<4096 bayt>');
}

// ── 3. Uzun satr kesiladi va uzunligi ko'rsatiladi ─────────────────────
{
  const t = tgTana({ message: 'a'.repeat(1240) }) as Record<string, unknown>;
  eq('uzun satr kesildi', t.message, `${'a'.repeat(500)}…(1240 belgi)`);

  const qisqa = tgTana({ message: 'salom' }) as Record<string, unknown>;
  eq('qisqa satr tegilmaydi', qisqa.message, 'salom');
}

// ── 4. Uzun massiv qisqaradi ───────────────────────────────────────────
{
  const t = tgTana({ users: Array.from({ length: 103 }, (_, i) => i) }) as Record<string, unknown>;
  const users = t.users as unknown[];
  eq('massiv uzunligi', users.length, 21);
  eq('oxirgi element — qoldiq soni', users[20], '…yana 83 ta');
}

// ── 5. Chuqurlik chegarasi va halqa ────────────────────────────────────
{
  const chuqur = { a: { b: { c: { d: { e: { f: { g: 'tub' } } } } } } };
  const t = tgTana(chuqur) as any;
  eq('6-chuqurlikda to\'xtaydi', t.a.b.c.d.e.f, '…');

  const halqa: Record<string, unknown> = { nom: 'x' };
  halqa.ozi = halqa;
  const h = tgTana(halqa) as Record<string, unknown>;
  eq('halqa belgilanadi', h.ozi, '…halqa');
}

// ── 6. Kutubxonaning ichki havolalari tushmaydi ────────────────────────
// GramJS xabar obyekti `_client` orqali BUTUN klientga havola qiladi.
// U tushib qolsa, bitta hodisa jurnalga sessiya va sozlamalarni ham
// sudrab kelardi.
{
  const t = tgTana({ id: 5, _client: { session: 'MAXFIY' }, _chat: { x: 1 } }) as Record<string, unknown>;
  eq('_ bilan boshlangan kalitlar tashlanadi', Object.keys(t).join(','), 'id');
}

// ── 7. Klass nomi `_` ga chiqadi ───────────────────────────────────────
{
  class SendMessage {
    className = 'messages.SendMessage';
    message = 'salom';
  }
  const t = tgTana(new SendMessage()) as Record<string, unknown>;
  eq('klass nomi _ da', t._, 'messages.SendMessage');
  eq('className takrorlanmaydi', t.className, undefined);
  eq('tgMetod nomni oladi', tgMetod(new SendMessage()), 'messages.SendMessage');
  eq('tgMetod nomsizda', tgMetod({ x: 1 }), "noma'lum");
}

// ── 8. 8 KB dan katta javob qisqartiriladi ─────────────────────────────
{
  const katta = { className: 'messages.Dialogs', matn: 'b'.repeat(400) };
  const koplab = { className: 'messages.Dialogs', dialogs: Array.from({ length: 20 }, () => katta) };
  const t = tgTana(koplab) as Record<string, unknown>;
  eq('qisqartirildi belgisi', t.qisqartirildi, true);
  eq('klass nomi saqlanadi', t._, 'messages.Dialogs');
  eq('hajm 8 KB dan katta edi', (t.hajm as number) > MAX_PAYLOAD_BAYT, true);

  // UTF-8 baytlar satrni uzunligidan ko'ra ko'p bo'lsa, baytlarga asosan
  // qisqartiriladi. Kirill xarflari (masalan, 'А') 2 bayt tutadi.
  // 300 ta Kirill harfi (600 bayt) × 14 ob'ekt = 8400+ bayt > 8192,
  // lekin qo'lda `.length` hisoblansa 300 × 14 = 4200 < 8192.
  const kirill = { className: 'messages.Response', text: 'А'.repeat(300) };
  const koplamKirill = { className: 'messages.Responses', items: Array.from({ length: 14 }, () => kirill) };
  const t2 = tgTana(koplamKirill) as Record<string, unknown>;
  eq('UTF-8 bayt hisoblandi', t2.qisqartirildi, true);
  eq('hajm UTF-8 baytlarda', (t2.hajm as number) > MAX_PAYLOAD_BAYT, true);
}

// ── 8b. Funksiya undefined qaytaradi, xato EMAS ────────────────────────
// Funksiya jurnalda hech narsa anglatmaydi va `qiymat()` uning uchun
// `undefined` qaytaradi. `JSON.stringify(undefined)` esa `undefined` qaytaradi.
// Eski kod bu xolda `Buffer.byteLength` chaqirmasdan `undefined` ni to'g'ri
// qaytargan edi. Yangisi esa `bayt` hisoblashdan oldin tekshiradi.
{
  const t = tgTana(() => 'salom');
  eq('funksiya undefined qaytaradi', t, undefined);
}

// ── 9. Buzuq kirishda ham xato otmaydi ─────────────────────────────────
{
  const yovuz = {
    get portlaydi(): never {
      throw new Error('getter yiqildi');
    },
  };
  eq('xato otmaydi', typeof tgTana(yovuz), 'object');
  eq('sabab ko\'rsatiladi', (tgTana(yovuz) as Record<string, unknown>).xato, 'tahlil qilinmadi');
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
