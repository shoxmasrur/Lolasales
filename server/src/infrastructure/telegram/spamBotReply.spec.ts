import { parseSpamBotReply } from '@/infrastructure/telegram/spamBotReply';

/** Qo'lda ishga tushiriladigan tekshiruv: npx tsx src/infrastructure/telegram/spamBotReply.spec.ts */
const CASES: Array<{ name: string; text: string; expect: string }> = [
  {
    name: 'toza akkaunt',
    text: 'Good news, no limits are currently applied to your account. You\'re free as a bird!',
    expect: 'clean',
  },
  {
    name: 'toza + umumiy tushuntirish (2 xabar)',
    text:
      'Good news, no limits are currently applied to your account. You\'re free as a bird!\n\n' +
      'Unfortunately, some phone numbers may trigger a harsh response from our anti-spam systems. ' +
      'If you think this is the case with you, you can submit a complaint to our moderators.',
    expect: 'clean',
  },
  {
    // Real javob: telegram_oila akkaunti, 2026-08-04.
    name: 'toza — ruscha ("свободен от каких-либо ограничений")',
    text: 'Ваш аккаунт свободен от каких-либо ограничений.',
    expect: 'clean',
  },
  {
    // Real javob: debitor_test akkaunti. Bu FAQAT umumiy tushuntirish —
    // hukm emas. SpamBot uni sog'lom akkauntga ham yozadi, shuning uchun
    // "cheklangan" deb taxmin qilmaymiz.
    name: 'noaniq — faqat umumiy tushuntirish, hukm yo\'q',
    text:
      'Unfortunately, some phone numbers may trigger a harsh response from our anti-spam '
      + 'systems. If you think this is the case with you, you can submit a complaint to our '
      + 'moderators or subscribe to Telegram Premium to get less strict limits.',
    expect: 'check_failed',
  },
  {
    name: 'cheklangan, sanasiz',
    text:
      'I\'m very sorry that you had to contact me. Unfortunately, some phone numbers may trigger ' +
      'a harsh response from our anti-spam systems.',
    expect: 'limited',
  },
  {
    name: 'cheklangan, sana bilan',
    text: 'Your account is now limited until 12 September 2026.',
    expect: 'limited',
  },
  {
    name: 'faqat umumiy tushuntirish — hukm yo\'q',
    text:
      'Unfortunately, some phone numbers may trigger a harsh response from our anti-spam systems. ' +
      'If you think this is the case with you, you can submit a complaint to our moderators or ' +
      'subscribe to Telegram Premium to get less strict limits.',
    expect: 'check_failed',
  },
  {
    name: 'ruscha toza',
    text: 'Хорошие новости, никаких ограничений на ваш аккаунт не наложено!',
    expect: 'clean',
  },
  {
    name: 'ruscha cheklangan',
    text: 'Мне очень жаль, что вам пришлось обратиться ко мне. Ваш аккаунт ограничен до 12.09.2026',
    expect: 'limited',
  },
  { name: 'bo\'sh javob', text: '   ', expect: 'check_failed' },
];

let failed = 0;
for (const c of CASES) {
  const result = parseSpamBotReply(c.text);
  const ok = result.status === c.expect;
  if (!ok) failed += 1;
  console.log(
    `${ok ? '✓' : '✗'} ${c.name}: ${result.status}${result.until ? ' → ' + result.until.toISOString().slice(0, 10) : ''}`,
  );
}
console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
