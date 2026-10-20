import type { ClientQuery } from '@/domain/repositories/IClientRepository';

/**
 * Mijozlar ro'yxatidagi xarid/manba filtrlari uchun SQL shartlari.
 *
 * `params` ga qiymatlarni QO'SHADI va `$n` raqamlarini o'zi hisoblaydi.
 * "Joriy xarid" = faol xarid, bo'lmasa eng oxirgisi (`PgPurchaseRepository`
 * bilan bir xil qoida).
 *
 * DIQQAT: `@/infrastructure/db/pool` import qilinmaydi — bazasiz test uchun.
 */
export function xaridShartlari(q: Pick<ClientQuery, 'stage' | 'source' | 'courseId'>, params: unknown[]): string[] {
  const where: string[] = [];
  if (q.source) {
    params.push(q.source);
    where.push(`c.source = $${params.length}`);
  }
  if (q.stage || q.courseId) {
    const ichki: string[] = [];
    if (q.stage) {
      params.push(q.stage);
      ichki.push(`cp.stage = $${params.length}`);
    }
    if (q.courseId) {
      params.push(q.courseId);
      ichki.push(`cp.course_id = $${params.length}::uuid`);
    }
    where.push(`EXISTS (
      SELECT 1 FROM (
        SELECT DISTINCT ON (p.client_id) p.stage, p.course_id
          FROM purchases p
         WHERE p.client_id = c.id
         ORDER BY p.client_id, (p.stage NOT IN ('toladi', 'rad_etdi')) DESC, p.created_at DESC
      ) cp WHERE ${ichki.join(' AND ')})`);
  }
  return where;
}
