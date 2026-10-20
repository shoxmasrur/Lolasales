import { errors } from 'teleproto';
import {
  hasCode,
  isEditTimeExpired,
  isMessageGone,
  isMessageNotModified,
  isOwnAccountDeactivated,
  isPasswordNeeded,
  isTargetDeactivated,
} from '@/infrastructure/telegram/telegramErrors';

let failed = 0;

/** Shartni tekshirish va natijani qayd etish. */
function check(description: string, condition: boolean): void {
  if (!condition) failed += 1;
  console.log(`${condition ? '✓' : '✗'} ${description}`);
}

/**
 * Qo'lda ishga tushiriladi: npm run test:telegram-errors
 *
 * Bu test bir marta jimgina buzilgan xatoni qo'riqlaydi: kod `errorMessage`
 * maydonida keladi, `message` da esa inglizcha matn turadi. Kutubxona
 * yangilanganda shu shart o'zgarsa, test darhol ko'rsatadi.
 */
const request = { className: 'auth.SignIn' } as never;

const CASES: Array<{ name: string; err: unknown; code: string }> = [
  {
    name: '2FA (SESSION_PASSWORD_NEEDED)',
    err: new errors.SessionPasswordNeededError({ request }),
    code: 'SESSION_PASSWORD_NEEDED',
  },
  {
    name: 'parol noto\'g\'ri (PASSWORD_HASH_INVALID)',
    err: new errors.PasswordHashInvalidError({ request }),
    code: 'PASSWORD_HASH_INVALID',
  },
  {
    name: 'spam filtri (PEER_FLOOD)',
    err: new errors.PeerFloodError({ request }),
    code: 'PEER_FLOOD',
  },
  {
    name: 'kod noto\'g\'ri (PHONE_CODE_INVALID)',
    err: new errors.PhoneCodeInvalidError({ request }),
    code: 'PHONE_CODE_INVALID',
  },
  {
    name: 'kod eskirgan (PHONE_CODE_EXPIRED)',
    err: new errors.PhoneCodeExpiredError({ request }),
    code: 'PHONE_CODE_EXPIRED',
  },
  {
    name: 'akkaunt o\'chirilgan (USER_DEACTIVATED)',
    err: new errors.UserDeactivatedError({ request }),
    code: 'USER_DEACTIVATED',
  },
];

for (const c of CASES) {
  const ok = hasCode(c.err, c.code);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${c.name}`);

  // Aynan shu sabab eski kod ishlamasdi — buni ham qayd etib qo'yamiz.
  const inMessageOnly = (c.err as Error).message.includes(c.code);
  if (inMessageOnly) {
    console.log(`    eslatma: "${c.code}" endi matnda ham bor — kutubxona o'zgargan`);
  }
}

