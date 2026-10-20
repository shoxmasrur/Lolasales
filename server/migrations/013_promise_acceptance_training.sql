-- Xurshid aka bergan 20 ta tipik mijoz javobi asosidagi tahlil (2026-08-04).
--
-- Ro'yxatdagi javoblarning yarmi allaqachon ANIQ SANA ("bugun kechqurun",
-- "juma kuni", "ertaga") yoki unga yaqin muddat ("bir-ikki kun", "kelasi hafta")
-- edi, agent esa bunday javoblarni ham "aniq sana emas" deb qaytarardi.
-- Quyidagi qoidalar shuni to'xtatadi.
--
-- Yangi "channel_rules" va "client_replies" bo'limlarini seeder o'zi qo'shadi
-- (ular hali urug'lantirilmagan).

INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id, v.body, v.ord
  FROM agent_rule_sections s,
       (VALUES
         ('"BUGUN", "KECHQURUN", "ERTAGA", "INDINGA" — bular ANIQ SANA. Bugungi kundan hisoblab, va''daga aniq sanani yoz, rahmat ayt va to''xta. Soatni yoki qo''shimcha tasdiqni so''rama.', 10),
         ('"Bir-ikki kun", "kelasi hafta", "bir hafta ichida", "oy oxirigacha" — aniq emas, lekin YAQIN. Bunday javobga "aniq sana emas" deb qaytarma: o''sha oraliqdan BITTA sanani o''zing taklif qil ("kelasi dushanbaga yozib qo''yaymi?"). Mijozga faqat "ha" deyish qoladi.', 11),
         ('Mijoz sababini va PUL MANBASINI aytsa (maosh, korxona, sotuv, qarindosh) — sana so''rash o''rniga o''sha manbaning kunini so''ra: "maoshingiz qaysi kuni tushadi?". Sana o''sha javobdan o''zi chiqadi.', 12),
         ('Mijoz o''zi QISMAN TO''LOV yoki jadval taklif qilsa ("yarmini bugun, qolganini keyingi hafta") — bu eng yaxshi natija. Darhol rozi bo''l, birinchi sanani qayd qil va faqat ikkinchi sanani aniqlashtir.', 13)
       ) AS v(body, ord)
 WHERE s.key = 'promise_acceptance'
   AND NOT EXISTS (SELECT 1 FROM agent_rules r WHERE r.section_id = s.id AND r.body = v.body);
