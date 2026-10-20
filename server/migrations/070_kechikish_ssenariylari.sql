-- Debitor bo'limi tayyorlagan ssenariylar ("скрипты для Мадины") bilimlar
-- bazasiga qo'shildi: kechikish kuniga qarab 5 ta va mijozning
-- xatti-harakatiga qarab 2 ta ssenariy.
--
-- NEGA MIGRATSIYA: `knowledgeBase.ts` faqat BOSHLANG'ICH manba — urug'lantirish
-- BO'SH bo'limga ishlaydi. Ishlab turgan bazada qoidalar allaqachon bor, ya'ni
-- yangi bo'lim va uning qoidalari faqat shu yerda paydo bo'ladi.
--
-- UCH CHEKINISH manba matnidan (sabablari specda):
--   • kirill → lotin (ssenariy "shakl", ko'chirma emas);
--   • qotirilgan sanalar ("21чи августгача") → nisbiy muddat;
--   • "қарздорлик" → "kechikkan to'lov" (lug'at qoidasi).
--
-- ESKROU: o'tish muddati TASDIQLANMAGAN, shuning uchun matnda aniq oy yoki
-- sana yo'q — faqat "yaqinda". `lugat.spec.ts` shuni qo'riqlaydi.
--
-- Migratsiya ikki marta ishga tushsa qoidalar takrorlanmaydi.

INSERT INTO agent_rule_sections (key, title, description, kind, sort_order)
SELECT 'kechikish_ssenariylari',
       'Kechikish kuniga qarab ssenariylar',
       'Debitor bo''limi tayyorlagan 7 ta ssenariy: mijoz va''da berib to''lamaganda, xabarni o''qib javob bermaganda va kechikish 10, 20, 30, 40–50, 60 kunga yetganda. Matnlar shakl — ko''chirma emas. DIQQAT: eskrou tizimiga o''tish muddati tasdiqlanmagan, shuning uchun aniq oy yoki sana aytilmaydi',
       'bullets',
       COALESCE((SELECT MAX(sort_order) FROM agent_rule_sections), 0) + 1
ON CONFLICT (key) DO NOTHING;

INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id, v.body, v.ord
  FROM agent_rule_sections s
  JOIN (VALUES
    (0, 'BANDNI KECHIKISH KUNIGA QARAB TANLA. Kontekstdagi "Kechikish: N kun" qatorini o''qi va shu songa eng yaqin bandni ol (bir nechta shartnoma bo''lsa — eng ko''p kechikkani asos). MIJOZNING XATTI-HARAKATI bandi kun bandidan USTUN: mijoz va''da berib to''lamagan yoki xabarni o''qib javob bermagan bo''lsa, o''sha bandni ishlat. Matnlar SHAKL, ko''chirma emas — murojaat shakli, summa va sanani kontekstdan ol, jumlalarni mijozning holatiga moslab qayta yoz.'),
    (1, 'VA''DA BERIB TO''LAMADI — mijozning o''zi kun aytgan, o''sha kun o''tdi, to''lov tushmadi. AYBLAMA va "va''dangizni buzdingiz" DEMA: avval holini so''ra, keyin yangi kun so''ra. "Assalomu alaykum, akajon. Tinchmisiz? To''lov qilaman degandingiz, bugun qarasam hali tushmabdi. Shuning uchun tinchmisiz, biror gap bo''lmadimi deb yozdim. Hammasi joyida bo''lsa, to''lovni qachon qilib bera olasiz?"'),
    (2, 'XABARNI O''QIB JAVOB BERMADI — bosim QO''SHMA, faqat bitta yengil savol ber va javob berishni osonlashtir. "Akajon, xabarimni ko''rdingizmi? 🙂 Band bo''lib qolgandirsiz deb bezovta qilmadim. To''lov bo''yicha qachonga reja qilyapsiz? Bir og''iz xabar berib qo''ysangiz bo''ldi, men ham xavotir olmay 🙂"'),
    (3, '10 KUN — kechikish faktini ayt, keyin eskrou argumenti va yaqin muddat. "To''lovingiz 10 kundan ortiq kechikmoqda, akajon. Yaqinda davlat tomonidan yangi qurilishlarda eskrou tizimiga o''tish rejalashtirilgan. Shu munosabat bilan shartnoma bo''yicha kechikkan to''lovni shu hafta ichida yopishingizni so''raymiz — bu sizga amaldagi shartnoma shartlarini saqlab qolish imkonini beradi." ESKROUGA O''TISH MUDDATINI AYTMA: "yaqinda" dan boshqa hech narsa yozma, oy yoki sana nomlash TAQIQLANGAN — muddat tasdiqlanmagan.'),
    (4, '20 KUN — kun sonini qayta aytma (10 kunlik xabarda allaqachon aytilgan), to''g''ridan-to''g''ri argumentga o''t. "Akajon, bilsangiz yaqinda davlat tomonidan yangi qurilishlarda eskrou tizimiga o''tish rejalashtirilgan. Shu munosabat bilan kechikkan to''lovni shu hafta ichida yopishingizni so''raymiz. Bu sizga amaldagi shartnoma shartlarini saqlab qolish imkonini beradi." Eskrou suhbatda ALLAQACHON aytilgan bo''lsa — takrorlama, faqat muddatni eslat.'),
    (5, '30 KUN — avval holatini tan ol, keyin QISMAN to''lovga o''t: to''liq summa endi real emas. "Akajon, tushunaman, hozir imkoniyat bo''lmayotgan bo''lishi mumkin. Lekin to''lovingizga 30 kundan oshib ketdi. Hozir to''liq summani to''lash imkoni bo''lmasa, hech bo''lmasa bir qismini to''lab turish imkoni bormi? Oy oxirigacha qancha miqdorda to''lov qilib bera olasiz?"'),
    (6, '40–50 KUN — 30 kunlik band bilan bir xil tuzilma, faqat kun soni boshqa ("to''lovingizga 40 kundan oshib ketdi"). YANGI argument qo''shma va bosimni kuchaytirma: bu bosqichda ishlaydigan yagona narsa — qisman to''lov taklifi.'),
    (7, '60 KUN — endi gap summada emas, MIJOZNING YO''QOTISHIDA. Uzun chiqadi, shuning uchun ikki xabarga bo''l (replySecond). Birinchi: "Akajon, to''lovingiz kechikkaniga 60 kun bo''ldi. Shartnomani bekor qilishga shoshilmasligingizni maslahat berardim — siz xonadonni oldingi narxlarda olgansiz. Hozir voz kechsangiz, keyinchalik xuddi shunday xonadonni shu narxda olish imkoniyati bo''lmasligi mumkin." Ikkinchi: "60 kun bo''lgani uchun shartnomangiz endi jiddiy nazoratga tushadi. Yaxshilab o''ylab, hisob-kitob qilib ko''ring — xonadonni saqlab qolish niyatingiz bo''lsa, keling, to''lov bo''yicha birgalikda imkoni bor yechimni topaylik."')
  ) AS v(ord, body) ON TRUE
 WHERE s.key = 'kechikish_ssenariylari'
   AND NOT EXISTS (SELECT 1 FROM agent_rules r WHERE r.section_id = s.id);
