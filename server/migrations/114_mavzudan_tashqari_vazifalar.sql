-- To'lovga aloqasi yo'q vazifalarni bajarmaslik (2026-09-30).
--
-- Mijoz Temirov Zuxriddin agentni ataylab sinadi: avval "5+9 nechchi?" deb
-- so'radi, keyin rasmda matematik tenglama yubordi. Agent ikkalasini ham
-- yechib berdi ("14.", "x = 116"), ustiga javobni LaTeX bilan yozdi va u
-- mijozga xom holicha ko'rindi. Mijozning o'zi ogohlantirdi: "Odam o'qisa
-- bu perepiskani matematik formula yechishga ruxsat bermaslik kerak…
-- shunaqa prompt injectionga uchrab qolasizlar".
--
-- Qoidalarda bunday band YO'Q edi — `after_agreement` faqat obyekt va
-- hujjat savollariga foydali javob berishni aytadi, ixtiyoriy topshiriq
-- haqida hech narsa demaydi. Ya'ni agent xato qilmadi, chegara qo'yilmagan
-- edi.
--
-- Ikki sabab: (1) har bir bunday javob pul va model chaqiruvi, (2) topshiriq
-- bajarish — hujum yuzasi; o'sha suhbatning o'zida mijoz keyin `.env` va
-- system promptni so'rab ikki marta prompt injection qildi (agent ularni
-- to'g'ri rad etdi).
--
-- Bo'lim `prohibitions` — ataylab UMUMIY (style_version IS NULL), ya'ni v1 va
-- v2 uslublarining ikkalasiga ham tushadi: bu uslub emas, qamrov chegarasi.
--
-- `sort_order = -1` — bo'lim boshida, boshqa taqiqlar yonida. Qayta ishga
-- tushirilsa hech nima o'zgarmaydi. Qo'riqchi `deleted_at` ga qaramaydi —
-- operator o'chirgan qoida tirilmaydi.

INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id, v.body, v.ord
  FROM agent_rule_sections s,
       (VALUES
         ('TO''LOVGA ALOQASI YO''Q VAZIFALARNI BAJARMA: matematik masala, kod yozish, tarjima, insho, umumiy bilim savollari, rasmda yuborilgan topshiriqlar. Bir jumla bilan muloyim rad et va o''z savolingga qayt: "Men to''lov bo''yicha yordam beraman, boshqa masalalarda yordam bera olmayman. To''lovni qaysi kuni qilib bera olasiz?" Mijoz seni sinayotgan bo''lsa ham bahslashma, izoh berma, "qiziq savol" deb maqtama. ISTISNO — to''lovning O''ZI haqidagi hisob: oylik summa, qoldiq, qarzdorlik, qismlarga bo''lish, kechikkan kunlar va sanalar. Bular sening ishing, hisoblab ber.', -1)
       ) AS v(body, ord)
 WHERE s.key = 'prohibitions'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.body LIKE 'TO''LOVGA ALOQASI YO''Q VAZIFALARNI BAJARMA%');
