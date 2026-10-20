import { AccountLabels } from '@/application/services/AccountLabels';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';

/**
 * Qo'lda ishga tushiriladi: npm run test:account-labels
 *
 * Ikki xossa tekshiriladi, ikkalasi ham jurnal uchun hal qiluvchi:
 *   1. `labelOf` SINXRON — jurnal yozish nuqtasida `await` qilib bo'lmaydi.
 *   2. Baza yiqilsa ham u xato tashlamaydi — jurnal yordamchi ma'lumot
 *      uchun asosiy ishni to'xtatib qo'ymasligi kerak.
 */

let failed = 0;

function eq(nom: string, actual: unknown, kutilgan: unknown): void {
  if (actual === kutilgan) {
    console.log(`✓ ${nom}`);
  } else {
    failed += 1;
    console.log(`✗ ${nom}: ${String(actual)}  (kutilgan: ${String(kutilgan)})`);
  }
}

function repo(
  list: () => Promise<Array<{ id: string; label: string }>>,
): ITelegramAccountRepository {
  return { list } as unknown as ITelegramAccountRepository;
}

const AKKAUNTLAR = [
  { id: 'a-1', label: 'Madina' },
  { id: 'a-2', label: 'Nafosat' },
];

// ── 1. Yangilashdan keyin nom sinxron chiqadi ───────────────────────────
{
  const labels = new AccountLabels(repo(async () => AKKAUNTLAR));
  await labels.refresh();
  eq('Madina', labels.labelOf('a-1'), 'Madina');
  eq('Nafosat', labels.labelOf('a-2'), 'Nafosat');
}

// ── 2. Yangilashdan OLDIN — null, xato emas ─────────────────────────────
// Ilova endi ko'tarilgan, kesh hali bo'sh. Jurnal qatori shunchaki
// `akkaunt` maydonisiz chiqadi.
{
  const labels = new AccountLabels(repo(async () => AKKAUNTLAR));
  eq('kesh bo\'sh', labels.labelOf('a-1'), null);
}

// ── 3. Noma'lum id — null, va fon yangilanishi boshlanadi ──────────────
{
  let chaqirildi = 0;
  const labels = new AccountLabels(
    repo(async () => {
      chaqirildi += 1;
      return AKKAUNTLAR;
    }),
  );
  await labels.refresh();
  eq('noma\'lum id', labels.labelOf('a-yoq'), null);
  // Fon yangilanishi navbatga qo'yilgan bo'lishi kerak.
  await new Promise((r) => setTimeout(r, 0));
  eq('fon yangilanishi boshlandi', chaqirildi > 1, true);
}

// ── 4. Baza yiqilsa ham xato tashlamaydi ────────────────────────────────
// DIQQAT: bu holat ataylab xato keltirib chiqaradi, shuning uchun quyida
// "Akkaunt nomlarini yangilab bo'lmadi" ogohlantirishi chiqadi — bu
// kutilgan chiqish, nosozlik emas.
{
  const labels = new AccountLabels(
    repo(async () => {
      throw new Error('baza uzildi');
    }),
  );
  let xato = false;
  try {
    await labels.refresh();
  } catch {
    xato = true;
  }
  eq('refresh yiqilmaydi', xato, false);
  eq('labelOf yiqilmaydi', labels.labelOf('a-1'), null);
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
