import { createContainer } from '@/composition/container';
import { closePool } from '@/infrastructure/db/pool';

/**
 * Qo'lda: npm run check-promises --workspace=server
 *
 * Kuzatuvchining `verify()` tsiklini bir marta yurgizadi — 15 daqiqa
 * kutmasdan.
 *
 * DIQQAT: rahmat xabarlari REAL yuboriladi (kill switch va ish vaqti
 * oynasi ostida). Sinash uchun `KILL_SWITCH=true` bilan yurgizing.
 */
const container = createContainer();
const acted = await container.services.promiseWatcher.verify();

console.log(`\nTa'sir ko'rsatilgan va'dalar: ${acted}\n`);

await closePool();
