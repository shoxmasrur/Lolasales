import { groupByAccount } from '@/application/services/bulkGroups';

/**
 * Qo'lda ishga tushiriladi: npm run test:bulk-groups --workspace=server
 *
 * NEGA KERAK: parallel oqimlarning butun to'g'riligi shu guruhlashga
 * tayanadi. Bitta mijoz ikki guruhga tushsa unga IKKI MARTA yoziladi —
 * bu esa mijoz uchun eng yomon xato.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

// ─── 1. Uch akkauntga teng bo'linadi ─────────────────────────────────────
{
  const guruhlar = groupByAccount(
    ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'],
    new Map([
      ['c1', 'a1'], ['c2', 'a2'], ['c3', 'a3'],
      ['c4', 'a1'], ['c5', 'a2'], ['c6', 'a3'],
    ]),
  );

  check('uchta guruh', guruhlar.length === 3, String(guruhlar.length));
  check('a1 → c1, c4', String(guruhlar[0]?.clientIds) === 'c1,c4', String(guruhlar[0]?.clientIds));
  check('a2 → c2, c5', String(guruhlar[1]?.clientIds) === 'c2,c5', String(guruhlar[1]?.clientIds));
  check('a3 → c3, c6', String(guruhlar[2]?.clientIds) === 'c3,c6', String(guruhlar[2]?.clientIds));
  check('tartib birinchi uchrash bo\'yicha', guruhlar[0]?.accountId === 'a1', String(guruhlar[0]?.accountId));
}

// ─── 2. Rejaga kirmaganlar oxirgi "qoldiq" guruhga ───────────────────────
// Ular baribir o'tkazib yuboriladi (chiquvchi xabari bor, bog'lanish
// taqiqlangan yoki operator qo'lda chegaralagan), lekin YO'QOLMASLIGI
// kerak — o'tkazib yuborish sabablari operatorga kerak.
{
  const guruhlar = groupByAccount(
    ['c1', 'c2', 'c3'],
    new Map([['c1', 'a1']]),
  );

  check('ikkita guruh', guruhlar.length === 2, String(guruhlar.length));
  check('qoldiq oxirida', guruhlar[1]?.accountId === null, String(guruhlar[1]?.accountId));
  check('qoldiqda c2, c3', String(guruhlar[1]?.clientIds) === 'c2,c3', String(guruhlar[1]?.clientIds));
}

// ─── 3. Hech kim biriktirilmagan → bitta qoldiq guruh ────────────────────
{
  const guruhlar = groupByAccount(['c1', 'c2'], new Map());
  check('bitta guruh', guruhlar.length === 1, String(guruhlar.length));
  check('akkaunti yo\'q', guruhlar[0]?.accountId === null, String(guruhlar[0]?.accountId));
  check('ikkalasi ham ichida', String(guruhlar[0]?.clientIds) === 'c1,c2', String(guruhlar[0]?.clientIds));
}

// ─── 4. Bo'sh ro'yxat → bo'sh natija ─────────────────────────────────────
{
  const guruhlar = groupByAccount([], new Map([['c1', 'a1']]));
  check('bo\'sh natija', guruhlar.length === 0, String(guruhlar.length));
}

// ─── 5. Hech bir mijoz ikki guruhga tushmaydi ────────────────────────────
// Eng xavfli xato: takrorlangan mijozga ikki marta xabar ketardi.
{
  const ids = Array.from({ length: 50 }, (_, i) => `c${i}`);
  const assignments = new Map(ids.map((id, i) => [id, `a${i % 3}`] as const));
  const guruhlar = groupByAccount(ids, assignments);
  const jami = guruhlar.flatMap((g) => g.clientIds);

  check('jami son saqlandi', jami.length === 50, String(jami.length));
  check('takror yo\'q', new Set(jami).size === 50, String(new Set(jami).size));
}

console.log(failed ? `\n${failed} ta sinov yiqildi` : '\nHammasi o\'tdi');
process.exit(failed ? 1 : 0);
