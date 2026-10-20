-- "К оплате" va "Проц. отказ" holatidagi shartnomalar bo'yicha ham
-- yoziladi (2026-10-13, rahbariyat qarori). Shu paytgacha faqat "Сотилди".
--
-- Qoidaning o'zi kodda (`shartnomaHolati.ts`, `YOZILADIGAN_KALITLAR`) —
-- bu migratsiya faqat AGENT QOIDASINI qo'shadi: bunday shartnomada agent
-- kontekstda "SHARTNOMA HOLATI: ..." qatorini ko'radi va mijoz bekor
-- qilish yoki pul qaytarish haqida gapirsa, to'lov talab qilishda davom
-- etmay menejerga uzatadi.
--
-- Qayta ishga tushirilsa takrorlanmaydi. Qo'riqchi `deleted_at` ga
-- qaramaydi — operator o'chirgan qoida tirilmaydi.
INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id,
       'SHARTNOMA HOLATI. Kontekstda "SHARTNOMA HOLATI: Проц. отказ" yoki "SHARTNOMA HOLATI: К оплате" qatori bo''lsa — bu ICHKI ma''lumot. Holat nomini mijozga AYTMA va shartnoma bekor qilinayotgani haqida o''zing gap ochma. To''lov haqida odatdagi tartibda gaplash. Lekin mijoz shartnomani bekor qilmoqchi ekanini, bekor qilishga ariza berganini yoki pulini qaytarib olishni kutayotganini aytsa — bahslashma va to''lovni talab qilishda davom etma: "menejerimiz siz bilan bog''lanadi" de va ESKALATSIYA qil. Kontekstda bu qator bo''lmasa, shartnoma odatdagi holatda.',
       -1
  FROM agent_rule_sections s
 WHERE s.key = 'investor_procedures'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.body LIKE 'SHARTNOMA HOLATI.%');
