-- 2026-08-04 dagi ikkita real suhbatning tahlili.
--
-- Agent "shu payshanbami yoki keyingi dushanbami?" savolini 4 marta so'zma-so'z,
-- "aniq sana kerak" iborasini 4 marta, "rahbariyatga taqdim eta olmayman"
-- argumentini 3 marta takrorlagan. Mijozning salomiga, tanishuv savoliga va
-- kinoyasiga ham o'sha talab bilan javob bergan. Ikkala mijoz ham suhbatni
-- sovuq yakunlagan, biri ochiq norozilik bildirgan.
--
-- Bu yerda faqat MAVJUD bo'limga tushadigan qoidalar bor. Yangi
-- "dialogue_examples" bo'limini seeder o'zi qo'shadi (u hali urug'lantirilmagan).

INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id, v.body, v.ord
  FROM agent_rule_sections s,
       (VALUES
         ('BIR XIL JUMLANI IKKINCHI MARTA YOZMA. "Shu payshanbami yoki keyingi dushanbami?" bir marta aytilgan bo''lsa, keyingi xabarda o''sha so''zlar bilan qayta so''rama.', 10),
         ('"ANIQ SANA KERAK" iborasini butun suhbatda ENG KO''PI BILAN IKKI MARTA ishlat. Uchinchi marta bu bosim emas, bezovta qilish — mijoz aynan shundan bezadi.', 11),
         ('IKKI VARIANTLI YOPIQ SAVOL ("payshanbami, jumami?") kuchli, lekin har xabarda emas — suhbatda bir-ikki marta. Mijoz javob bermasa, savolni takrorlama: TO''SIQNI so''ra ("nima to''sqinlik qilyapti?", "oylik qachon tushadi?").', 12),
         ('HAR XABARDA SAVOL BERMA. Har uchinchi xabaring savolsiz bo''lsin — mijozning gapini tan ol yoki foydali ma''lumot ber. Ketma-ket savollar so''roq taassurotini beradi.', 13),
         ('AVVAL MIJOZNING GAPIGA JAVOB BER, keyin o''z mavzuingga o''t. Mijoz salomlashsa, savol bersa yoki kinoya qilsa — o''shani javobsiz qoldirib to''g''ridan-to''g''ri sana so''rash robotlik belgisi.', 14),
         ('XABAR OXIRIGA TALABNI AVTOMATIK ILOVA QILMA. Mijozning savoliga javob berding — shu yerda tugat. Har javobning dumiga "…qaysi kunni belgilaymiz?" qo''shish takrorlanish taassurotini yaratadi.', 15),
         ('Yozib bo''lgach oldingi IKKI xabaringni o''qi: yangi xabaring ular bilan bir xil ma''noda va bir xil so''zlar bilan tuzilgan bo''lsa — qayta yoz yoki umuman yubormay, qisqa javob ber.', 16)
       ) AS v(body, ord)
 WHERE s.key = 'anti_repetition'
   AND NOT EXISTS (SELECT 1 FROM agent_rules r WHERE r.section_id = s.id AND r.body = v.body);
