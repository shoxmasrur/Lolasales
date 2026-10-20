import { bittaOchiqVada, type VadaQatori } from '@/domain/services/bittaOchiqVada';

/**
 * Qo'lda: npm run test:bitta-ochiq-vada --workspace=server
 *
 * MUAMMO (18-avgust, produksiya): bitta shartnoma bo'yicha ikkita ochiq
 * va'da yashab qolgan mijozlar bir to'lov uchun IKKI marta rahmat oldi.
 * Har bir va'da o'sha to'lovni o'zinikiga qo'shib sanaydi — 09:14 da
 * Abduraxmonov aka ketma-ket ikkita "yana 1 000 000 so'm tushibdi"
 * xabarini oldi, ikkalasida ikki xil "jami" summa bilan.
 *
 * Va'da YOZILGANDA eskisi bekor qilinadi (`recordPromise`), lekin bu
 * qoida joriy qilingunga qadar ochilgan juftliklar bazada qolgan va
 * kuzatuvchida hech qanday himoya yo'q edi.
 *
 * Bu yerdagi qoida: bir shartnoma bo'yicha eng OXIRGI kelishuv yashaydi,
 * undan oldingilari eskirgan hisoblanadi. Turli shartnomalar bir-biriga
 * xalaqit bermaydi — ular alohida hisob-kitob.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  ${izoh}`}`);
};

const v = (id: string, contractId: string | null, kun: string): VadaQatori => ({
  id,
  contractId,
  createdAt: new Date(`2026-08-${kun}T10:00:00Z`),
});

/** "faol<eskirgan1,eskirgan2" — guruhlar tartibidan qat'i nazar solishtirish uchun. */
const yozuv = (guruhlar: ReturnType<typeof bittaOchiqVada>): string =>
  guruhlar
    .map((g) => `${g.faol.id}<${g.eskirgan.map((e) => e.id).sort().join(',')}`)
    .sort()
    .join(' | ');

const eq = (name: string, vadalar: VadaQatori[], kutilgan: string): void => {
  const natija = yozuv(bittaOchiqVada(vadalar));
  check(`${name}: ${natija || '(bo\'sh)'}`, natija === kutilgan, `kutilgan ${kutilgan}`);
};

eq("va'da yo'q", [], '');
eq("bitta va'da — o'zi faol", [v('a', 'c1', '12')], 'a<');

// Asosiy holat: bitta shartnoma, ikkita ochiq va'da.
eq(
  "bir shartnomada ikkita va'da — oxirgisi yashaydi",
  [v('eski', 'c1', '12'), v('yangi', 'c1', '14')],
  'yangi<eski',
);
eq(
  "tartibi teskari kelsa ham natija bir xil",
  [v('yangi', 'c1', '14'), v('eski', 'c1', '12')],
  'yangi<eski',
);
eq(
  "uchta va'da — faqat eng oxirgisi",
  [v('a', 'c1', '06'), v('b', 'c1', '08'), v('d', 'c1', '14')],
  'd<a,b',
);

// Turli shartnomalar — alohida kelishuvlar, ikkalasi ham yashaydi.
eq(
  'turli shartnomalar bir-biriga tegmaydi',
  [v('a', 'c1', '12'), v('b', 'c2', '14')],
  'a< | b<',
);
eq(
  "har shartnomada o'zining oxirgisi",
  [v('a', 'c1', '12'), v('b', 'c1', '14'), v('d', 'c2', '10')],
  'b<a | d<',
);

// Shartnomasiz va'da mijozning BARCHA to'lovlarini sanaydi
// (`refreshAndSum` unga `contractId: null` beradi), shuning uchun u
// boshqa va'dalar bilan bir xil pulni ikki marta hisoblaydi — ular bitta
// guruh.
eq(
  "shartnomasiz va'da hammasini bitta guruhga qo'shadi",
  [v('a', null, '14'), v('b', 'c1', '12'), v('d', 'c2', '10')],
  'a<b,d',
);
eq(
  "shartnomasiz va'da eskiroq bo'lsa — o'zi eskiradi",
  [v('a', null, '10'), v('b', 'c1', '12')],
  'b<a',
);

// Bir vaqtda yozilgan ikki qator — natija tasodifga qolmasligi kerak.
{
  const bir = yozuv(bittaOchiqVada([v('a', 'c1', '12'), v('b', 'c1', '12')]));
  const ikki = yozuv(bittaOchiqVada([v('b', 'c1', '12'), v('a', 'c1', '12')]));
  check('bir xil vaqtda yozilganda tanlov barqaror', bir === ikki, `${bir} / ${ikki}`);
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