// ── O'CHIRILGAN AKKAUNT: KIMNIKI? ──────────────────────────────────────
//
// PRODUKSIYADA KUYDIRGAN XATO (2026-08-19/20): mijozning Telegram akkaunti
// o'chirilgan bo'lsa Telegram `INPUT_USER_DEACTIVATED` qaytaradi. Kod esa
// `haystack.includes('USER_DEACTIVATED')` deb tekshirardi — va
// `INPUT_USER_DEACTIVATED` ning ICHIDA aynan shu satr bor. Natijada
// begonaning o'chirilgan akkaunti BIZNING akkauntimizga yozilib,
// "Fotima" `banned` holatiga o'tdi va undan umuman xabar ketmay qoldi.
// Telegramdan qo'lda yozilganda esa hech qanday muammo yo'q edi.
//
// Ikkalasi butunlay boshqa hodisa:
//   INPUT_USER_DEACTIVATED — YOZILAYOTGAN odam o'chirilgan (mijoz).
//   USER_DEACTIVATED       — BIZNING akkauntimiz o'chirilgan.
{
  const sendRequest = { className: 'messages.SendMessage' } as never;
  const mijozOchirilgan = new errors.InputUserDeactivatedError({ request: sendRequest });
  const ozimizOchirilgan = new errors.UserDeactivatedError({ request });

  const t1 = isTargetDeactivated(mijozOchirilgan);
  if (!t1) failed += 1;
  console.log(`${t1 ? '✓' : '✗'} INPUT_USER_DEACTIVATED — mijozniki deb tanildi`);

  const t2 = !isOwnAccountDeactivated(mijozOchirilgan);
  if (!t2) failed += 1;
  console.log(`${t2 ? '✓' : '✗'} INPUT_USER_DEACTIVATED BIZNING akkauntga yozilmaydi`);

  const t3 = isOwnAccountDeactivated(ozimizOchirilgan);
  if (!t3) failed += 1;
  console.log(`${t3 ? '✓' : '✗'} USER_DEACTIVATED — o'zimizniki deb tanildi`);

  const t4 = !isTargetDeactivated(ozimizOchirilgan);
  if (!t4) failed += 1;
  console.log(`${t4 ? '✓' : '✗'} USER_DEACTIVATED mijozniki deb tanilmaydi`);

  // Eski shart nega ishlamasligini hujjatlashtiramiz — keyingi o'quvchi
  // "sodda `includes` yetarli edi-ku" deb qaytarib qo'ymasin.
  const t5 = hasCode(mijozOchirilgan, 'USER_DEACTIVATED');
  if (!t5) failed += 1;
  console.log(`${t5 ? '✓' : '✗'} tuzoq saqlanib turibdi: INPUT_USER_DEACTIVATED ichida USER_DEACTIVATED bor`);
}

// 2FA alohida tekshiriladi: u login oqimini boshqaradi.
const twoFa = isPasswordNeeded(new errors.SessionPasswordNeededError({ request }));
if (!twoFa) failed += 1;
console.log(`${twoFa ? '✓' : '✗'} isPasswordNeeded() 2FA xatosini tanidi`);

// Boshqa xato 2FA deb qabul qilinmasligi kerak.
const notTwoFa = !isPasswordNeeded(new errors.PhoneCodeInvalidError({ request }));
if (!notTwoFa) failed += 1;
console.log(`${notTwoFa ? '✓' : '✗'} isPasswordNeeded() boshqa xatoni 2FA demadi`);

// ─── Tahrirlash va o'chirish xatolari ────────────────────────────────────
{
  const notModified = Object.assign(new Error('Content of the message was not modified'), {
    errorMessage: 'MESSAGE_NOT_MODIFIED',
  });
  check('MESSAGE_NOT_MODIFIED tanildi', isMessageNotModified(notModified));
  check('boshqa xato notModified emas', !isMessageNotModified(new Error('FLOOD_WAIT_5')));

  const expired = Object.assign(new Error('too old'), { errorMessage: 'MESSAGE_EDIT_TIME_EXPIRED' });
  check('MESSAGE_EDIT_TIME_EXPIRED tanildi', isEditTimeExpired(expired));

  const gone = Object.assign(new Error('bad id'), { errorMessage: 'MESSAGE_ID_INVALID' });
  check('MESSAGE_ID_INVALID "yo\'q" deb tanildi', isMessageGone(gone));
  check('MESSAGE_EDIT_TIME_EXPIRED "yo\'q" emas', !isMessageGone(expired));

  // MESSAGE_DELETE_FORBIDDEN — o'chirish RAD ETILGANINI bildiradi, xabar
  // Telegramda hali ham turibdi. "Yo'q" deb qabul qilinsa, muvaffaqiyatsiz
  // o'chirish muvaffaqiyat sifatida bazaga yozib qo'yiladi.
  const forbidden = Object.assign(new Error('cannot delete'), {
    errorMessage: 'MESSAGE_DELETE_FORBIDDEN',
  });
  check('MESSAGE_DELETE_FORBIDDEN "yo\'q" emas — o\'chirish rad etilgan, xabar hali turibdi', !isMessageGone(forbidden));
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
