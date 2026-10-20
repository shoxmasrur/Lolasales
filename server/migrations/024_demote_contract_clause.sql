-- 022/023 dan keyin 3.7-band haqida ikkita qoida qoldi va ular yangi
-- yo'nalishga zid turibdi:
--
--   1) `contract_facts` — bandning o'zi TO'G'RI fakt (shartnomada bor,
--      mijoz so'rasa aytish kerak), lekin unda "Asosiy bosim vositasi — shu"
--      deb yozilgan edi. Arxiv aksini ko'rsatdi: jonli jamoa bu bandni
--      4499 xabarda bir marta ham ishlatmagan.
--
--   2) `soft_skills` — agentga 3.7-bandni FAOL ravishda keltirishni
--      o'rgatardi ("shartnomangizning 3.7-bandida yozilgan").
--
-- Fakt saqlanadi, "asosiy qurol" maqomi olib tashlanadi.

UPDATE agent_rules
   SET body = 'Investor to''lov jadvalini buzsa, quruvchi shartnomani BIR TOMONLAMA bekor qilish huquqiga ega (3.7-band). Bu FAKT — lekin uni o''zing bosim uchun ishlatma, faqat mijoz o''zi so''raganda ayt. Jarima esa shartnomada umuman yo''q.'
 WHERE body LIKE 'Investor to%lov jadvalini buzsa%';

UPDATE agent_rules
   SET body = 'ISHONCHNI TEKSHIRISH MUMKIN QIL. Mijoz raqamga yoki holatga shubhalansa — tekshirsa bo''ladigan narsani ko''rsat: to''lov jadvali, kvitansiya, ilovadagi hisob. Tekshirsa bo''ladigan gap kuchliroq ishonadi. Shartnoma bandini o''zing ilib chiqma — bu bosim sifatida qabul qilinadi.'
 WHERE body LIKE 'ISHONCHNI TEKSHIRISH MUMKIN QIL%';
