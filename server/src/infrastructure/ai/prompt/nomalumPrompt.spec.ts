import {
  nomalumJavobniOqi,
  nomalumSystemPrompt,
  nomalumUserPrompt,
} from '@/infrastructure/ai/prompt/nomalumPrompt';

/**
 * Qo'lda ishga tushiriladi: npm run test:nomalum-prompt --workspace=server
 *
 * NEGA KERAK: noma'lum agent mijoz ma'lumotini ko'rmasligi va mijozga "qarz"
 * demasligi shu testga bog'liq.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

const kirish = {
  personaName: 'Madina',
  sotuvRaqami: '71 200 74 00',
  urinishlar: 1,
  tarix: [
    { direction: 'in' as const, text: 'Salom' },
    { direction: 'out' as const, text: 'Assalomu alaykum' },
  ],
};

const sys = nomalumSystemPrompt(kirish);
check('system: persona ismi bor', sys.includes('Madina'));
check('system: sotuv raqami bor', sys.includes('71 200 74 00'));
check('system: "qarz" so\'zi umuman yo\'q', !/qarz/i.test(sys));
// Namunada haqiqiy mijozning shartnoma raqami turmasin: model uni "misol"
// sifatida takrorlab, begonaga birovning raqamini aytib qo'yishi mumkin.
check('system: shartnoma namunasi sintetik (1234ABC56DE)', sys.includes('"1234ABC56DE"'));

const usr = nomalumUserPrompt(kirish);
check('user: urinishlar chiqadi', usr.includes('1 marta'));
check('user: tarix qatorlari', usr.includes('Mijoz: Salom') && usr.includes('Siz: Assalomu alaykum'));
check('user: summa ko\'rinishi yo\'q', !/\d{3}\s?\d{3}/.test(usr));

const j = nomalumJavobniOqi({ reply: 'Salom', shartnomaRaqami: '1234ABC56DE', maqsad: 'xarid', operatorga: false });
check('javob: to\'g\'ri JSON', j?.reply === 'Salom' && j.shartnomaRaqami === '1234ABC56DE' && j.maqsad === 'xarid' && j.operatorga === false);
check('javob: noma\'lum maqsad -> nomalum', nomalumJavobniOqi({ reply: 'x', shartnomaRaqami: null, maqsad: 'uy', operatorga: false })?.maqsad === 'nomalum');
check('javob: bo\'sh reply -> null', nomalumJavobniOqi({ reply: '   ', shartnomaRaqami: null, maqsad: 'tolov', operatorga: false })?.reply === null);
check('javob: obyekt emas -> null', nomalumJavobniOqi('salom') === null && nomalumJavobniOqi(null) === null && nomalumJavobniOqi([]) === null);

if (failed > 0) {
  console.error(`\n${failed} ta tekshiruv yiqildi`);
  process.exit(1);
}
console.log('\nHammasi o\'tdi');
