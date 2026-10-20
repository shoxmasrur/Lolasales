import { havolaXabari, havolaYuborilsinmi } from '@/domain/services/havola';

/** Qo'lda: npm run test:havola --workspace=server */
let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};

const B = { linkAfter: 'birinchi_qism' as const, linkSentAt: null, total: 1_500_000, groupLink: 'https://t.me/+abc' };
check('birinchi qismdan keyin', havolaYuborilsinmi({ ...B, paid: 500_000 }), true);
check('toliq qoidasi, qisman', havolaYuborilsinmi({ ...B, linkAfter: 'toliq', paid: 500_000 }), false);
check('toliq qoidasi, to\'liq', havolaYuborilsinmi({ ...B, linkAfter: 'toliq', paid: 1_500_000 }), true);
check('ikkinchi marta yo\'q', havolaYuborilsinmi({ ...B, paid: 1_500_000, linkSentAt: new Date() }), false);
check('havola kiritilmagan', havolaYuborilsinmi({ ...B, paid: 1_500_000, groupLink: null }), false);
check('nol to\'lov', havolaYuborilsinmi({ ...B, paid: 0 }), false);
check('matn', havolaXabari('https://t.me/+abc'), "Yopiq guruhga havola: https://t.me/+abc\nQo'shilish so'rovini yuboring, tez orada qabul qilamiz.");

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
