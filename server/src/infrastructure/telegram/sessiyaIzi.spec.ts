import { SessiyaIzi, olimKodi, type OchilishMalumoti } from '@/infrastructure/telegram/sessiyaIzi';
import { tgAuditOrnat } from '@/infrastructure/telegram/tgAudit';
import { SessiyaOgohlantiruvchi, sessiyaXabari } from '@/application/services/SessiyaOgohlantiruvchi';
import type { DomainEvent } from '@/domain/services/support';

/**
 * Qo'lda ishga tushiriladi: npm run test:sessiya-izi
 *
 * NEGA TEKSHIRILADI: bu modul har bir Telegram so'rovining yo'lida turadi
 * va "sessiya o'ldi" degan xulosani chiqaradi. Yolg'on signal (login
 * tugamagan ulanishdagi odatiy xato) operatorni chalg'itadi, o'tkazib
 * yuborilgan o'lim esa butun modulning ma'nosini yo'q qiladi.
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

interface Qator {
  daraja: 'info' | 'warn';
  obj: Record<string, unknown>;
  msg: string;
}

function muhit(): { qatorlar: Qator[]; iz: SessiyaIzi; surish: (ms: number) => void } {
  const qatorlar: Qator[] = [];
  let t = 1_000_000;
  const iz = new SessiyaIzi({
    yozuvchi: {
      info: (obj, msg) => qatorlar.push({ daraja: 'info', obj, msg }),
      warn: (obj, msg) => qatorlar.push({ daraja: 'warn', obj, msg }),
    },
    vaqt: () => t,
    jarayonYoshiSek: () => 42,
  });
  return { qatorlar, iz, surish: (ms) => (t += ms) };
}

function ochilish(yangi: boolean): OchilishMalumoti {
  return {
    sabab: yangi ? 'login-kod' : 'bootstrap',
    yangi,
    apiId: 12345,
    imzo: { deviceModel: 'Debitor Agent', systemVersion: 'macOS', appVersion: '1.0', langCode: 'en', systemLangCode: 'en' },
    proksi: '10.0.0.1:1080',
    dc: 2,
    dcManzil: '149.154.167.51:443',
    kalitIzi: 'abcd1234',
  };
}

const olimlar = (q: Qator[]): Qator[] => q.filter((x) => x.obj.hodisa === 'oldi');

// ── 1. Kodlarni tanish ─────────────────────────────────────────────────
eq('AUTH_KEY_UNREGISTERED — o\'lim', olimKodi('AUTH_KEY_UNREGISTERED'), 'AUTH_KEY_UNREGISTERED');
eq('AUTH_KEY_DUPLICATED — o\'lim', olimKodi('AUTH_KEY_DUPLICATED'), 'AUTH_KEY_DUPLICATED');
eq('INPUT_USER_DEACTIVATED — mijozniki, o\'lim EMAS', olimKodi('INPUT_USER_DEACTIVATED'), null);
eq('FLOOD_WAIT — o\'lim emas', olimKodi('FLOOD_WAIT_35'), null);
eq('toString kabi meros kalit — o\'lim emas', olimKodi('toString'), null);

// ── 2. Eski sessiya o'ldi: bitta hisobot, to'liq kontekst bilan ────────
{
  const { qatorlar, iz, surish } = muhit();
  iz.http('Madina', 'login/qr', { foydalanuvchi: 'a@b.uz', ip: '127.0.0.1', forwardedFor: '84.54.1.1', userAgent: 'Chrome' });
  iz.ochildi('Madina', ochilish(false));
  iz.sorov('Madina', 'updates.GetState', null);
  iz.telegramKorinishi('Madina', [
    {
      joriy: true, rasmiyIlova: false, tasdiqlanmagan: true, parolKutilmoqda: false,
      qurilma: 'Debitor Agent', platforma: '', tizim: 'macOS', apiId: 12345, ilova: 'debitor 1.0',
      yaratilgan: null, faol: null, ip: '213.148.21.37', mamlakat: 'UZ', hudud: '',
    },
    {
      joriy: false, rasmiyIlova: true, tasdiqlanmagan: false, parolKutilmoqda: false,
      qurilma: 'iPhone 15', platforma: 'iOS', tizim: '18', apiId: 1, ilova: 'Telegram iOS 11',
      yaratilgan: null, faol: null, ip: '84.54.1.1', mamlakat: 'UZ', hudud: '',
    },
  ]);
  surish(5_000);
  iz.sorov('Madina', 'messages.SendMessage', 'AUTH_KEY_UNREGISTERED');
  iz.sorov('Madina', 'messages.SendMessage', 'AUTH_KEY_UNREGISTERED');

  const o = olimlar(qatorlar);
  eq('o\'lim BIR marta e\'lon qilinadi', o.length, 1);
  eq('daraja warn', o[0]?.daraja, 'warn');
  eq('akkaunt ustuni', o[0]?.obj.akkaunt, 'Madina');
  eq('metod', o[0]?.obj.metod, 'messages.SendMessage');
  eq('oxirgi muvaffaqiyatli so\'rov', o[0]?.obj.oxirgiOk, { metod: 'updates.GetState', sekOldin: 5 });
  eq('jarayon yoshi', o[0]?.obj.jarayonYoshiSek, 42);
  eq('proksi hisobotda', (o[0]?.obj.ochilish as OchilishMalumoti).proksi, '10.0.0.1:1080');
  const k = o[0]?.obj.telegramKorinishi as { joriy: { ip: string }; boshqalar: unknown[] };
  eq('Telegram ko\'rgan IP hisobotda', k.joriy.ip, '213.148.21.37');
  eq('boshqa qurilmalar hisobotda', k.boshqalar.length, 1);
  eq('panel amali hisobotda', (o[0]?.obj.http as { forwardedFor: string }).forwardedFor, '84.54.1.1');
  eq('tasdiqlanmagan sessiya — warn',
    qatorlar.find((x) => x.obj.hodisa === 'telegram-korinishi')?.daraja, 'warn');
}

// ── 3. Login tugamagan ulanishda AUTH_KEY_UNREGISTERED — o'lim emas ────
{
  const { qatorlar, iz, surish } = muhit();
  iz.ochildi('Yangi', ochilish(true));
  iz.sorov('Yangi', 'updates.GetState', 'AUTH_KEY_UNREGISTERED');
  eq('login oldidan — hisobot yo\'q', olimlar(qatorlar).length, 0);

  iz.kirdi('Yangi', 'qr');
  surish(90_000);
  iz.sorov('Yangi', 'updates.GetState', 'AUTH_KEY_UNREGISTERED');
  const o = olimlar(qatorlar);
  eq('logindan keyin — hisobot bor', o.length, 1);
  eq('sessiya yoshi logindan sanaladi', o[0]?.obj.sessiyaYoshiSek, 90);
  eq('kirish usuli', o[0]?.obj.kirishUsuli, 'qr');
}

// ── 4. O'zimiz chiqarganimizdan keyingi xato — o'lim emas ──────────────
{
  const { qatorlar, iz } = muhit();
  iz.ochildi('Chiqqan', ochilish(false));
  iz.ozimizYopdik('Chiqqan', 'operator', true);
  iz.sorov('Chiqqan', 'auth.LogOut', 'AUTH_KEY_UNREGISTERED');
  eq('o\'zimiz chiqardik — hisobot yo\'q', olimlar(qatorlar).length, 0);
  eq('o\'zimiz chiqarganimiz yozildi', qatorlar.some((x) => x.obj.hodisa === 'ozimiz-logout'), true);
}

// ── 5. Ulanish PAYTIDAGI o'lim ham ushlanadi ───────────────────────────
{
  const { qatorlar, iz } = muhit();
  iz.ochilmoqda('Erta', ochilish(false));
  eq('ochilmoqda jurnalga yozmaydi', qatorlar.length, 0);
  iz.sorov('Erta', 'help.GetConfig', 'AUTH_KEY_UNREGISTERED');
  eq('ulanish paytidagi o\'lim', olimlar(qatorlar).length, 1);
}

// ── 6. Qayta ulanish hisobni yangilaydi — ikkinchi o'lim ham ko'rinadi ─
{
  const { qatorlar, iz } = muhit();
  iz.ochildi('Qayta', ochilish(false));
  iz.sorov('Qayta', 'x', 'SESSION_REVOKED');
  iz.ochildi('Qayta', ochilish(false));
  iz.sorov('Qayta', 'x', 'SESSION_REVOKED');
  eq('har ulanishda alohida hisobot', olimlar(qatorlar).length, 2);
}

// ── 7. Yozuvchi yiqilsa ham chaqiruvchi yiqilmaydi ─────────────────────
{
  const iz = new SessiyaIzi({
    yozuvchi: {
      info: () => { throw new Error('jurnal yiqildi'); },
      warn: () => { throw new Error('jurnal yiqildi'); },
    },
  });
  let otildi = false;
  try {
    iz.ochildi('X', ochilish(false));
    iz.sorov('X', 'm', 'AUTH_KEY_UNREGISTERED');
    iz.http('X', 'logout', { foydalanuvchi: null, ip: null, forwardedFor: null, userAgent: null });
  } catch {
    otildi = true;
  }
  eq('jurnal xatosi tashqariga chiqmaydi', otildi, false);
}

// ── 8. tgAudit o'rami kuzatuvchini chaqiradi va xatoni o'zgartirmaydi ──
{
  const korildi: Array<[string, string | null]> = [];
  const jim = { info: () => undefined, error: () => undefined };
  const xato = Object.assign(new Error('x'), { errorMessage: 'AUTH_KEY_UNREGISTERED', code: 401 });
  let n = 0;
  const client: Record<string, unknown> = {
    invoke: async () => {
      n += 1;
      if (n === 2) throw xato;
      return { className: 'Ok' };
    },
  };
  tgAuditOrnat(client, 'Madina', {
    yozuvchi: jim,
    kuzat: (m, x) => {
      korildi.push([m, x]);
      throw new Error('kuzatuvchi yiqildi');
    },
  });
  const invoke = client.invoke as (r: unknown) => Promise<unknown>;
  await invoke({ className: 'updates.GetState' });
  let ushlandi: unknown = null;
  try {
    await invoke({ className: 'updates.GetState' });
  } catch (err) {
    ushlandi = err;
  }
  eq('kuzatuvchi muvaffaqiyat va xatoni ko\'radi', korildi, [
    ['updates.GetState', null],
    ['updates.GetState', 'AUTH_KEY_UNREGISTERED'],
  ]);
  eq('asl xato o\'zgarmay qaytadi (kuzatuvchi yiqilsa ham)', ushlandi === xato, true);
}

// ── 9. `sorov` o'limni BIR marta qaytaradi — ogohlantirish shunga tayanadi ─
{
  const { iz } = muhit();
  iz.ochildi('Bot', ochilish(false));
  eq('muvaffaqiyat — null', iz.sorov('Bot', 'm', null), null);
  eq('oddiy xato — null', iz.sorov('Bot', 'm', 'FLOOD_WAIT_5'), null);
  eq('o\'lim — kod qaytadi', iz.sorov('Bot', 'm', 'AUTH_KEY_UNREGISTERED'), 'AUTH_KEY_UNREGISTERED');
  eq('ikkinchi marta — null', iz.sorov('Bot', 'm', 'AUTH_KEY_UNREGISTERED'), null);

  const jim = new SessiyaIzi({
    yozuvchi: { info: () => undefined, warn: () => { throw new Error('yiqildi'); } },
  });
  jim.ochildi('Bot', ochilish(false));
  eq('yozuv yiqilsa ham kod qaytadi', jim.sorov('Bot', 'm', 'SESSION_REVOKED'), 'SESSION_REVOKED');
}

// ── 10. Ogohlantirish xizmati: matn va yuborish ────────────────────────
{
  const hodisa = {
    type: 'telegram.session_lost' as const,
    accountId: 'a1', label: 'Charos', phone: '+998703217854', kod: 'AUTH_KEY_UNREGISTERED',
  };
  const matn = sessiyaXabari(hodisa, new Date('2026-10-05T06:16:05Z'), 'Asia/Tashkent', 'https://panel.uz');
  eq('matnda akkaunt va raqam', matn.includes('Charos (+998 70 321 78 54)'), true);
  eq('matnda Toshkent vaqti', matn.includes('11:16'), true);
  eq('matnda kod', matn.includes('AUTH_KEY_UNREGISTERED'), true);
  eq('matnda havola', matn.includes('https://panel.uz/telegram'), true);

  const yuborilgan: string[] = [];
  const tinglovchilar = new Set<(e: DomainEvent) => void>();
  const shina = {
    publish: (e: DomainEvent) => tinglovchilar.forEach((h) => h(e)),
    subscribe: (h: (e: DomainEvent) => void) => {
      tinglovchilar.add(h);
      return () => tinglovchilar.delete(h);
    },
  };
  new SessiyaOgohlantiruvchi(shina, { xabarYubor: async (m) => (yuborilgan.push(m), true) }, 'Asia/Tashkent', null).start();
  shina.publish({ type: 'telegram.status', accountId: 'a1', status: 'logged_out' });
  shina.publish(hodisa);
  await new Promise((r) => setTimeout(r, 10));
  eq('faqat session_lost uchun xabar ketadi', yuborilgan.length, 1);
}

if (failed > 0) {
  console.log(`\n${failed} ta sinov yiqildi`);
  process.exit(1);
}
console.log('\nBarcha sinovlar o\'tdi');
