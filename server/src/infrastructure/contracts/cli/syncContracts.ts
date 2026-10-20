import { createContainer } from '@/composition/container';
import { closePool } from '@/infrastructure/db/pool';

/**
 * Qo'lda to'liq sinxronizatsiya:
 *   npm run sync-contracts --workspace=server
 *
 * Kechani kutmasdan hamma shartnomani yangilaydi. Birinchi ishga
 * tushirishda va Excel importidan keyin foydali.
 */
const container = createContainer();
const started = Date.now();

const stats = await container.services.contractSyncScheduler.runNow();

console.log(`
Yangilandi   ${stats.ok}
Topilmadi    ${stats.notFound}
Xato         ${stats.failed}
Vaqt         ${Math.round((Date.now() - started) / 1000)} s
`);

await closePool();
