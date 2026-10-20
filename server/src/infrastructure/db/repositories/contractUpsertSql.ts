/**
 * Debitorlar faylini `contract_no` bo'yicha upsert qilish.
 *
 * CRM HISOBLAGAN RAQAMLARGA TEGILMAYDI. `ContractSyncService` kechikkan
 * to'lovni CRM to'lov grafigidan qayta hisoblab yozadi; ertalabki import esa
 * o'sha ustunlarni fayldagi — bir necha kunlik — qiymatlar bilan ustidan
 * bosib ketardi. `synced_at` ga tegilmagani uchun qator "hozirgina
 * yangilangan" bo'lib ko'rinardi, summa esa eskiga qaytardi: 2026-08-21 da
 * sinxronlangan 816 shartnomaning 159 tasi shu sababdan jami ~1,3 mlrd so'm
 * ortiqcha kechikish ko'rsatib turardi.
 *
 * Qoida: shartnoma bir marta CRM'dan olingan bo'lsa (`synced_at IS NOT
 * NULL`) — bu raqamlar CRM'niki. Hali olinmagan bo'lsa fayl yagona manba va
 * odatdagidek yoziladi.
 */
export const CONTRACT_UPSERT_SQL = `INSERT INTO contracts (
         client_id, contract_no, external_id, object_name, status, virtual_status, category,
         total_price, first_payment, monthly_payment, paid_total, remaining_total,
         contract_date, months, next_payment_date, days_overdue,
         debt_first, debt_monthly, debt_total,
         warning_count, last_warning_type, last_warning_method, last_warning_manager, last_warning_at,
         raw, import_batch_id, created_import_batch_id
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27
       )
       -- Unique indeks qisman (faqat tirik shartnomalar) — 032-migratsiya.
       ON CONFLICT (contract_no) WHERE deleted_at IS NULL DO UPDATE SET
         client_id = EXCLUDED.client_id,
         external_id = EXCLUDED.external_id,
         object_name = EXCLUDED.object_name,
         status = EXCLUDED.status,
         virtual_status = EXCLUDED.virtual_status,
         category = EXCLUDED.category,
         total_price = EXCLUDED.total_price,
         first_payment = EXCLUDED.first_payment,
         monthly_payment = EXCLUDED.monthly_payment,
         -- Quyidagi yettitasi — CRM sinxronizatsiyasiniki (yuqoridagi izoh).
         paid_total        = CASE WHEN contracts.synced_at IS NULL THEN EXCLUDED.paid_total        ELSE contracts.paid_total        END,
         remaining_total   = CASE WHEN contracts.synced_at IS NULL THEN EXCLUDED.remaining_total   ELSE contracts.remaining_total   END,
         next_payment_date = CASE WHEN contracts.synced_at IS NULL THEN EXCLUDED.next_payment_date ELSE contracts.next_payment_date END,
         days_overdue      = CASE WHEN contracts.synced_at IS NULL THEN EXCLUDED.days_overdue      ELSE contracts.days_overdue      END,
         debt_first        = CASE WHEN contracts.synced_at IS NULL THEN EXCLUDED.debt_first        ELSE contracts.debt_first        END,
         debt_monthly      = CASE WHEN contracts.synced_at IS NULL THEN EXCLUDED.debt_monthly      ELSE contracts.debt_monthly      END,
         debt_total        = CASE WHEN contracts.synced_at IS NULL THEN EXCLUDED.debt_total        ELSE contracts.debt_total        END,
         contract_date = EXCLUDED.contract_date,
         months = EXCLUDED.months,
         warning_count = EXCLUDED.warning_count,
         last_warning_type = EXCLUDED.last_warning_type,
         last_warning_method = EXCLUDED.last_warning_method,
         last_warning_manager = EXCLUDED.last_warning_manager,
         last_warning_at = EXCLUDED.last_warning_at,
         raw = EXCLUDED.raw,
         -- import_batch_id — oxirgi tekkan import; created_import_batch_id
         -- esa ATAYLAB yangilanmaydi: shartnomani kim yaratgani o'zgarmaydi.
         import_batch_id = EXCLUDED.import_batch_id
       RETURNING *, (xmax = 0) AS inserted`;
