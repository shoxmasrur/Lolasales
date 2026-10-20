import { Api } from 'teleproto';
import bigInt from 'big-integer';
import { classifyLoginToken, isSamePhone, qrLoginUrl, qrRefreshDelayMs } from '@/infrastructure/telegram/qrLogin';

let failed = 0;

/** Shartni tekshirish va natijani qayd etish. */
function check(description: string, condition: boolean): void {
  if (!condition) failed += 1;
  console.log(`${condition ? '✓' : '✗'} ${description}`);
}

/**
 * Qo'lda ishga tushiriladi: npm run test:qr-login
 *
 * QR tsiklining o'zi haqiqiy Telegram bilan tekshiriladi. Bu yerda faqat
 * sof qismlar: havola formati, Telegram javobini tasniflash va raqam
 * solishtirish — oxirgisi xato skanerlangan akkaunt sessiyasini
 * saqlab qo'ymaslik uchun yagona to'siq.
 */

// ─── qrLoginUrl ───
check(
  'base64url: "+" va "/" o\'rniga "-" va "_"',
  qrLoginUrl(Buffer.from([0xfb, 0xff, 0x00])) === 'tg://login?token=-_8A',
);
check('padding ("=") qo\'yilmaydi', qrLoginUrl(Buffer.from([1])) === 'tg://login?token=AQ');

// ─── classifyLoginToken ───
const token = Buffer.from([1, 2, 3]);

const fresh = classifyLoginToken(new Api.auth.LoginToken({ expires: 1_700_000_000, token }));
check('LoginToken → token', fresh.kind === 'token');
if (fresh.kind === 'token') {
  check('token: havola', fresh.url === 'tg://login?token=AQID');
  check('token: muddat soniyadan sanaga', fresh.expiresAt.getTime() === 1_700_000_000_000);
}

const migrate = classifyLoginToken(new Api.auth.LoginTokenMigrateTo({ dcId: 4, token }));
check('LoginTokenMigrateTo → migrate', migrate.kind === 'migrate');
if (migrate.kind === 'migrate') {
  check('migrate: dcId', migrate.dcId === 4);
  check('migrate: token', migrate.token.equals(token));
}

const user = new Api.User({ id: bigInt(5), phone: '998901234567' } as never);
const auth = new Api.auth.Authorization({ user } as never);
const success = classifyLoginToken(new Api.auth.LoginTokenSuccess({ authorization: auth }));
check('LoginTokenSuccess + Authorization → success', success.kind === 'success');
if (success.kind === 'success') check('success: authorization o\'zi', success.authorization === auth);

const signUp = classifyLoginToken(
  new Api.auth.LoginTokenSuccess({ authorization: new Api.auth.AuthorizationSignUpRequired({}) }),
);
check('SignUpRequired → unknown (bizda ro\'yxatdan o\'tish yo\'q)', signUp.kind === 'unknown');

check('boshqa obyekt → unknown', classifyLoginToken({ className: 'Foo' }).kind === 'unknown');
check('null → unknown', classifyLoginToken(null).kind === 'unknown');

// ─── isSamePhone ───
check('Telegram formati (+ siz) va yozuv formati bir xil', isSamePhone('998901234567', '+998 90 123 45 67'));
check('boshqa raqam — mos emas', !isSamePhone('998901234568', '+998901234567'));
check('null — mos emas (sessiyani saqlamaymiz)', !isSamePhone(null, '+998901234567'));
check('undefined — mos emas', !isSamePhone(undefined, '+998901234567'));
check('noto\'g\'ri raqam — mos emas', !isSamePhone('12', '+998901234567'));

// ─── qrRefreshDelayMs ───
const MARGIN = 5_000;
const t0 = 1_790_921_000_000;
check('yangi token: expiresAt - margin - now', qrRefreshDelayMs(new Date(t0 + 30_000), t0, false, MARGIN) === 25_000);
check('o\'sha token: haqiqiy muddatdan keyin (+1s)', qrRefreshDelayMs(new Date(t0 + 30_000), t0, true, MARGIN) === 31_000);
check('yangi token, muddat o\'tib ketgan: kamida 1s', qrRefreshDelayMs(new Date(t0 - 10_000), t0, false, MARGIN) === 1_000);
check('o\'sha token, muddat o\'tib ketgan: kamida 1s', qrRefreshDelayMs(new Date(t0 - 10_000), t0, true, MARGIN) === 1_000);
// Server logi: expires 1790921506, so'rov 06:11:41 da (muddatdan ~10s oldin) o'sha token qaytgan.
const logExpires = 1_790_921_506_000;
const logNow = logExpires - 10_000;
check(
  'logdagi holat: o\'sha token ~1s emas, muddatdan keyin so\'raladi',
  qrRefreshDelayMs(new Date(logExpires), logNow, true, MARGIN) >= logExpires - logNow + 1_000,
);

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
