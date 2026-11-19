import { tushumniTanla, type HamyonTushum } from '@/domain/services/hamyonMosligi';

/** Qo'lda ishga tushiriladi: npm run test:hamyon-mosligi --workspace=server */
let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

const HOZIR = new Date('2026-11-19T10:00:00Z');
const daqiqaOldin = (m: number): Date => new Date(HOZIR.getTime() - m * 60_000);
const t = (id: string, amount: number, m: number): HamyonTushum => ({ id, amount, date: daqiqaOldin(m) });
const bosh = new Set<string>();
const baza = { chekVaqti: daqiqaOldin(5), hozir: HOZIR, band: bosh, kutilgan: 200_000 };

check('aynan bitta mos tushum → mos', tushumniTanla({ ...baza, tushumlar: [t('a', 200_000, 10)] }).kind, 'mos');
check('summa boshqa → topilmadi', tushumniTanla({ ...baza, tushumlar: [t('a', 150_000, 10)] }), { kind: 'topilmadi', boshqaSummalar: [150_000] });
check("tushum yo'q → topilmadi", tushumniTanla({ ...baza, tushumlar: [] }), { kind: 'topilmadi', boshqaSummalar: [] });
check('chekdan 3 soatdan oldingi tushum hisobga olinmaydi', tushumniTanla({ ...baza, tushumlar: [t('a', 200_000, 5 + 181)] }).kind, 'topilmadi');
check('bir xil summali ikkita tushum → shubha', tushumniTanla({ ...baza, tushumlar: [t('a', 200_000, 10), t('b', 200_000, 20)] }).kind, 'shubha');
check(
  'tushum boshqa chekka biriktirilgan → shubha (takroriy chek)',
  tushumniTanla({ ...baza, band: new Set(['a']), tushumlar: [t('a', 200_000, 10)] }).kind,
  'shubha',
);
check(
  "biri band, biri bo'sh → bo'shi tanlanadi",
  tushumniTanla({ ...baza, band: new Set(['a']), tushumlar: [t('a', 200_000, 10), t('b', 200_000, 20)] }),
  { kind: 'mos', tushum: t('b', 200_000, 20) },
);
check("kutilgan summa yo'q → shubha", tushumniTanla({ ...baza, kutilgan: null, tushumlar: [t('a', 200_000, 10)] }).kind, 'shubha');
check("kelajakdagi (soat farqi) ozgina tushum o'tadi", tushumniTanla({ ...baza, tushumlar: [t('a', 200_000, -5)] }).kind, 'mos');
check("uzoq kelajakdagi tushum o'tmaydi", tushumniTanla({ ...baza, tushumlar: [t('a', 200_000, -60)] }).kind, 'topilmadi');

if (failed) {
  console.error(`\n${failed} ta tekshiruv muvaffaqiyatsiz`);
  process.exit(1);
}
console.log("\nHammasi o'tdi");
