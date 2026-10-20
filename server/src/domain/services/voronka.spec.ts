import { XARID_BOSQICHLARI, type XaridBosqichi } from '@/domain/entities/Purchase';
import { voronka } from '@/domain/services/voronka';

let failed = 0;
function check(name: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`}`);
}

const v = voronka({ yangi: 10, suhbatda: 5, qiziqdi: 3, karta_yuborildi: 2, chek_keldi: 1, qisman_toladi: 1, toladi: 3, rad_etdi: 4 });
check('tartib', v.map((x) => x.stage), [...XARID_BOSQICHLARI]);
check("rad etdi oxirida", v.at(-1)?.stage, 'rad_etdi');
check('ulush', v[0]?.ulush, 10 / 25);
check('yorliq', v[3]?.label, 'Karta yuborildi');
check('rad etdi ulushi yig\'indiga kirmaydi', v.at(-1)?.ulush, 4 / 25);
check("bo'sh", voronka(Object.fromEntries(XARID_BOSQICHLARI.map((s) => [s, 0])) as Record<XaridBosqichi, number>).every((x) => x.ulush === 0), true);

process.exitCode = failed ? 1 : 0;
