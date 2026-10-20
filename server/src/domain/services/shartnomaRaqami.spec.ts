import { shartnomaRaqaminiTozala } from '@/domain/services/shartnomaRaqami';

/** Qo'lda: npm run test:shartnoma-raqami --workspace=server */
let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};
check('toza raqam', shartnomaRaqaminiTozala('1234ABC56DE'), '1234ABC56DE');
check('kichik harf va bo\'sh joy', shartnomaRaqaminiTozala(' 1234 abc 56de '), '1234ABC56DE');
check('chiziqcha', shartnomaRaqaminiTozala('1234-ABC-56DE'), '1234ABC56DE');
check('bo\'sh', shartnomaRaqaminiTozala('  '), null);
check('null', shartnomaRaqaminiTozala(null), null);
check('juda qisqa', shartnomaRaqaminiTozala('12'), null);
check('kirill harflar', shartnomaRaqaminiTozala('2370ОРЗ26КЕ'), null);
console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
