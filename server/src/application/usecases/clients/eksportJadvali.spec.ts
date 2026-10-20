import { EKSPORT_USTUNLARI, eksportQatori } from '@/application/usecases/clients/eksportJadvali';
import type { ClientListItem } from '@/domain/repositories/IClientRepository';

/**
 * Qo'lda ishga tushiriladi: npm run test:eksport-jadvali --workspace=server
 *
 * NEGA BU TEST KERAK: faylni odam ochadi va undagi songa ishonib ish
 * qiladi. Eng jimgina xato — to'langan summaning MATN bo'lib tushishi:
 * Excel bunday katakni qo'shmaydi. Ikkinchisi — `null` ning "null" degan
 * matn bo'lib chiqishi: raqamsiz mijoz "null" nomli telefonga ega bo'lib
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

function mijoz(overrides: Partial<ClientListItem> = {}): ClientListItem {
  return {
    id: 'cl1',
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
    source: 'reklama',
    sourceGroup: null,
    sourceComment: null,
    createdAt: SANA,
    updatedAt: SANA,
    deletedAt: null,
    deletedBy: null,
    accountName: 'Madina',
    ...overrides,
  } as ClientListItem;
}

// ── 1. Ustunlar soni va qator uzunligi mos ────────────────────────────
eq('11 ta ustun', EKSPORT_USTUNLARI.length, 11);
eq('qator uzunligi ustunlarga teng', eksportQatori(mijoz()).length, EKSPORT_USTUNLARI.length);
eq('birinchi ustun F.I.O.', EKSPORT_USTUNLARI[0]?.nom, 'F.I.O.');
eq('Izoh ustuni', EKSPORT_USTUNLARI[6]?.nom, 'Izoh');
eq('qarz ustunlari yo\'q', EKSPORT_USTUNLARI.some((u) => /shartnoma|kechikish/i.test(u.nom)), false);

// ── 2. To'liq qator — tartib bilan ────────────────────────────────────
eq('to\'liq qator', eksportQatori(mijoz()), [
  'Testov Test',
  '+998901112233',
  '',
  'Topildi',
  'testov',
  'Madina',
  '',
  'Reklama',
  '',
  '',
  0,
]);

// ── 3. To'langan summa RAQAM bo'lib qoladi ─────────────────────────────
eq('to\'langan raqam (xaridsiz)', typeof eksportQatori(mijoz())[10], 'number');

// ── 4. Bo'sh maydonlar "null" matniga aylanmaydi ──────────────────────
{
  const qator = eksportQatori(
    mijoz({ phone: null, telegramUsername: null, accountName: null, notes: null }),
  );
  eq('bo\'sh telefon', qator[1], '');
  eq('bo\'sh username', qator[4], '');
  eq('bo\'sh akkaunt', qator[5], '');
  eq('bo\'sh izoh', qator[6], '');
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

// ── 8. Manba, bosqich, kurs, to'langan ────────────────────────────────
{
  const xarid = {
    purchase: { stage: 'qisman_toladi', paidAmount: 500_000 } as never,
    kursNomi: 'Python',
  };
  const qator = eksportQatori(mijoz({ source: 'qolda' }), xarid);
  eq('manba nomi', qator[7], 'Qo\'lda');
  eq('bosqich nomi', qator[8], 'Qisman to\'ladi');
  eq('kurs nomi', qator[9], 'Python');
  eq('to\'langan raqam', qator[10], 500_000);
}

console.log(failed === 0 ? '\nHammasi o\'tdi' : `\n${failed} ta test yiqildi`);
process.exit(failed === 0 ? 0 : 1);
