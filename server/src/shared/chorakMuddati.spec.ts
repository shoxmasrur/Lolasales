import { chorakMuddati } from '@/shared/datetime';

/** Qo'lda ishga tushiriladi: npm run test:chorak-muddati --workspace=server */

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const ok = actual === expected;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${String(actual)} (kutilgan: ${String(expected)})`}`);
};

check('dekabr oxiri — 4-chorak', chorakMuddati('2029-12-31'), '2029-yilning 4-choragi');
check('mart oxiri — 1-chorak', chorakMuddati('2028-03-31'), '2028-yilning 1-choragi');
// Chegara kunlar: vaqt mintaqasi ularni qo'shni chorakka surmasligi kerak.
check('1-yanvar — 1-chorak', chorakMuddati('2028-01-01'), '2028-yilning 1-choragi');
check('30-iyun — 2-chorak', chorakMuddati('2028-06-30'), '2028-yilning 2-choragi');
check('1-iyul — 3-chorak', chorakMuddati('2028-07-01'), '2028-yilning 3-choragi');
check('1-oktabr — 4-chorak', chorakMuddati('2028-10-01'), '2028-yilning 4-choragi');
check('vaqtli satr', chorakMuddati('2029-12-31 00:00:00'), '2029-yilning 4-choragi');
check('null', chorakMuddati(null), null);
check("bo'sh satr", chorakMuddati(''), null);
check("13-oy — noto'g'ri", chorakMuddati('2029-13-01'), null);
check('sana emas', chorakMuddati('dekabr'), null);

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
