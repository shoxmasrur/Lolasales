import fs from 'node:fs/promises';
import path from 'node:path';
import { runMigrations } from '@/infrastructure/db/migrator';
import { closePool } from '@/infrastructure/db/pool';
import { createContainer } from '@/composition/container';
import { logger } from '@/shared/logger';

/**
 * Terminaldan import:
 *   npm run import --workspace=server -- leads "/path/to/mijozlar.xlsx"
 */
async function main(): Promise<void> {
  const [kind, filePath] = process.argv.slice(2);

  if (!kind || !filePath || kind !== 'leads') {
    logger.error('Foydalanish: npm run import -- leads <fayl yo\'li>');
    process.exitCode = 1;
    return;
  }

  await runMigrations();
  const container = createContainer();
  const buffer = await fs.readFile(filePath);
  const filename = path.basename(filePath);

  const result = await container.useCases.importLeads.execute({ buffer, filename });

  logger.info(
    {
      rowsTotal: result.batch.rowsTotal,
      rowsOk: result.batch.rowsOk,
      rowsFailed: result.batch.rowsFailed,
      clientsCreated: result.batch.clientsCreated,
      contractsCreated: result.batch.contractsCreated,
      contractsUpdated: result.batch.contractsUpdated,
    },
    'Import yakunlandi',
  );

  for (const warning of result.warnings) logger.warn(warning);
  for (const err of result.batch.errors.slice(0, 10)) {
    logger.warn({ row: err.row, value: err.value }, err.reason);
  }
}

try {
  await main();
} catch (err) {
  logger.error({ err }, 'Import xatosi');
  process.exitCode = 1;
} finally {
  await closePool();
}
