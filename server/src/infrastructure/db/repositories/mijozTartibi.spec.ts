import { mijozTartibi } from '@/infrastructure/db/repositories/mijozTartibi';

/**
 * Qo'lda ishga tushiriladi: npm run test:mijoz-tartibi --workspace=server
 *
 * NEGA BU TEST MUHIM: `debt_monthly` yoki `days_overdue` teng bo'lgan
 * mijozlarda Postgres tartibni kafolatlamaydi. `LIMIT/OFFSET` bilan
 * sahifalanganda bu bitta mijozni ikkinchi sahifada TAKRORLAB, uchinchi
 * birovini esa umuman TUSHIRIB qoldiradi. Ekranda bu "g'alati, shu odam
 * yuqorida ham bor edi" bo'lib ko'rinadi; eksportda esa jimgina
 * yo'qolgan qator bo'ladi. `c.id ASC` — shu bo'shliqni yopadigan
 * uzil-kesil tartib.
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

// ── 1. To'rt saralashning HAR BIRI c.id bilan yakunlanadi ─────────────
for (const sort of ['debt', 'overdue', 'name', 'recent'] as const) {
  eq(`${sort} uzil-kesil`, mijozTartibi(sort).endsWith(', c.id ASC'), true);
}

// ── 2. Saralash berilmasa — to'lov bo'yicha (ekrandagi sukut) ─────────
eq('sukut tartibi', mijozTartibi(undefined), 'agg.debt_monthly DESC NULLS LAST, c.id ASC');
eq('sukut ham uzil-kesil', mijozTartibi(undefined).endsWith(', c.id ASC'), true);

// ── 3. Har bir saralash o'z ustunini ishlatadi ────────────────────────
eq('ism bo\'yicha', mijozTartibi('name'), 'c.full_name ASC, c.id ASC');
eq('yangilik bo\'yicha', mijozTartibi('recent'), 'c.created_at DESC, c.id ASC');
eq('kechikish bo\'yicha', mijozTartibi('overdue'), 'agg.days_overdue DESC NULLS LAST, c.id ASC');
eq('to\'lov bo\'yicha', mijozTartibi('debt'), 'agg.debt_monthly DESC NULLS LAST, c.id ASC');

console.log(failed === 0 ? '\nHammasi o\'tdi' : `\n${failed} ta test yiqildi`);
process.exit(failed === 0 ? 0 : 1);
