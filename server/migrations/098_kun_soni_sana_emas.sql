-- "3-4 kunda" — kun soni, oyning sanasi emas (2026-09-15).
--
-- Real holat (2026-09-07): agent maosh kunini so'radi, mijoz "3 4 кунлар"
-- deb javob berdi (3-4 kunda to'layman degani), agent esa "4-октябрь деб
-- ёзиб қўйдим" dedi va va'dani 2026-10-04 ga yozdi. Operator 09-09 da uni
-- bekor qilib, qo'lda hafta oxiriga to'g'riladi. Prodda yana 4 ta suhbatda
-- mijozning "N M kun" javobidan keyin agent oy nomi bilan sana yozgan.
--
-- Maosh kunini so'rash savoli 095 da olib tashlangan — chalkashlikning bir
-- sababi shu edi. Bu migratsiya ikkinchisini yopadi: raqam + "kun(lar)"
-- bugundan hisoblanadi. Kodda systemPrompt.ts dagi promise maydoni
-- qoidasi ham tuzatildi (u bazada yo'q).
--
-- Qayta ishga tushirilsa takrorlanmaydi. Qo'riqchi `deleted_at` ga
-- qaramaydi — operator o'chirgan qoida tirilmaydi.

INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id,
       '"3-4 KUNDA", "3 4 kunlar", "2-3 kun ichida" — bu BUGUNDAN hisoblanadigan KUN SONI, oyning sanasi EMAS. Kattasini ol: "3-4 kunda" — bugundan 4 kun keyin (masalan, bugun 15-sentyabr bo''lsa — 19-sentyabr). Sanani BUGUN blokidan hisobla va mijozga kun-oy bilan qaytar. Son oyning kuni bo''lishi uchun yonida "-sana", "-chisi" yoki oy nomi turishi kerak. Oldingi savoling oyning kuni haqida bo''lgan bo''lsa-yu, javob "kun(lar)" so''zi bilan kelsa — bir marta aniqlashtir: "3-4 kun ichidami, 19-sentyabrgacha deb yozaymi?"',
       COALESCE((SELECT MAX(r2.sort_order) FROM agent_rules r2
                  WHERE r2.section_id = s.id AND r2.deleted_at IS NULL), 0) + 1
  FROM agent_rule_sections s
 WHERE s.key = 'promise_acceptance'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.body LIKE '"3-4 KUNDA"%');
