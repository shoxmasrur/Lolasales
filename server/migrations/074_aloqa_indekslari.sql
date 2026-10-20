-- "O'qigani tasdiqlanmagan" filtrining anti-join'i uchun indeks —
-- "shu mijozning BIRORTA chiquvchi xabari o'qilgan deb belgilanganmi"
-- so'roviga (`aloqaHolati.ts`dagi `oqilmagan` sharti) xizmat qiladi.
--
-- idx_messages_unread_out (038-migratsiya) bunga yaramaydi: u
-- `read_at IS NULL`ni qidiradi, bizga esa teskarisi — "o'qilgan"
-- xabarlar — kerak.
--
-- `conversations`ga YANGI INDEKS QO'SHILMAYDI: mavjud
-- `idx_conversations_client_account_alive` (032_soft_delete.sql:54,
-- `UNIQUE (client_id, telegram_account_id) WHERE deleted_at IS NULL`)
-- allaqachon `client_id`dan boshlanadigan btree. Uning qisman predikati
-- (`deleted_at IS NULL`) `aloqaSharti`dagi har ikkala so'rovning
-- `cv.deleted_at IS NULL` shartiga ANIQ mos keladi, ya'ni planner
-- indeksni qo'shimcha recheck'siz ishlata oladi — yo'l nafaqat bor,
-- balki filtrga moslashtirilgan ham. Bitta mijozda odatda bir yoki
-- ikkita suhbat bo'ladi. Agar keyinchalik produksiyada `EXPLAIN` shu
-- filtr uchun `conversations`da sequential scan ko'rsatsa, o'shanda
-- o'lchab, maqsadli indeks qo'shish kerak — bashorat qilib emas.
--
-- DIQQAT — KATTA JADVAL: migratsiya BEGIN/COMMIT ichida ketadi
-- (`migrator.ts:48`), shuning uchun bu yerda `CONCURRENTLY` ishlatib
-- bo'lmaydi va oddiy `CREATE INDEX` jadvalga yozishni indeks
-- qurilgunicha to'xtatib turadi. `messages` katta bo'lsa, migratsiyadan
-- OLDIN shu indeksni qo'lda `CREATE INDEX CONCURRENTLY` bilan yaratib
-- qo'ying — unda `IF NOT EXISTS` tufayli migratsiya bu yerda hech
-- narsa qilmaydi.

CREATE INDEX IF NOT EXISTS idx_messages_read_out
    ON messages (conversation_id)
 WHERE direction = 'out' AND read_at IS NOT NULL AND deleted_at IS NULL;
