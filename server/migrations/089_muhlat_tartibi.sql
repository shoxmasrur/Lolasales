-- Muhlat tartibi: sababga qarab 2/3/4 oy, undan uzoqqa muqobil yo'l,
-- to'lovdan bosh tortganga 3.7-band (rahbariyat yo'riqnomasi, 2026-09-14).
--
-- ESKI TARTIB: birinchi so'rovda 3.7-band o'qilardi, qayta so'ralsa 2 oy
-- berilardi. Yangisida avval SABAB so'raladi, muhlat chegarasi sababga
-- bog'liq. "Kechikish 2 oydan oshsa va'da qilma" qoidasi O'ZGARMAYDI.
--
-- MANBADAN ATAYLAB OLINMAGAN IKKI GAP:
--   • "har bir to'lov qurilish uchun muhim" — 061-migratsiyadagi taqiq
--     (pul qayerga ketishini bahona qilib to'lov so'ralmaydi) kuchda qoladi;
--     eski birinchi qoidadagi "qurilish jarayoniga ta'sir qiladi" ham
--     shu sababli olib tashlandi.
--   • "programma avtomatik bekor qiladi" — tasdiqlanmagan; faqat
--     "quruvchi bekor qilish huquqiga ega" deyiladi.
--
-- NEGA UPDATE: ikki eski qoida yangisiga zid. Ular qolsa promptda bir
-- mavzuda ikki xil chegara (2 oy va 3 oy) turardi.
--
-- OPERATOR TAHRIRI: eski matn UI'da tahrirlangan bo'lsa, LIKE mos kelmaydi
-- va UPDATE jimgina o'tib ketadi. Qo'llagandan keyin bazada tekshiring:
--   SELECT body FROM agent_rules r JOIN agent_rule_sections s ON s.id = r.section_id
--    WHERE s.key = 'investor_procedures' AND r.deleted_at IS NULL
--      AND r.body LIKE 'MUHLAT%';
--
-- Qayta ishga tushirilsa natija o'zgarmaydi. INSERT qo'riqchilari
-- `deleted_at` ga qaramaydi — operator o'chirgan qoida tirilmaydi.

-- ─── 1. Birinchi so'rov: avval sabab ─────────────────────────────────────
UPDATE agent_rules r
   SET body = 'MUHLAT SO''RALSA ("2–3 oy to''lay olmayman", "to''lamay tursam nima bo''ladi?") — avval SABABINI so''ra. Muhlat necha oy bo''lishini sababni bilgandan KEYIN aytasan; shu xabarda summa ham so''rama.',
       updated_at = now()
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'investor_procedures'
   AND r.deleted_at IS NULL
   AND r.body LIKE 'MUHLAT SO''RALSA (birinchi marta)%';

-- ─── 2. Chegara sababga bog'liq ──────────────────────────────────────────
UPDATE agent_rules r
   SET body = 'MUHLAT CHEGARASI SABABGA BOG''LIQ. Sabab ISH BILAN bog''liq (maosh kechikdi yoki o''zgardi, ish joyi o''zgardi) — ko''pi bilan 2 OY. Boshqa sabablarda — ko''pi bilan 3 OY. Faqat JIDDIY vaziyatda (og''ir kasallik, oiladagi musibat, favqulodda hodisa) — 4 OY, bu eng uzoq muddat. Shu chegara ichida muhlatga O''ZING rozi bo''lasan (kechikish 2 oydan oshmagan bo''lsa — keyingi qoida). Shartini ANIQ ayt: muhlat tugagan kuni o''sha kungacha yig''ilgan to''lovning HAMMASI bir martada to''lanadi — summani o''zing hisoblab raqam bilan aytma. Tugash sanasini BUGUN blokidan hisobla va promise ga yoz; sabab va muhlat muddatini note ga yoz. Muhlat so''ralganda "OY BOSHIDA UZOQ MUDDAT BERMA" va "OY OXIRIDA MUHLATNI KEYINGI OYGA SURMA" qoidalari qo''llanmaydi — ular oddiy sana kelishuvi uchun.',
       updated_at = now()
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'investor_procedures'
   AND r.deleted_at IS NULL
   AND r.body LIKE 'MUHLAT QAYTA SO''RALSA%';

-- ─── 3. 4 oydan uzoq muhlat: muqobil yo'l va bosh ofis ───────────────────
INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id,
       'MIJOZ 4 OYDAN UZOQ MUHLAT SO''RASA — bunday muhlat bera olmasligimizni ochiq ayt, uzr so''rab cho''zma. O''rniga boshqa yo''llarni taklif qil: xonadonni boshqasiga almashtirish; mijozda BIR NECHTA shartnoma bo''lsa — bittasini bekor qilib, uning pulini boshqa shartnomasiga o''tkazish imkoniyati bor. Bularni o''zing rasmiylashtirmaysan va natijasini va''da qilmaysan: mijozni bosh ofisga taklif qil — Toshkent shahri, Yunusobod tumani, "Orzular" sotuv ofisi. ESKALATSIYA qil.',
       COALESCE((SELECT MAX(r2.sort_order) FROM agent_rules r2
                  WHERE r2.section_id = s.id AND r2.deleted_at IS NULL), 0) + 1
  FROM agent_rule_sections s
 WHERE s.key = 'investor_procedures'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.body LIKE 'MIJOZ 4 OYDAN UZOQ MUHLAT%');

-- ─── 4. To'lovdan bosh tortish: 3.7-band ─────────────────────────────────
INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id,
       'MIJOZ TO''LOVDAN BOSH TORTSA ("umumiy muddat tugaguncha yopaman", "3 yil ichida xohlagan paytimda to''layman") — shartnoma shartini eslat: 3.7-bandga ko''ra to''lovlar jadvalda ko''rsatilgan MUDDATDA va MIQDORDA quruvchining hisob raqamiga kelishi kerak. Jadvalga amal qilmaslik shartnomani buzish hisoblanadi va bunda quruvchi shartnomani bir tomonlama bekor qilish huquqiga ega. Buni quruq FAKT sifatida, bir marta ayt. Pul qurilishga ketishini dalil qilma va "avtomatik bekor bo''ladi" DEMA.',
       COALESCE((SELECT MAX(r2.sort_order) FROM agent_rules r2
                  WHERE r2.section_id = s.id AND r2.deleted_at IS NULL), 0) + 1
  FROM agent_rule_sections s
 WHERE s.key = 'investor_procedures'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.body LIKE 'MIJOZ TO''LOVDAN BOSH TORTSA%');
