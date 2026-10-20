import {
  oxirgiChiquvchiVaqti,
  salomlashuvQoidasi,
  yangiKunmi,
} from '@/infrastructure/ai/prompt/salomlashuv';

/**
 * Qo'lda ishga tushiriladi: npm run test:salomlashuv --workspace=server
 *
 * Kun chegarasi MIJOZNING vaqt mintaqasida sanaladi. UTC bo'yicha tekshirilsa,
 * Toshkentda ertalab 09:00 da yuborilgan eslatma "kecha 22:00" bilan bir kunda
 * ko'rinardi (UTC+5) va salom tushib qolardi — aynan shuni qo'riqlaymiz.
 */
const TZ = 'Asia/Tashkent';

let failed = 0;
const check = (name: string, ok: boolean): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}`);
};

// ─── Kun chegarasi ───────────────────────────────────────────────────────
check(
  'tarix bo\'sh — yangi kun',
  yangiKunmi(null, new Date('2026-08-10T04:00:00Z'), TZ),
);
check(
  'bir necha soat oldingi xabar — o\'sha kun',
  !yangiKunmi(new Date('2026-08-10T04:00:00Z'), new Date('2026-08-10T09:00:00Z'), TZ),
);
check(
  'kechagi xabar — yangi kun',
  yangiKunmi(new Date('2026-08-09T10:00:00Z'), new Date('2026-08-10T04:00:00Z'), TZ),
);
// Toshkent = UTC+5: 2026-08-09T19:30Z → 10-avgust 00:30, ya'ni allaqachon
// yangi kun. UTC bo'yicha sanalsa bu "o'sha kun" bo'lib chiqardi.
check(
  'kun chegarasi UTC emas, mijoz mintaqasi bo\'yicha',
  !yangiKunmi(new Date('2026-08-09T19:30:00Z'), new Date('2026-08-09T20:00:00Z'), TZ),
);
check(
  'yarim tundan oldingi xabar — ertasi kuni yangi kun',
  yangiKunmi(new Date('2026-08-09T18:00:00Z'), new Date('2026-08-09T20:00:00Z'), TZ),
);

// ─── Qaysi xabar sanaladi ────────────────────────────────────────────────
const kecha = new Date('2026-08-09T10:00:00Z');
const bugun = new Date('2026-08-10T05:00:00Z');

check(
  'mijozning bugungi xabari sanalmaydi — chiquvchi kechagisi',
  oxirgiChiquvchiVaqti([
    { role: 'agent', at: kecha },
    { role: 'client', at: bugun },
  ])?.getTime() === kecha.getTime(),
);
check('faqat mijoz yozgan — chiquvchi yo\'q', oxirgiChiquvchiVaqti([{ role: 'client', at: bugun }]) === null);
check('tarix bo\'sh — chiquvchi yo\'q', oxirgiChiquvchiVaqti([]) === null);
check(
  'eng oxirgi chiquvchi olinadi',
  oxirgiChiquvchiVaqti([
    { role: 'agent', at: kecha },
    { role: 'client', at: kecha },
    { role: 'agent', at: bugun },
  ])?.getTime() === bugun.getTime(),
);

// Javob rejimidagi asosiy holat: mijoz bugun yozdi, biz oxirgi marta kecha
// yozganmiz — bu bugungi BIRINCHI xabarimiz, demak salom kerak.
check(
  'javob rejimi: kecha yozganmiz, mijoz bugun yozdi — yangi kun',
  yangiKunmi(
    oxirgiChiquvchiVaqti([
      { role: 'agent', at: kecha },
      { role: 'client', at: bugun },
    ]),
    bugun,
    TZ,
  ),
);
check(
  'javob rejimi: bugun allaqachon javob berganmiz — salom yo\'q',
  !yangiKunmi(
    oxirgiChiquvchiVaqti([
      { role: 'agent', at: new Date('2026-08-10T04:00:00Z') },
      { role: 'client', at: bugun },
    ]),
    bugun,
    TZ,
  ),
);

// ─── Qoida matni ─────────────────────────────────────────────────────────
const yangi = salomlashuvQoidasi(true);
check('yangi kunda salom talab qilinadi', yangi.includes('Assalomu alaykum'));
check('yangi kunda kirill varianti ham beriladi', yangi.includes('Ассалому алайкум'));
check('yangi kunda hol-ahvol so\'raladi', yangi.includes('hol-ahvol'));

const oshaKun = salomlashuvQoidasi(false);
check('o\'sha kunda qayta salomlashish taqiqlanadi', oshaKun.includes('QAYTA SALOMLASHMA'));
check('o\'sha kunda salom matni berilmaydi', !oshaKun.includes('Assalomu alaykum'));

// Qoida ikki joyda ishlatiladi — eslatmada va rahmatda. Salomdan keyin
// nimaga o'tish kerakligi har birida o'z nomi bilan aytiladi.
check('eslatma varianti', salomlashuvQoidasi(true, 'eslatma').includes('eslatmaga o\'t'));
check('rahmat varianti', salomlashuvQoidasi(true, 'rahmat').includes('rahmatga o\'t'));
check('javob varianti', salomlashuvQoidasi(true, 'javob').includes('javobga o\'t'));
check(
  'birinchi murojaat varianti',
  salomlashuvQoidasi(true, 'tanishtiruv').includes('tanishtiruvga o\'t'),
);
// Birinchi murojaatda tarix bo'sh — salom har doim talab qilinishi kerak.
check('tarix bo\'sh — salom talab qilinadi', yangiKunmi(oxirgiChiquvchiVaqti([]), bugun, TZ));
check(
  'o\'sha kunda ham nomi to\'g\'ri turlanadi',
  salomlashuvQoidasi(false, 'rahmat').includes('rahmatdan boshla'),
);

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
