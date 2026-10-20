import {
  KECHIKISH_KUNI,
  tolovOynasiBoshi,
  vadadanKeyingiTolov,
  type TolovHodisasi,
} from '@/domain/services/vadaTolovi';

/**
 * Qo'lda ishga tushiriladi: npm run test:vada-tolovi --workspace=server
 *
 * Va'da bo'yicha "yangi pul" qanday sanaladi. Muammo real hodisadan
 * chiqdi (18-avgust): mijoz 20 100 000 so'm to'ladi, CRM unga 16-avgust
 * sanasini qo'ydi, bizga esa to'lov 18-avgustda ko'rindi. Va'da 17-avgustda
 * yozilgani uchun sana bo'yicha solishtirish uni "kelmagan" deb hisobladi —
 * odam pul to'lab turib rahmat eshitmadi.
 *
 * Shuning uchun endi ikkinchi yo'l ham bor: to'lov sanasi va'dadan oldin
 * bo'lsa ham, agar biz uni va'dadan KEYIN bilgan bo'lsak — yangi pul.
 *
 * Lekin bu yo'l keng ochilmaydi. Shartnoma birinchi marta sinxronlanganda
 * uning BUTUN to'lov tarixi bir vaqtning o'zida yoziladi (`upsertHistory`),
 * ya'ni ikki yil oldingi to'lov ham "hozir topildi" bo'lib ko'rinadi.
 * Real kechikish esa 1-6 kun (produksiya ma'lumoti), shuning uchun oyna
 * KECHIKISH_KUNI bilan chegaralangan.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  ${izoh}`}`);
};

const VADA = new Date('2026-08-17T10:00:00Z');

const tolov = (over: Partial<TolovHodisasi> = {}): TolovHodisasi => ({
  datePaidIso: '2026-08-18',
  amount: 1_000_000,
  discoveredAt: new Date('2026-08-18T04:00:00Z'),
  ...over,
});

const eq = (name: string, events: TolovHodisasi[], kutilgan: number): void => {
  const natija = vadadanKeyingiTolov(events, VADA);
  check(`${name}: ${natija.toLocaleString('ru-RU')}`, natija === kutilgan, `kutilgan ${kutilgan}`);
};

// ─── Oddiy holat ──────────────────────────────────────────────────────────
eq("va'dadan keyin to'langan — hisoblanadi", [tolov()], 1_000_000);
eq("va'da kunining o'zida to'langan — hisoblanadi", [tolov({ datePaidIso: '2026-08-17' })], 1_000_000);
eq("to'lov yo'q — nol", [], 0);

// ─── Asosiy tuzatish: orqaga sanalgan, keyin topilgan to'lov ─────────────
eq(
  "sanasi va'dadan oldin, lekin bizga keyin ko'rindi — hisoblanadi",
  [tolov({ datePaidIso: '2026-08-16', amount: 20_100_000 })],
  20_100_000,
);

// ─── Va'dadan oldin BILGAN pulimiz yangi emas ────────────────────────────
eq(
  "sanasi ham, topilgani ham va'dadan oldin — hisoblanmaydi",
  [tolov({ datePaidIso: '2026-08-16', discoveredAt: new Date('2026-08-16T12:00:00Z') })],
  0,
);

// ─── Birinchi sinxron tuzog'i ────────────────────────────────────────────
// Shartnoma bugun birinchi marta sinxronlansa, 2024-yildagi to'lov ham
// "hozir topildi" bo'ladi. Bunga rahmat aytish — mijoz uchun bema'nilik.
eq(
  "ikki yil oldingi to'lov birinchi sinxronda topildi — hisoblanmaydi",
  [tolov({ datePaidIso: '2024-08-16', amount: 162_300_000 })],
  0,
);

// ─── Kechikish oynasining chegarasi ──────────────────────────────────────
const kunOldin = (n: number): string => {
  const d = new Date(VADA);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

eq(
  `aynan ${KECHIKISH_KUNI} kun oldingi to'lov — hisoblanadi`,
  [tolov({ datePaidIso: kunOldin(KECHIKISH_KUNI) })],
  1_000_000,
);
eq(
  `${KECHIKISH_KUNI + 1} kun oldingi to'lov — hisoblanmaydi`,
  [tolov({ datePaidIso: kunOldin(KECHIKISH_KUNI + 1) })],
  0,
);

// ─── Bir nechta to'lov ───────────────────────────────────────────────────
eq(
  "hisobga kiradiganlar qo'shiladi, qolgani tashlanadi",
  [
    tolov({ datePaidIso: '2026-08-18', amount: 500_000 }),
    tolov({ datePaidIso: '2026-08-16', amount: 300_000 }),
    tolov({ datePaidIso: '2026-08-16', amount: 700_000, discoveredAt: new Date('2026-08-16T09:00:00Z') }),
    tolov({ datePaidIso: '2024-01-01', amount: 9_000_000 }),
  ],
  800_000,
);

// ─── Bazadan qancha orqaga so'raymiz ─────────────────────────────────────
// Kuzatuvchi shu sanadan boshlab qatorlarni oladi; tanlashni yuqoridagi
// qoida qiladi. Oyna tor bo'lsa, kech topilgan to'lov bazadan umuman
// kelmaydi va qoida uni ko'rmaydi ham.
check(
  `oyna boshi ${KECHIKISH_KUNI} kun orqaga suriladi: ${tolovOynasiBoshi(VADA)}`,
  tolovOynasiBoshi(VADA) === '2026-08-10',
  'kutilgan 2026-08-10',
);
check(
  'oy chegarasidan oshib ketadi',
  tolovOynasiBoshi(new Date('2026-09-03T10:00:00Z')) === '2026-08-27',
  tolovOynasiBoshi(new Date('2026-09-03T10:00:00Z')),
);

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
