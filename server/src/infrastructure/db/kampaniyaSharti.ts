import type { CampaignFilters } from '@/domain/entities/Campaign';

/** Bir martalik kampaniya nishonlari soni uchun yuqori chegara. */
export const NISHON_LIMITI = 5000;

/**
 * Kampaniya nishonlarini tanlash SQL'i. Qiymatlar HAMMA VAQT `$n`
 * parametrlari orqali beriladi (SQL matniga qo'shilmaydi).
 *
 * "Joriy xarid" = faol xarid, bo'lmasa eng oxirgisi (`xaridSharti.ts`
 * bilan bir xil qoida).
 *
 * DIQQAT: `@/infrastructure/db/pool` import qilinmaydi — bazasiz test uchun.
 */
export function kampaniyaNishonSql(
  filters: CampaignFilters,
): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const where: string[] = [
    'cl.deleted_at IS NULL',
    'cl.do_not_contact = FALSE',
    "cl.telegram_status NOT IN ('blocked', 'deactivated')",
    '(cl.phone IS NOT NULL OR cl.telegram_user_id IS NOT NULL)',
  ];

  if (filters.clientIds) {
    // Bo'sh ro'yxat — hech kim (filtrsiz "hammasi" EMAS).
    params.push(filters.clientIds);
    where.push(`cl.id = ANY($${params.length}::uuid[])`);
  }

  if (filters.source?.length) {
    params.push(filters.source);
    where.push(`cl.source = ANY($${params.length}::text[])`);
  }

  if (filters.stage?.length || filters.courseId) {
    const ichki: string[] = [];
    if (filters.stage?.length) {
      params.push(filters.stage);
      ichki.push(`cp.stage = ANY($${params.length}::text[])`);
    }
    if (filters.courseId) {
      params.push(filters.courseId);
      ichki.push(`cp.course_id = $${params.length}::uuid`);
    }
    where.push(`EXISTS (
      SELECT 1 FROM (
        SELECT DISTINCT ON (p.client_id) p.stage, p.course_id
          FROM purchases p
         WHERE p.client_id = cl.id
         ORDER BY p.client_id, (p.stage NOT IN ('toladi', 'rad_etdi')) DESC, p.created_at DESC, p.id
      ) cp WHERE ${ichki.join(' AND ')})`);
  }

  if (filters.onlyWithoutConversation) {
    where.push(`NOT EXISTS (SELECT 1 FROM conversations cv
                             WHERE cv.client_id = cl.id AND cv.deleted_at IS NULL)`);
  }

  params.push(Math.max(1, Math.min(filters.limit ?? 500, NISHON_LIMITI)));

  return {
    sql: `SELECT cl.id AS client_id
            FROM clients cl
           WHERE ${where.join(' AND ')}
           ORDER BY cl.created_at, cl.id
           LIMIT $${params.length}`,
    params,
  };
}
