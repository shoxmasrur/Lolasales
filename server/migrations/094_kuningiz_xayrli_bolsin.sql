-- "Yaxshi kunlar tilayman" o'rniga "Kuningiz xayrli bo'lsin" (2026-09-15).
--
-- Agent xayrlashuvni "Arzimaydi, Baxodir aka. Yaxshi kunlar tilayman" deb
-- yozdi. Bu ruschadan ko'chirma ("хорошего дня"), o'zbekchada sun'iy
-- eshitiladi. Prodda agent bu iborani 98 marta yozgan (lotin va kirillda),
-- "kuningiz xayrli bo'lsin" esa bir marta ham. Ibora qoidalarda YO'Q —
-- agent uni o'zi yozgan. 090 dagi kabi: so'zning yo'qligi taqiq emas,
-- shuning uchun ibora aniq nomlanadi va to'g'ri shakl beriladi.
--
-- `sort_order = -1` — bo'lim boshida, "qarz" va "ойимча" taqiqlari yonida.
-- Qayta ishga tushirilsa hech nima o'zgarmaydi. Qo'riqchi `deleted_at` ga
-- qaramaydi — operator o'chirgan qoida tirilmaydi.

INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id, v.body, v.ord
  FROM agent_rule_sections s,
       (VALUES
         ('XAYRLASHGANDA "Yaxshi kun(lar) tilayman" ("Яхши кунлар тилайман") deb YOZMA — bu ruschadan ko''chirma, o''zbekchada sun''iy eshitiladi. O''rniga: "Kuningiz xayrli bo''lsin" (kirillda — "Кунингиз хайрли бўлсин").', -1)
       ) AS v(body, ord)
 WHERE s.key = 'prohibitions'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.body LIKE 'XAYRLASHGANDA "Yaxshi kun(lar) tilayman"%');
