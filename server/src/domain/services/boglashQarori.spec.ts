import { boglashQarori } from '@/domain/services/boglashQarori';

/** Qo'lda: npm run test:boglash-qarori --workspace=server */
let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};
type Topilgan = Parameters<typeof boglashQarori>[0]['topilgan'];
const topildi = (boshqaSuhbatBor = false, boshqaTelegram = false): Topilgan =>
  ({ kind: 'topildi', clientId: 'c1', telefonlar: ['+998901234567'], boshqaSuhbatBor, boshqaTelegram });

check('telefon mos, boshqa suhbat yo\'q → bog\'lash',
  boglashQarori({ topilgan: topildi(), telegramTelefon: '+998901234567' }),
  { kind: 'boglash', clientId: 'c1' });
check('telefon yashirin',
  boglashQarori({ topilgan: topildi(), telegramTelefon: null }),
  { kind: 'tasdiq_kerak', clientId: 'c1', sabab: 'Telegram raqami yashirin' });
check('telefon boshqa',
  boglashQarori({ topilgan: topildi(), telegramTelefon: '+998911111111' }),
  { kind: 'tasdiq_kerak', clientId: 'c1', sabab: "Telegram raqami CRM'dagiga mos emas" });
check('telefon mos, lekin boshqa suhbat bor',
  boglashQarori({ topilgan: topildi(true), telegramTelefon: '+998901234567' }),
  { kind: 'tasdiq_kerak', clientId: 'c1', sabab: "Mijozning shu akkauntda boshqa suhbati bor" });
check('telefon mos, lekin mijozda boshqa Telegram hisobi',
  boglashQarori({ topilgan: topildi(false, true), telegramTelefon: '+998901234567' }),
  { kind: 'tasdiq_kerak', clientId: 'c1', sabab: 'Mijozda boshqa Telegram hisobi bor' });
check('telefon mos emas — telefon sababi birinchi',
  boglashQarori({ topilgan: topildi(false, true), telegramTelefon: '+998911111111' }),
  { kind: 'tasdiq_kerak', clientId: 'c1', sabab: "Telegram raqami CRM'dagiga mos emas" });
check('topilmadi',
  boglashQarori({ topilgan: { kind: 'topilmadi' }, telegramTelefon: '+998901234567' }),
  { kind: 'topilmadi' });
check('crm xato',
  boglashQarori({ topilgan: { kind: 'crm_xato', sabab: 'timeout' }, telegramTelefon: null }),
  { kind: 'crm_xato', sabab: 'timeout' });
console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
