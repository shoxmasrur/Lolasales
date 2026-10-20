import { evaluateWindow } from '@/domain/policies/SendWindowPolicy';
import type { Bayram } from '@/domain/entities/bayram';

/**
 * Qo'lda ishga tushiriladi: npm run test:send-window-bayram --workspace=server
 *
 * NEGA BU TEST KERAK: bu darvoza to'rtta xizmatni to'xtatadi. Bayram
 * tekshiruvi ish vaqti tekshiruvidan OLDIN turishi kerak — aks holda
 * bayram kuni ertalab soat 8 da sabab "ish vaqti boshlanmagan" bo'lib
 * chiqardi va operator jurnalda bayramni umuman ko'rmasdi.
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

const BAYRAM: Bayram[] = [{
  id: 'h1', name: 'Mustaqillik bayrami',
  startsOn: '2026-08-28', endsOn: '2026-09-02', yillik: false,
}];

const oyna = (holidays: Bayram[] = []) => ({
  start: '09:00', end: '19:00', weekdays: [1, 2, 3, 4, 5, 6],
  timeZone: 'Asia/Tashkent', holidays,
});

// 2026-08-31 — dushanba, ish vaqti ichida (Toshkentda 12:00).
const BAYRAMDA = new Date('2026-08-31T07:00:00Z');
// 2026-09-03 — payshanba, ish vaqti ichida.
const ISH_KUNI = new Date('2026-09-03T07:00:00Z');

// ── 1. Bayramda yuborilmaydi ──────────────────────────────────────────
{
  const d = evaluateWindow(BAYRAMDA, oyna(BAYRAM));
  eq('bayramda ruxsat yo\'q', d.allowed, false);
  eq('sabab bayram nomini o\'z ichiga oladi', (d.reason ?? '').includes('Mustaqillik bayrami'), true);
  eq('qayta urinish vaqti bor', typeof d.retryAfterMs, 'number');
}

// ── 2. Ro'yxat bo'sh bo'lsa eski xatti-harakat ────────────────────────
eq('bayramsiz o\'sha kun ochiq', evaluateWindow(BAYRAMDA, oyna()).allowed, true);

// ── 3. Bayramdan keyingi ish kuni ochiq ───────────────────────────────
eq('ish kuni ochiq', evaluateWindow(ISH_KUNI, oyna(BAYRAM)).allowed, true);

// ── 4. Bayram ish vaqtidan OLDIN tekshiriladi ─────────────────────────
{
  // Toshkentda 07:00 — ish vaqti hali boshlanmagan VA bayram.
  const erta = new Date('2026-08-31T02:00:00Z');
  const d = evaluateWindow(erta, oyna(BAYRAM));
  eq('erta soatda ham sabab — bayram', (d.reason ?? '').includes('Mustaqillik'), true);
}

console.log(failed === 0 ? '\nHammasi o\'tdi' : `\n${failed} ta test yiqildi`);
process.exit(failed === 0 ? 0 : 1);
