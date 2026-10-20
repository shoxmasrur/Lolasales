import { createContainer } from '@/composition/container';
import { closePool } from '@/infrastructure/db/pool';
import { davrKunlari, narxPrognozi, PROGNOZ_KUNLARI } from '@/domain/services/agentNarxi';
import { toIsoDate } from '@/shared/datetime';

/**
 * Qo'lda: npm run agent-cost --workspace=server -- 2026-08-01 2026-08-31
 *
 * Agentga qancha pul ketayotganini ko'rsatadi. Sanalar berilmasa —
 * o'lchov boshlangan kundan bugungacha.
 *
 * Asosiy raqam — "1 javob" qatori: boshqa provayder bilan solishtiruv
 * aynan shu yerda boshlanadi.
 */
const REJIM_NOMI: Record<string, string> = {
  first: 'Birinchi murojaat',
  reply: 'Mijozga javob',
  nudge: 'Eslatma',
  operator: 'Operator topshirig\'i',
  receipt_confirmed: 'Chek tasdiqlandi (rahmat)',
  receipt_rejected: 'Chek rad etildi',
};

const from = process.argv[2] ?? '2026-01-01';
const to = process.argv[3] ?? toIsoDate(new Date()) ?? '2026-12-31';

const container = createContainer();
const s = await container.repositories.agentUsage.summary(from, to);

const usd = (n: number): string => `$${n.toFixed(n < 1 ? 4 : 2)}`;
const son = (n: number): string => n.toLocaleString('ru-RU');

if (!s.totals.calls) {
  console.log(`\nDavr: ${from} … ${to} — bu davrda agent chaqiruvi yo'q.\n`);
  await closePool();
  process.exit(0);
}

const sinceIso = s.since ? toIsoDate(s.since) : null;
const kunlar = davrKunlari(from, to, sinceIso);
const p = narxPrognozi(s.totals.costUsd, s.totals.calls, kunlar);

console.log(`\nAgent xarajati:  ${from} … ${to}   (${kunlar} kun)`);
if (sinceIso && sinceIso > from) {
  console.log(`O'lchov ${sinceIso} dan boshlangan — undan oldingi xarajat yozilmagan.`);
}

const qator = (label: string, value: string, izoh = ''): string =>
  `  ${label.padEnd(16)}${value}${izoh}`;

console.log('');
console.log(qator('Chaqiruvlar:', son(s.totals.calls)));
console.log(qator('Jami:', usd(s.totals.costUsd)));
console.log(qator('1 javob:', usd(p.perCall)));
console.log(qator('Kuniga:', usd(p.perDay)));
console.log(qator(`${PROGNOZ_KUNLARI} kunga:`, usd(p.perMonth), '   ← shu tezlik saqlansa'));
console.log(qator("O'rtacha vaqt:", `${(s.totals.avgDurationMs / 1000).toFixed(1)} s`));

// Kesh ulushi alohida: boshqa provayderda kesh boshqacha (yoki umuman
// yo'q) narxlanadi, shuning uchun solishtirishdan oldin bu ulush
// qanchaligini bilish shart.
const kiruvchi = s.totals.inputTokens + s.totals.cacheReadTokens + s.totals.cacheWriteTokens;
const keshUlushi = kiruvchi ? Math.round((s.totals.cacheReadTokens / kiruvchi) * 100) : 0;
console.log('\nTokenlar:');
console.log(qator('Kiruvchi:', son(s.totals.inputTokens)));
console.log(qator('Keshdan:', son(s.totals.cacheReadTokens), `  (kiruvchining ${keshUlushi}%)`));
console.log(qator('Keshga yozildi:', son(s.totals.cacheWriteTokens)));
console.log(qator('Chiquvchi:', son(s.totals.outputTokens)));

console.log('\nRejim bo\'yicha:');
for (const m of s.byMode) {
  const nomi = REJIM_NOMI[m.mode] ?? m.mode;
  const bitta = m.calls ? m.costUsd / m.calls : 0;
  console.log(
    `  ${nomi.padEnd(20)} ${String(m.calls).padStart(6)} ta  ` +
      `${usd(m.costUsd).padStart(10)}   1 javob: ${usd(bitta)}`,
  );
}

// Oxirgi 14 kun yetadi: undan uzoq ro'yxat terminalda o'qilmaydi,
// tendensiya esa shu oraliqda ham ko'rinadi.
const oxirgi = s.byDay.slice(-14);
if (oxirgi.length > 1) {
  console.log('\nKun bo\'yicha:');
  for (const d of oxirgi) {
    console.log(`  ${d.day}  ${String(d.calls).padStart(5)} ta  ${usd(d.costUsd).padStart(10)}`);
  }
}

console.log();
await closePool();
