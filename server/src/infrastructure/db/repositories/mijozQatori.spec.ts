import { mijozQatori } from '@/infrastructure/db/repositories/mijozQatori';

/**
 * Qo'lda ishga tushiriladi: npm run test:mijoz-qatori --workspace=server
 *
 * Bazaga chiqmaydi — xom qator qo'lda yasaladi.
 *
 * NEGA BU TEST KERAK: bu xaritalash IKKI joyda ishlatiladi — ekrandagi
 * ro'yxat (`search`) va eksport (`searchAll`). Ikkalasi bir xil qator
 * berishi shart.
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

function xomQator(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'cl1',
    full_name: 'Testov Test',
    phone: '+998901112233',
    extra_phones: [],
    telegram_status: 'found',
    do_not_contact: false,
    created_at: SANA,
    updated_at: SANA,
    source: 'reklama',
    account_name: 'Madina',
    ...overrides,
  };
}

// ── 1. Mijoz maydonlari va akkaunt nomi ──────────────────────────────
{
  const c = mijozQatori(xomQator());
  eq('ism', c.fullName, 'Testov Test');
  eq('manba', c.source, 'reklama');
  eq('akkaunt nomi', c.accountName, 'Madina');
  eq('qarz maydonlari yo\'q', 'debtMonthly' in c || 'contractStatuses' in c, false);
}

// ── 2. Akkaunt biriktirilmagan — null ─────────────────────────────────
{
  const c = mijozQatori(xomQator({ account_name: null }));
  eq('akkaunt null', c.accountName, null);
}

console.log(failed === 0 ? '\nHammasi o\'tdi' : `\n${failed} ta test yiqildi`);
process.exit(failed === 0 ? 0 : 1);
