import { xaridShartlari } from '@/infrastructure/db/xaridSharti';

/** Qo'lda ishga tushiriladi: npm run test:xarid-sharti --workspace=server (bazasiz). */
let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

{
  const params: unknown[] = [];
  check('filtrsiz — shart yo\'q', xaridShartlari({}, params), []);
  check('filtrsiz — parametr yo\'q', params, []);
}
{
  const params: unknown[] = ['oldingi'];
  const where = xaridShartlari({ source: 'reklama' }, params);
  check('manba: shart', where, ['c.source = $2']);
  check('manba: parametr', params, ['oldingi', 'reklama']);
}
{
  const params: unknown[] = [];
  const where = xaridShartlari({ stage: 'toladi', courseId: 'k1', source: 'guruh' }, params);
  check('uchala filtr: parametrlar tartibi', params, ['guruh', 'toladi', 'k1']);
  check('uchala filtr: ikki shart', where.length, 2);
  check('bosqich va kurs bitta qatorga tegishli', /cp\.stage = \$2 AND cp\.course_id = \$3::uuid/.test(where[1]!), true);
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
