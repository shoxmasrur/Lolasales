-- Oylik to'lov grafigini o'zgartirib bo'lmaydi (2026-09-16, rahbariyat).
--
-- Investor "grafikni o'zgartirib bering", "oylik summani kamaytiring"
-- desa, javob bitta: grafikni shartnoma tuzilganda sotuv menejeri
-- belgilagan, u dasturga kiritilgan va saqlangan — o'zgartirib bo'lmaydi.
--
-- Bazada bu mavzu bo'yicha HECH QANDAY qoida yo'q edi: agent o'zicha
-- "bilib beraman" deb bo'lmaydigan umid berishi mumkin edi.
--
-- Rad javobi bilan to'xtab qolinmaydi. Foydalanuvchi qarori: avval
-- MUHLAT taklif qilinadi (089-migratsiyadagi 2/3/4 oy chegarasi ichida),
-- mijoz baribir grafikning O'ZINI o'zgartirishni talab qilsa — bosh
-- ofisga yo'naltiriladi va eskalatsiya qilinadi. Muhlat oyi esa faqat
-- SABAB ma'lum bo'lgandan keyin aytiladi — shuning uchun namunadagi
-- javob sababni so'rash bilan tugaydi.
--
-- Qayta ishga tushirilsa takrorlanmaydi. Qo'riqchi `deleted_at` ga
-- qaramaydi — operator o'chirgan qoida tirilmaydi.

-- ─── 1. Tartib qoidasi ──────────────────────────────────────────────────
INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id,
       'OYLIK TO''LOV GRAFIGINI O''ZGARTIRISH so''ralsa ("grafikni o''zgartirib bering", "oylik summani kamaytiring", "to''lov kunini boshqa kunga suring") — javob aniq va o''zgarmaydi: ayni vaqtda oylik to''lov grafigini o''zgartirish imkoni yo''q. Grafikni shartnoma tuzilganda sotuv menejeri belgilagan, u dasturga kiritilgan va saqlangan. "Bilib beraman", "so''rab ko''raman", "iloji bormi tekshiraman" DEMA — javob o''zgarmaydi. Lekin rad javobi bilan to''xtab qolma: qiyinchilik SABABINI so''ra va MUHLAT bo''yicha yo''l taklif qil (muhlat chegarasi qoidasiga qara). Mijoz baribir grafikning O''ZINI o''zgartirishni talab qilsa — bosh ofisga taklif qil (Toshkent shahri, Yunusobod tumani, "Orzular" sotuv ofisi) va ESKALATSIYA qil.',
       COALESCE((SELECT MAX(r2.sort_order) FROM agent_rules r2
                  WHERE r2.section_id = s.id AND r2.deleted_at IS NULL), 0) + 1
  FROM agent_rule_sections s
 WHERE s.key = 'investor_procedures'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.body LIKE 'OYLIK TO''LOV GRAFIGINI%');

-- ─── 2. Mijoz javobiga namuna ───────────────────────────────────────────
INSERT INTO agent_rules (section_id, situation, good_example, why, sort_order)
SELECT s.id,
       '22. "Oylik to''lovim menga og''irlik qilyapti. Grafikni o''zgartirib, oylik summani kamaytirib bera olasizmi?"',
       'Oylik to''lov grafigini o''zgartirish imkoni yo''q — u shartnoma tuzilganda belgilangan va dasturda saqlangan. Qiyinchilik nimadan bo''ldi? Sababini aytsangiz, muhlat bo''yicha yo''lini birga ko''ramiz.',
       'Grafik o''zgarmasligi DARHOL va aniq aytiladi — "bilib beraman" bo''lmaydigan umid beradi. Lekin suhbat rad javobi bilan tugamaydi: muhlat yo''li ochiladi. Muhlat necha oy bo''lishi shu xabarda AYTILMAYDI — u sabab ma''lum bo''lgandan keyin aytiladi.',
       COALESCE((SELECT MAX(r2.sort_order) FROM agent_rules r2
                  WHERE r2.section_id = s.id AND r2.deleted_at IS NULL), 0) + 1
  FROM agent_rule_sections s
 WHERE s.key = 'client_replies'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.situation LIKE '22. "Oylik to''lovim%');
