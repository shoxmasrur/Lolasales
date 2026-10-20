import { izohlarniAjrat, kalitSozMos } from '@/domain/services/izohFiltri';
import type { ChannelComment } from '@/domain/services/ITelegramGateway';

/** Qo'lda: npm run test:izoh-filtri --workspace=server */
let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};

const KW = ['menga xabar bering', 'menga yozing', 'qiziqaman', 'narxi', '+'];
const A_ID = '101';
const B_ID = '202';

const user = (id: string, hash: string | null = `h${id}`) => ({
  kind: 'user' as const,
  peer: { telegramUserId: id, accessHash: hash, username: `u${id}`, firstName: `Ism${id}`, lastName: null },
  fullName: `Ism${id}`,
});
const izoh = (id: number, text: string, author: ChannelComment['author'], minut: number): ChannelComment => ({
  id, postId: 7, date: new Date(Date.UTC(2026, 9, 20, 10, minut)), text, author,
});

const C_USER_A1 = izoh(1, 'Menga xabar bering', user(A_ID), 1);
const C_USER_A2 = izoh(2, 'narxi qancha?', user(A_ID), 5);
const C_ANON = izoh(3, '+', { kind: 'anonim', title: 'Lola kanal' }, 2);
const C_USER_B = izoh(4, 'qiziqaman', user(B_ID), 3);
const C_NOKW = izoh(5, 'zo\'r post', user('303'), 4);

check('kalit so\'z', kalitSozMos('Assalomu alaykum, menga xabar bering!', KW), true);
check('katta harf', kalitSozMos('MENGA YOZING', KW), true);
check('apostrof turlari', kalitSozMos("qiziqaman, ma'lumot bering", ['ma‘lumot']), true);
check('apostrof ʻ', kalitSozMos('maʻlumot kerak', ["ma'lumot"]), true);
check('plyus yolg\'iz', kalitSozMos(' + ', KW), true);
check('plyus matn ichida emas', kalitSozMos('2+2', KW), false);
check('mos emas', kalitSozMos('zo\'r post', KW), false);
check('bo\'sh kalit e\'tiborsiz', kalitSozMos('nimadir', ['', '  ']), false);

const r = izohlarniAjrat([C_USER_A1, C_USER_A2, C_ANON, C_USER_B], KW, new Set([B_ID]));
check('bir odamdan bitta', r.filter((x) => x.author.kind === 'user' && x.author.peer.telegramUserId === A_ID).length, 1);
check('eng oxirgisi qoladi', r.find((x) => x.author.kind === 'user' && x.author.peer.telegramUserId === A_ID)?.id, 2);
check('anonim tanlanmaydi', r.find((x) => x.author.kind === 'anonim')?.tanlasaBoladi, false);
check('mavjud mijoz belgilanadi', r.find((x) => x.author.kind === 'user' && x.author.peer.telegramUserId === B_ID)?.mavjudMijoz, true);
check('yangi odam mavjud emas', r.find((x) => x.id === 2)?.mavjudMijoz, false);
check('yangi odam tanlasa bo\'ladi', r.find((x) => x.id === 2)?.tanlasaBoladi, true);
check('yangisi birinchi', r.map((x) => x.id), [2, 4, 3]);
check('filtr ishlaydi', izohlarniAjrat([C_NOKW], KW, new Set()).length, 0);
check('filtrsiz', izohlarniAjrat([C_NOKW], null, new Set()).length, 1);
check('access_hash yo\'q — yozib bo\'lmaydi',
  izohlarniAjrat([izoh(9, '+', user('404', null), 1)], KW, new Set())[0]?.tanlasaBoladi, false);

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
