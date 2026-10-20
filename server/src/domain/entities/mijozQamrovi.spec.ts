import { HAMMASI, qamrovKaliti, qamrovOl } from '@/domain/entities/MijozQamrovi';

/** Qo'lda: npm run test:mijoz-qamrovi --workspace=server */
let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};

check('admin cheklanmaydi', qamrovOl({ objects: ['A'], roleKey: 'admin' }), HAMMASI);
check('bo\'sh cheklanmaydi', qamrovOl({ objects: [], roleKey: 'operator' }).cheklangan, false);
check('roli yo\'q, bo\'sh — cheklanmaydi', qamrovOl({ objects: [], roleKey: null }), HAMMASI);
check('roli yo\'q, obyektli — cheklanadi', qamrovOl({ objects: ['A'], roleKey: null }), { cheklangan: true, obyektlar: ['A'] });
check('trim+takrorsiz+tartib', qamrovOl({ objects: [' Vatan', 'MUHABBAT SHAHRI', 'Vatan'], roleKey: 'operator' }).obyektlar, ['MUHABBAT SHAHRI', 'Vatan']);
// Yopiq holatda yiqiladi: ro'yxat bo'sh EMAS, lekin tozalangach hech narsa qolmasa —
// baribir cheklangan (`= ANY('{}')` hech narsaga mos kelmaydi).
check('faqat bo\'shliqlar — cheklangan, hech narsa ko\'rinmaydi', qamrovOl({ objects: ['  ', ''], roleKey: 'operator' }), { cheklangan: true, obyektlar: [] });
check('cheklangan bayroq', qamrovOl({ objects: ['B', 'A'], roleKey: 'operator' }), { cheklangan: true, obyektlar: ['A', 'B'] });
check('kalit', [qamrovKaliti(HAMMASI), qamrovKaliti({ cheklangan: true, obyektlar: ['A', 'B'] })], ['*', '["A","B"]']);
check('kalit tartibga bog\'liq emas', qamrovKaliti({ cheklangan: true, obyektlar: ['B', 'A'] }), '["A","B"]');
const kirish = [' B', 'A'];
qamrovOl({ objects: kirish, roleKey: 'operator' });
check('kirish massivi o\'zgarmaydi', kirish, [' B', 'A']);

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
