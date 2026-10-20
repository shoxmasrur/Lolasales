import { apiKalitiniOl } from '@/presentation/http/middleware/auth';

/**
 * Qo'lda ishga tushiriladi: npm run test:api-kalit --workspace=server
 *
 * Bulutdagi platformalarning ko'pi kalitni faqat `Authorization: Bearer`
 * da yubora oladi. `dbt_` bilan boshlangan Bearer — API kalit; qolgani
 * dashboard JWT'si bo'lib qoladi (Review Focus 5).
 */
let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

check('X-Api-Key (avvalgidek)', apiKalitiniOl({ 'x-api-key': 'dbt_abc' }), 'dbt_abc');
check('X-Api-Key bo\'sh joy bilan', apiKalitiniOl({ 'x-api-key': '  dbt_abc  ' }), 'dbt_abc');
check('Bearer dbt_ — API kalit', apiKalitiniOl({ authorization: 'Bearer dbt_xyz' }), 'dbt_xyz');
check('Bearer JWT — API kalit emas', apiKalitiniOl({ authorization: 'Bearer eyJhbGciOi.x.y' }), null);
check('sarlavha yo\'q', apiKalitiniOl({}), null);
check('X-Api-Key ustun turadi', apiKalitiniOl({ 'x-api-key': 'dbt_a', authorization: 'Bearer dbt_b' }), 'dbt_a');
check('bo\'sh X-Api-Key e\'tiborsiz', apiKalitiniOl({ 'x-api-key': '   ', authorization: 'Bearer dbt_b' }), 'dbt_b');
check('massiv X-Api-Key qabul qilinmaydi', apiKalitiniOl({ 'x-api-key': ['dbt_a', 'dbt_b'] }), null);

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
