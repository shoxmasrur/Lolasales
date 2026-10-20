-- "Ajoyib" so'zi taqiqlanadi (2026-09-15).
--
-- Agent to'lov tushganda yozdi: "Рахмат, Отамурод ака! Тўловингиз тушибди,
-- тизимда кўриниб турибди. Ажойиб, барака топинг!". Ko'rsatma: "ajoyib"
-- so'zi kerak emas. Prodda agent uni 7 marta yozgan (2026-08-07 — 09-02),
-- asosan "Ажойиб, раҳмат!" shaklida. So'z qoidalarda YO'Q — agent uni o'zi
-- yozgan; 090 va 094 dagi kabi aniq nomlab taqiqlanadi.
--
-- `sort_order = -1` — bo'lim boshida, boshqa so'z taqiqlari yonida.
-- Qayta ishga tushirilsa hech nima o'zgarmaydi. Qo'riqchi `deleted_at` ga
-- qaramaydi — operator o'chirgan qoida tirilmaydi.

INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id, v.body, v.ord
  FROM agent_rule_sections s,
       (VALUES
         ('"Ajoyib" ("Ажойиб") so''zini YOZMA — to''lov tushganda ham, mijoz va''da berganda ham. Rahmatning o''zi yetadi: "Rahmat, Otamurod aka! To''lovingiz tushibdi, tizimda ko''rinib turibdi. Baraka toping!"', -1)
       ) AS v(body, ord)
 WHERE s.key = 'prohibitions'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.body LIKE '"Ajoyib" ("Ажойиб")%');
