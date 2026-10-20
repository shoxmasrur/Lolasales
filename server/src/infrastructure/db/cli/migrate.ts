import { runMigrations } from '@/infrastructure/db/migrator';
import { closePool } from '@/infrastructure/db/pool';
import { logger } from '@/shared/logger';

try {
  await runMigrations();
} catch (err) {
  logger.error({ err }, 'Migratsiya xatosi');
  process.exitCode = 1;
} finally {
  await closePool();
}
