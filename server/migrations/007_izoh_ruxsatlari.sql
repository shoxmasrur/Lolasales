-- Task 13: kanal izohlaridan mijoz olish (Guruhlar sahifasi).
-- Ruxsatlar admin va operator rollariga beriladi; boshqa rollarga admin o'zi qo'shadi.

UPDATE roles SET permissions = array_append(permissions, 'comments.view')
 WHERE key IN ('admin', 'operator') AND NOT ('comments.view' = ANY(permissions));
UPDATE roles SET permissions = array_append(permissions, 'comments.import')
 WHERE key IN ('admin', 'operator') AND NOT ('comments.import' = ANY(permissions));
