import { bulkOldindanSql } from '@/infrastructure/db/bulkOldindan';

/** Qo'lda ishga tushiriladi: npm run test:bulk-oldindan --workspace=server (bazasiz). */
let failed = 0;
const check = (name: string, ok: boolean): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}`);
};

const sql = bulkOldindanSql('c.deleted_at IS NULL');
check('shartnoma/qarz bo\'yicha tasnif yo\'q (contracts, minDebt, $2/$3)',
  !/contracts|not_sold|no_debt|below_min_debt|\$2|\$3/.test(sql));
check('bitta parametr: mijoz id\'lari', sql.includes('$1::uuid[]'));
const tartib = ['do_not_contact', "'blocked'", "'deactivated'", "'no_phone'", "'already_started'", "'name_mismatch'", "'ready'", "'needs_lookup'"]
  .map((k) => sql.indexOf(k));
check('tasnif tartibi: taqiq -> bloklangan -> telefonsiz -> boshlangan -> ism -> tayyor -> qidiruv',
  tartib.every((v, i) => v >= 0 && (i === 0 || v > tartib[i - 1]!)));
process.exitCode = failed ? 1 : 0;
