import { kampaniyaNishonSql } from '@/infrastructure/db/kampaniyaSharti';

/** Qo'lda ishga tushiriladi: npm run test:kampaniya-sharti --workspace=server (bazasiz). */
let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

{
  const { sql, params } = kampaniyaNishonSql({});
  check('filtrsiz: faqat limit parametri', params, [500]);
  check('filtrsiz: qamrov shartisiz (TRUE), xarid/suhbat sharti yo\'q',
    [sql.includes('TRUE'), sql.includes('purchases'), sql.includes('conversations'), sql.includes('contracts')],
    [true, false, false, false]);
  check('muloqotga yaroqsizlar chiqariladi', sql.includes('do_not_contact = FALSE') && sql.includes("'blocked', 'deactivated'"), true);
}
{
  const { sql, params } = kampaniyaNishonSql({
    stage: ['yangi', 'qiziqdi'], source: ['reklama', 'raqam'], courseId: '11111111-1111-1111-1111-111111111111',
    onlyWithoutConversation: true, limit: 20,
  });
  check('parametrlar tartibi', params, [
    ['reklama', 'raqam'], ['yangi', 'qiziqdi'], '11111111-1111-1111-1111-111111111111', 20,
  ]);
  check('source/stage/kurs parametrlangan', [
    sql.includes('cl.source = ANY($1::text[])'),
    sql.includes('cp.stage = ANY($2::text[])'),
    sql.includes('cp.course_id = $3::uuid'),
    sql.includes('LIMIT $4'),
  ], [true, true, true, true]);
  check('suhbatsizlar sharti', sql.includes('NOT EXISTS (SELECT 1 FROM conversations cv'), true);
  check('qiymatlar SQL matniga qo\'shilmagan', ['reklama', 'yangi', '1111'].some((v) => sql.includes(v)), false);
}
{
  const ids = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'];
  const { sql, params } = kampaniyaNishonSql({ clientIds: ids, source: ['guruh'], limit: 2 });
  check('aniq mijozlar ro\'yxati parametrlangan', [sql.includes('cl.id = ANY($1::uuid[])'), params], [true, [ids, ['guruh'], 2]]);
  check('bo\'sh ro\'yxat ham shart qo\'yadi', kampaniyaNishonSql({ clientIds: [] }).params, [[], 500]);
}
{
  const { sql, params } = kampaniyaNishonSql({ stage: ['yangi'] }, { cheklangan: true, obyektlar: ['A'] });
  check('qamrov: obyektlar parametr sifatida, limitdan oldin',
    [params, sql.includes('= ANY($2::text[])'), sql.includes('LIMIT $3')], [[['yangi'], ['A'], 500], true, true]);
}
{
  const { params } = kampaniyaNishonSql({ limit: 999999 });
  check('limit 5000 bilan cheklanadi', params, [5000]);
  check('limit kamida 1', kampaniyaNishonSql({ limit: 0 }).params, [1]);
}
process.exitCode = failed ? 1 : 0;
