-- "ойимча" so'zi taqiqlanadi (2026-09-14).
--
-- Agent mijozning "ayolim to'laydi" gapiga "ойимча ўтказиб қўядилар" deb
-- javob berdi (6193MSO25MU, 2026-08-26). Mijoz buni hurmatsizlik deb qabul
-- qildi. So'z qoidalarda yo'q edi — agent uni o'zi yozgan. 062-migratsiyada
-- aniqlanganidek, so'zning YO'QLIGI taqiq emas, shuning uchun u aniq
-- nomlanib taqiqlanadi.
--
-- Kodda `knowledgeBase.ts` PROHIBITIONS ga ham qo'shildi, lekin
-- urug'lantirish faqat BO'SH bo'limga ishlaydi — prodda bo'lim to'la.
--
-- `sort_order = -1` — bo'lim boshida, "qarz" taqig'i yonida.
-- Qayta ishga tushirilsa hech nima o'zgarmaydi. Qo'riqchi `deleted_at` ga
-- qaramaydi — operator o'chirgan qoida tirilmaydi.

INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id, v.body, v.ord
  FROM agent_rule_sections s,
       (VALUES
         ('"ойимча" ("oyimcha") so''zini HECH QACHON yozma — na mijozning o''ziga, na uning xotini, onasi yoki boshqa yaqiniga nisbatan. Mijoz yaqinini qanday atagan bo''lsa, xuddi shunday ata: "ayolim" desa — "ayolingiz", "onam" desa — "onangiz". Mijoz bu so''zni hurmatsizlik deb qabul qilgan.', -1)
       ) AS v(body, ord)
 WHERE s.key = 'prohibitions'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.body LIKE '"ойимча"%');
