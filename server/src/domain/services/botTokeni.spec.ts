import { kodliChat, tokenXatosi, type TelegramYangilanish } from '@/domain/services/botTokeni';

/** Qo'lda ishga tushiriladi: npm run test:bot-tokeni --workspace=server */

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

// ─── tokenXatosi ──────────────────────────────────────────────────────────
check('to\'g\'ri token', tokenXatosi('123456789:AAHdqTcvbXeFGHIJKlmNoPQRstuVWxyz012'), null);
check('bo\'sh', tokenXatosi('   '), 'Token kiritilmadi');
check('ikki nuqta yo\'q', tokenXatosi('123456789AAHdqTcvbXeFGHIJKlmNoPQRst'), "Token noto'g'ri ko'rinishda (BotFather bergan qiymatni to'liq nusxalang)");
check('id raqam emas', tokenXatosi('abc:AAHdqTcvbXeFGHIJKlmNoPQRstuVWxyz012'), "Token noto'g'ri ko'rinishda (BotFather bergan qiymatni to'liq nusxalang)");
check('sir juda qisqa', tokenXatosi('123456789:qisqa'), "Token noto'g'ri ko'rinishda (BotFather bergan qiymatni to'liq nusxalang)");
// Foydalanuvchi ko'pincha "bot" prefiksi yoki bo'sh joy bilan nusxalaydi.
check('oldi-keyni bo\'sh joy', tokenXatosi('  123456789:AAHdqTcvbXeFGHIJKlmNoPQRstuVWxyz012  '), null);

// ─── kodliChat ────────────────────────────────────────────────────────────
const yangilanish = (
  chatId: number,
  first: string,
  text: string | undefined,
  type = 'private',
): TelegramYangilanish => ({
  update_id: chatId,
  message: { chat: { id: chatId, type, first_name: first, username: `u${chatId}` }, text },
});

check('yangilanish yo\'q', kodliChat([], '123456'), null);
check(
  'kod mos kelgan shaxsiy chat',
  kodliChat([yangilanish(555, 'Ulugbek', '123456')], '123456'),
  { chatId: '555', nomi: 'Ulugbek', username: 'u555' },
);
// Guruhda o'sha kod yozilsa ham, xulosa SHAXSIY suhbatga ketadi.
check(
  'guruhda yozilgan kod topilmaydi',
  kodliChat([yangilanish(-100, 'Guruh', '123456', 'supergroup')], '123456'),
  null,
);
check(
  'boshqa matn topilmaydi',
  kodliChat([yangilanish(555, 'Ulugbek', '000000')], '123456'),
  null,
);
// Foydalanuvchi ko'pincha kod atrofida bo'sh joy bilan yuboradi.
check(
  'kod atrofidagi bo\'sh joy e\'tiborga olinmaydi',
  kodliChat([yangilanish(555, 'Ulugbek', '  123456  ')], '123456'),
  { chatId: '555', nomi: 'Ulugbek', username: 'u555' },
);
// Bir nechta mos kelsa BIRINCHISI olinadi — administrator kodni bir marta
// yuboradi, keyingi mos matnlar (masalan tasodifiy takror) hisobga olinmaydi.
check(
  'bir nechta mos kelsa birinchisi olinadi',
  kodliChat(
    [yangilanish(111, 'Birinchi', '123456'), yangilanish(222, 'Ikkinchi', '123456')],
    '123456',
  ),
  { chatId: '111', nomi: 'Birinchi', username: 'u111' },
);
check('xabarsiz yangilanish', kodliChat([{ update_id: 1 }], '123456'), null);
check(
  'matnsiz xabar',
  kodliChat([{ update_id: 1, message: { chat: { id: 1, type: 'private' } } }], '123456'),
  null,
);

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
