import { mapContract } from '@/infrastructure/db/mappers';

/** Qo'lda ishga tushiriladi: npm run test:bitish-muddati-mapper --workspace=server */

let failed = 0;
function check(holat: string, ok: boolean, izoh = ''): void {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${holat}${ok ? '' : `  ${izoh}`}`);
}

const asos = {
  id: 'c1',
  client_id: 'cl1',
  contract_no: '5582MSO25F3',
  created_at: new Date('2026-09-11T08:00:00Z'),
  updated_at: new Date('2026-09-11T08:00:00Z'),
};

{
  const c = mapContract({ ...asos } as never);
  check('sinxronlanmagan shartnomada null', c.completionDate === null, String(c.completionDate));
}

{
  // DATE ustuni `pool.ts` dagi 1082-parser tufayli satr bo'lib keladi.
  const c = mapContract({ ...asos, completion_date: '2029-12-31' } as never);
  check("sana satr holida o'zgarmasdan o'qiladi", c.completionDate === '2029-12-31', String(c.completionDate));
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
