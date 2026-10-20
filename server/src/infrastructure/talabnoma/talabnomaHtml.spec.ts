import { sahifalarSoni } from '@/infrastructure/talabnoma/ChromiumTalabnomaPdf';
import { talabnomaHtml, type TalabnomaMalumot } from '@/infrastructure/talabnoma/talabnomaHtml';

/** Qo'lda: npm run test:talabnoma-html --workspace=server */
let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};

const namuna: TalabnomaMalumot = {
  raqam: 7,
  sanaIso: '2026-10-16',
  fullName: 'Aliyev Sardor Botirovich',
  contractNo: '1234ABC56DE',
  contractDate: new Date(Date.UTC(2025, 2, 12)),
  objectName: 'Muhabbat Shahri',
  objectAddress: 'Тошкент шаҳар, Яшнобод тумани, “Амир Темур” МФЙ, Паркент кўчаси, № 327 b',
  summa: 18_900_000,
  rekvizit: {
    kompaniya: 'BARAKAT HOUSE', turi: 'МЧЖ', inn: '311053474', oked: '41201',
    hisob: '20208000705742909002', mfo: '01158',
    bank: 'Тошкент шаҳар, "КАПИТАЛБАНК" АТ БАНКИНИНГ АМАЛИЁТ БОШКАРМАСИ',
  },
};
const r = { fon: 'file:///a/fon.png', muhr: 'file:///a/muhr.png', imzo: 'file:///a/imzo.png' };
const html = talabnomaHtml(namuna, r);

check('raqam', html.includes('№ ET-07'), true);
check('preview raqam', talabnomaHtml({ ...namuna, raqam: null }, r).includes('№ ET-__'), true);
check('sana', html.includes('16.10.2026 й'), true);
check('murojaat', html.includes('Хурматли Aliyev Sardor Botirovich!'), true);
check('shartnoma sanasi va raqami', html.includes('<b>"12" март 2025 йил</b> №1234ABC56DE- сонли шартнома'), true);
check('manzil', html.includes('<b>Тошкент шаҳар, Яшнобод тумани, “Амир Темур” МФЙ, Паркент кўчаси, № 327 b манзилида</b>'), true);
check('obyekt nomi katta harfda', html.includes('<b>«MUHABBAT SHAHRI»</b> турар-жой'), true);
check('summa', html.includes('18 900 000,00 сўм'), true);
check('so\'z bilan', html.includes('(ўн саккиз миллион тўққиз юз минг сўм 00 тийин)'), true);
check('rekvizit', html.includes('Ҳ.р.: 20208000705742909002, МФО: 01158, ОКЭД: 41201, СТИР: 311053474'), true);
check('quruvchi va bank (namunadagidek qo\'shtirnoq)',
  html.includes('<u>ҚУРУВЧИ: МЧЖ “BARAKAT HOUSE”</u>, Тошкент шаҳар, "КАПИТАЛБАНК" АТ БАНКИНИНГ АМАЛИЁТ БОШКАРМАСИ, Ҳ.р.'), true);
check('BARAKAT namunada', html.includes('«BARAKAT HOUSE» МЧЖнинг қонуний тижорат вакили'), true);

const namuna2: TalabnomaMalumot = {
  ...namuna,
  rekvizit: { ...namuna.rekvizit, kompaniya: 'VATAN RESIDENCE', hisob: '20208000205409155001', inn: '308622786' },
};
const html2 = talabnomaHtml(namuna2, r);
check('kompaniya almashadi', html2.includes('«VATAN RESIDENCE» МЧЖнинг қонуний тижорат вакили'), true);
check('BARAKAT qolib ketmagan', html2.includes('BARAKAT'), false);
check('quruvchi almashadi', html2.includes('ҚУРУВЧИ: МЧЖ “VATAN RESIDENCE”'), true);

check('HTML qochirish', talabnomaHtml({ ...namuna, fullName: '<b>X</b>' }, r).includes('&lt;b&gt;X&lt;/b&gt;'), true);
check('rekvizit ham qochiriladi',
  talabnomaHtml({ ...namuna, rekvizit: { ...namuna.rekvizit, kompaniya: 'A&B' } }, r).includes('«A&amp;B» МЧЖнинг'), true);
