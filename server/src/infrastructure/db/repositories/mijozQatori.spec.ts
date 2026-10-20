import { mijozQatori } from '@/infrastructure/db/repositories/mijozQatori';

/**
 * Qo'lda ishga tushiriladi: npm run test:mijoz-qatori --workspace=server
 *
 * Bazaga chiqmaydi — xom qator qo'lda yasaladi.
 *
 * NEGA BU TEST KERAK: bu xaritalash endi IKKI joyda ishlatiladi —
 * ekrandagi ro'yxat (`search`) va eksport (`searchAll`). Summalar
 * `NUMERIC` bo'lgani uchun drayverdan satr bo'lib kelishi mumkin, va
 * satr bo'lib qolsa Excelda yig'indi chiqmaydi, ekranda esa saralash
 * buziladi. Shartnoma holati esa bazada ikki xil yozilgan ("sold" va
 * "Сотилди") — bittaga keltirilmasa, bitta mijozda ikkita bir xil
 * yorliq turadi.
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
    debt_monthly: '1500000',
    debt_total: '4500000',
    days_overdue: '37',
    contracts_count: '2',
    virtual_statuses: ['sold'],
    account_name: 'Madina',
    ...overrides,
  };
}

// ── 1. Summalar RAQAM bo'lib chiqadi (satr emas) ──────────────────────
{
  const c = mijozQatori(xomQator());
  eq('debtMonthly raqam', typeof c.debtMonthly, 'number');
  eq('debtMonthly qiymati', c.debtMonthly, 1_500_000);
  eq('debtTotal qiymati', c.debtTotal, 4_500_000);
  eq('daysOverdue qiymati', c.daysOverdue, 37);
  eq('contractsCount qiymati', c.contractsCount, 2);
}

// ── 2. Bo'sh hisob — nol, null emas ───────────────────────────────────
{
  const c = mijozQatori(
    xomQator({ debt_monthly: null, debt_total: null, days_overdue: null, contracts_count: null }),
  );
  eq('bo\'sh hisob nolga aylanadi', [c.debtMonthly, c.debtTotal, c.daysOverdue, c.contractsCount], [0, 0, 0, 0]);
}

// ── 3. Holatning ikki yozilishi bitta kalitga keladi ──────────────────
{
  const c = mijozQatori(xomQator({ virtual_statuses: ['sold', 'Сотилди'] }));
  eq('takrorlanmaydi', c.contractStatuses, ['sold']);
}

// ── 4. Tanilmagan holat xom qiymati bilan qoladi ──────────────────────
{
  const c = mijozQatori(xomQator({ virtual_statuses: ['Новый статус'] }));
  eq('tanilmagan holat saqlanadi', c.contractStatuses, ['Новый статус']);
}

// ── 5. Akkaunt biriktirilmagan — null ─────────────────────────────────
{
  const c = mijozQatori(xomQator({ account_name: null, virtual_statuses: null }));
  eq('akkaunt null', c.accountName, null);
  eq('holatsiz mijoz bo\'sh massiv', c.contractStatuses, []);
}

console.log(failed === 0 ? '\nHammasi o\'tdi' : `\n${failed} ta test yiqildi`);
process.exit(failed === 0 ? 0 : 1);
