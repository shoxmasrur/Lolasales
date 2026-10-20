import { EKSPORT_USTUNLARI, eksportQatori } from '@/application/usecases/clients/eksportJadvali';
import type { ClientWithDebt } from '@/domain/repositories/IClientRepository';

/**
 * Qo'lda ishga tushiriladi: npm run test:eksport-jadvali --workspace=server
 *
 * NEGA BU TEST KERAK: faylni odam ochadi va undagi songa ishonib ish
 * qiladi. Eng jimgina xato — summaning MATN bo'lib tushishi: Excel
 * bunday katakni qo'shmaydi va yig'indi noto'g'ri chiqadi, lekin hech
 * qayerda xato ko'rinmaydi. Ikkinchisi — `null` ning "null" degan matn
 * bo'lib chiqishi: raqamsiz mijoz "null" nomli telefonga ega bo'lib
 * qoladi.
 */

let failed = 0;

function eq(nom: string, actual: unknown, kutilgan: unknown): void {
  const a = JSON.stringify(actual);
  const k = JSON.stringify(kutilgan);
  if (a === k) {
    console.log(`✓ ${nom}`);
  } else {
    failed += 1;
    console.log(`✗ ${nom}: ${a}  (kutilgan: ${k})`);
  }
}

const SANA = new Date('2026-09-01T10:00:00Z');

function mijoz(overrides: Partial<ClientWithDebt> = {}): ClientWithDebt {
  return {
    id: 'cl1',
    externalId: null,
    fullName: 'Testov Test',
    firstName: null,
    phone: '+998901112233',
    extraPhones: [],
    telegramUserId: null,
    telegramUsername: 'testov',
    telegramName: null,
    telegramAccessHash: null,
    telegramHashAccountId: null,
    telegramStatus: 'found',
    telegramCheckedAt: null,
    telegramAccountId: null,
    accountAssignedAt: null,
    doNotContact: false,
    notes: null,
    createdAt: SANA,
    updatedAt: SANA,
    deletedAt: null,
    deletedBy: null,
    debtMonthly: 1_500_000,
    debtTotal: 4_500_000,
    daysOverdue: 37,
    contractsCount: 2,
    contractStatuses: ['sold'],
    accountName: 'Madina',
    ...overrides,
  } as ClientWithDebt;
}

// ── 1. Ustunlar soni va qator uzunligi mos ────────────────────────────
eq('12 ta ustun', EKSPORT_USTUNLARI.length, 12);
eq('qator uzunligi ustunlarga teng', eksportQatori(mijoz()).length, EKSPORT_USTUNLARI.length);
eq('birinchi ustun F.I.O.', EKSPORT_USTUNLARI[0]?.nom, 'F.I.O.');
eq('oxirgi ustun Izoh', EKSPORT_USTUNLARI[11]?.nom, 'Izoh');

// ── 2. To'liq qator — tartib bilan ────────────────────────────────────
eq('to\'liq qator', eksportQatori(mijoz()), [
  'Testov Test',
  '+998901112233',
  '',
  'Topildi',
  'testov',
  2,
  'Сотилди',
  'Madina',
  1_500_000,
  4_500_000,
  37,
  '',
]);

// ── 3. Summalar RAQAM bo'lib qoladi — Excelda yig'indi shunga bog'liq ──
{
  const qator = eksportQatori(mijoz());
  eq('oyma-oy kechikish raqam', typeof qator[8], 'number');
  eq('umumiy kechikish raqam', typeof qator[9], 'number');
  eq('kechikish kuni raqam', typeof qator[10], 'number');
}

// ── 4. Bo'sh maydonlar "null" matniga aylanmaydi ──────────────────────
{
  const qator = eksportQatori(
    mijoz({ phone: null, telegramUsername: null, accountName: null, notes: null }),
  );
  eq('bo\'sh telefon', qator[1], '');
  eq('bo\'sh username', qator[4], '');
  eq('bo\'sh akkaunt', qator[7], '');
  eq('bo\'sh izoh', qator[11], '');
}

// ── 5. Qo'shimcha raqamlar probel bilan ───────────────────────────────
eq(
  'qo\'shimcha raqamlar',
  eksportQatori(mijoz({ extraPhones: ['+998934445566', '+998977778899'] }))[2],
  '+998934445566 +998977778899',
);

// ── 6. Telegram holati o'zbekcha nom bilan ────────────────────────────
eq('holat nomi', eksportQatori(mijoz({ telegramStatus: 'not_found' }))[3], 'Telegramda yo\'q');
eq(
  'noma\'lum holat kaliti bilan qoladi',
  eksportQatori(mijoz({ telegramStatus: 'yangi_holat' as never }))[3],
  'yangi_holat',
);

// ── 7. Shartnoma holatlari nomga aylanadi ─────────────────────────────
eq(
  'bir nechta holat',
  eksportQatori(mijoz({ contractStatuses: ['sold', 'for_return'] }))[6],
  'Сотилди, К возврату',
);
eq(
  'tanilmagan kalit o\'zgarmaydi',
  eksportQatori(mijoz({ contractStatuses: ['Новый статус'] }))[6],
  'Новый статус',
);
eq('holatsiz mijoz', eksportQatori(mijoz({ contractStatuses: [] }))[6], '');

console.log(failed === 0 ? '\nHammasi o\'tdi' : `\n${failed} ta test yiqildi`);
process.exit(failed === 0 ? 0 : 1);