check('so\'zma-so\'z band', html.includes('жўнатилган кундан бошлаб 3 (уч) иш куни ўтгач кучга киради'), true);
check('5 bank ish kuni', html.includes('<b>ушбу талабнома кучга киргандан кейин 5 (беш) банк иш куни ичида</b>'), true);
check('o\'zgarmas blank', html.includes('<b>МЧЖ «XONSAROY GROUP»</b><br>Адрес: г. Ташкент, Юнусабадский р-н,<br>13 квартал, махалля Ахилобод, д.72<br>Тел/факс: (998 71) 200-74-00'), true);
check('imzolovchi', html.includes('<span>«XONSAROY GROUP» раҳбари</span><span>И.К. Носиров</span>'), true);
check('pastki telefon', html.includes('тел: 90 003-14-00'), true);
check('fon rasmi', html.includes("url('file:///a/fon.png')"), true);
check('muhr rasmi', html.includes('<img class="muhr" src="file:///a/muhr.png"'), true);
check('imzo rasmi', html.includes('<img class="imzo" src="file:///a/imzo.png"'), true);
check('serif shrift zanjiri', html.includes("font-family: 'Times New Roman', 'Liberation Serif', 'PT Serif', 'DejaVu Serif', serif"), true);
check('CSS url qochiriladi', talabnomaHtml(namuna, { ...r, fon: "file:///a/x');}body{color:red" }).includes("url('file:///a/x%27%29;}body{color:red')"), true);
check('src atributi qochiriladi', talabnomaHtml(namuna, { ...r, muhr: 'file:///a/"x' }).includes('src="file:///a/&quot;x"'), true);
check('muhr 40mm, imzo 24mm', html.includes('width: 40mm') && html.includes('width: 24mm'), true);
check('shartnoma sanasi yo\'q — bo\'sh <b> emas', talabnomaHtml({ ...namuna, contractDate: null }, r).includes('<b></b>'), false);
check('sig\'dirish skripti bor', html.includes("s.scrollHeight > s.clientHeight && pt > 9"), true);

// ── Chop etish uchun (muhrsiz) nusxa ─────────────────────────────────
const muhrsiz = talabnomaHtml(namuna, r, { muhrsiz: true });
check('muhrsiz: muhr rasmi yo\'q', muhrsiz.includes('muhr.png'), false);
check('muhrsiz: imzo rasmi yo\'q', muhrsiz.includes('imzo.png'), false);
check('muhrsiz: <img> umuman yo\'q', muhrsiz.includes('<img'), false);
check('muhrsiz: fon qoladi', muhrsiz.includes("url('file:///a/fon.png')"), true);
check('muhrsiz: o\'sha raqam, summa, imzolovchi',
  [muhrsiz.includes('№ ET-07'), muhrsiz.includes('18 900 000,00 сўм'), muhrsiz.includes('<span>И.К. Носиров</span>')], [true, true, true]);
// Joylashuv siljimasin: imzo qatori o'sha joyda, faqat rasmlarsiz.
check('muhrsiz: imzo qatori o\'zgarmagan', muhrsiz.includes('<div class="imzo-qator"><span>«XONSAROY GROUP» раҳбари</span><span>И.К. Носиров</span>'), true);
check('sukut — muhrli', talabnomaHtml(namuna, r, {}).includes('<img class="muhr"'), true);
// So'z bilan summa qora: qizil shablon ko'rinishini beradi.
for (const [nom, h] of [['muhrli', html], ['muhrsiz', muhrsiz]] as const) {
  check(`${nom}: .soz qizil emas`, /\.soz \{[^}]*color: #e00/.test(h), false);
  check(`${nom}: .soz qora`, /\.soz \{[^}]*color: #000/.test(h), true);
}

// ── PDF sahifalar soni ─────────────────────────────────────────────────
check('1 sahifa', sahifalarSoni(Buffer.from('<< /Type /Pages /Count 1 /Kids [3 0 R] >>')), 1);
check('2 sahifa', sahifalarSoni(Buffer.from('<< /Type /Pages /Count 2 >>')), 2);
check('Count yo\'q — null', sahifalarSoni(Buffer.from('%PDF-1.7 siqilgan')), null);

if (failed) {
  console.error(`\n${failed} ta tekshiruv muvaffaqiyatsiz`);
  process.exit(1);
}
console.log('\nHammasi o\'tdi');
