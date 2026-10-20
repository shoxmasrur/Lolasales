import { createContainer } from '@/composition/container';
import { closePool } from '@/infrastructure/db/pool';
import { BUCKET_LABEL, type Buckets } from '@/domain/services/attributionBuckets';
import type { GroupResult } from '@/domain/repositories/IReportRepository';

/**
 * Qo'lda: npm run check-report --workspace=server -- 2026-01-01 2026-12-31
 *
 * Hisobotni HTTP'siz hisoblab ko'rsatadi.
 */
const from = process.argv[2] ?? '2026-01-01';
const to = process.argv[3] ?? new Date().toISOString().slice(0, 10);

const container = createContainer();
const report = await container.repositories.reports.attribution(from, to);

const som = (n: number): string => `${n.toLocaleString('ru-RU')} so'm`;
const pct = (a: number, b: number): string => (b ? `${Math.round((a / b) * 100)}%` : '—');

const line = (label: string, g: GroupResult): string =>
  `${label.padEnd(16)} ${String(g.clients).padStart(5)} mijoz  →  ` +
  `${String(g.paidClients).padStart(4)} to'ladi (${pct(g.paidClients, g.clients).padStart(4)})  →  ${som(g.amount)}`;

console.log(`\nDavr: ${report.from} … ${report.to}\n`);
console.log(line('Gaplashilgan', report.contacted));
console.log(line('Gaplashilmagan', report.notContacted));

console.log('\nGaplashilganlar, xabardan keyin:');
for (const [key, label] of Object.entries(BUCKET_LABEL)) {
  console.log(`  ${label.padEnd(10)} ${som(report.contacted.buckets[key as keyof Buckets])}`);
}

const campaigns = await container.repositories.reports.byCampaign(10);
if (campaigns.length) {
  console.log('\nKampaniyalar:');
  for (const c of campaigns) {
    console.log(`  ${c.name.padEnd(24)} ${c.sent} yuborildi → ${c.paidClients} to'ladi → ${som(c.amount)}`);
  }
}

console.log();
await closePool();
