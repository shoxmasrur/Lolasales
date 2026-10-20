/**
 * Ommaviy boshlashdan oldingi tekshiruv SQL'i (`previewBulkStart`).
 *
 * CASE tartibi `StartConversationUseCase.execute` dagi tekshiruvlar
 * tartibini takrorlaydi. Sotuvda shartnoma/qarz shartlari YO'Q: har bir
 * yaroqli lead yoziladi. `$1` — mijoz id'lari.
 *
 * DIQQAT: `pool` import qilinmaydi — bazasiz test uchun.
 */
export function bulkOldindanSql(alive: string): string {
  return `SELECT c.id, c.full_name, c.telegram_name, c.phone,
              CASE
                WHEN c.do_not_contact THEN 'do_not_contact'
                WHEN c.telegram_status = 'blocked' THEN 'blocked'
                WHEN c.telegram_status = 'deactivated' THEN 'deactivated'
                WHEN c.phone IS NULL AND c.telegram_user_id IS NULL THEN 'no_phone'
                WHEN COALESCE(cv.state, 'new') <> 'new' THEN 'already_started'
                WHEN c.telegram_status = 'name_mismatch' THEN 'name_mismatch'
                WHEN c.telegram_user_id IS NOT NULL THEN 'ready'
                ELSE 'needs_lookup'
              END AS outlook
         FROM clients c
         -- Use case eng OXIRGI suhbatga qaraydi (findByClientId), shuning
         -- uchun bu yerda ham aynan shu qator olinadi.
         LEFT JOIN LATERAL (
           SELECT cv2.state
             FROM conversations cv2
            WHERE cv2.client_id = c.id AND cv2.deleted_at IS NULL
            ORDER BY cv2.created_at DESC
            LIMIT 1
         ) cv ON TRUE
        WHERE c.id = ANY($1::uuid[]) AND ${alive}
          AND NOT c.nomalum
        ORDER BY c.full_name ASC`;
}
