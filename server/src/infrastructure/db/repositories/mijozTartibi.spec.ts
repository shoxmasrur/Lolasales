import { mijozTartibi } from '@/infrastructure/db/repositories/mijozTartibi';

/**
 * Qo'lda ishga tushiriladi: npm run test:mijoz-tartibi --workspace=server
 *
 * NEGA BU TEST MUHIM: saralash ustuni teng bo'lgan mijozlarda Postgres
 * tartibni kafolatlamaydi. `LIMIT/OFFSET` bilan sahifalanganda bu bitta
 * mijozni ikkinchi sahifada TAKRORLAB, boshqasini esa umuman TUSHIRIB
 * qoldiradi. `c.id ASC` — shu bo'shliqni yopadigan uzil-kesil tartib.
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

// ── 1. Har bir saralash c.id bilan yakunlanadi ──────────────────────
for (const sort of ['name', 'recent', undefined] as const) {
  eq(`${sort ?? 'sukut'} uzil-kesil`, mijozTartibi(sort).endsWith(', c.id ASC'), true);
}

// ── 2. Saralash berilmasa — eng yangilari birinchi ────────────────────
eq('sukut tartibi', mijozTartibi(undefined), 'c.created_at DESC, c.id ASC');
eq('ism bo\'yicha', mijozTartibi('name'), 'c.full_name ASC, c.id ASC');
eq('yangilik bo\'yicha', mijozTartibi('recent'), 'c.created_at DESC, c.id ASC');

console.log(failed === 0 ? '\nHammasi o\'tdi' : `\n${failed} ta test yiqildi`);
process.exit(failed === 0 ? 0 : 1);
