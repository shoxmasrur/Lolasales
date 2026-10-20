-- Suhbatdosh: Telegramda shartnoma egasining O'RNIGA yozayotgan odam (2026-09-16).
--
-- NEGA: murojaat shakli faqat shartnoma egasining ismidan tuzilardi
-- (`shared/gender.ts`). Xaitmuxamedova Dildora Karimovna bo'yicha
-- Telegramda o'g'li yozadi — u ikki marta "o'g'illariman", keyin
-- "Ismim Oybek" dedi. Shunga qaramay agent keyingi xabarni yana
-- "Assalomu alaykum, Dildora opa" deb boshladi va Oybekka "opam" deb
-- yozdi: promptda har safar "Iliq murojaat shakli: Dildora opa" turardi,
-- Oybek haqidagi gap esa faqat erkin matnli eslatmada edi. Qat'iy qator
-- erkin eslatmadan ustun chiqdi.
--
-- Endi agent suhbatdoshni tuzilgan maydonda qaytaradi va u shu yerda
-- saqlanadi. Ism majburiy emas: "o'g'li yozadi" ma'lum, ismi aytilmagan
-- holat prodda ko'proq uchradi. To'ldirilgan bo'lsa promptdagi murojaat
-- qatori shartnoma egasi bo'yicha EMAS, suhbatdosh bo'yicha tuziladi.
--
-- `client_profiles` da, `clients` da emas: bu CRM fakti emas, agent
-- suhbatdan bilib olgan narsa — profil tozalanganda u ham ketishi kerak.
--
-- Jins CHECK bilan cheklanadi: noto'g'ri qiymat "aka/opa" ni buzadi,
-- NULL esa "aniqlanmadi" degani (agent "aka/opa" ishlatmaydi).
ALTER TABLE client_profiles
  ADD COLUMN IF NOT EXISTS interlocutor_name     TEXT,
  ADD COLUMN IF NOT EXISTS interlocutor_gender   TEXT
    CHECK (interlocutor_gender IN ('male', 'female')),
  ADD COLUMN IF NOT EXISTS interlocutor_relation TEXT;

-- Prodda allaqachon aniqlangan suhbatdoshlar (2026-09-16 tahlili).
--
-- Ism, kimligi yoki agent javobida boshqa odam belgisi bor 80 ta suhbat
-- o'qib chiqildi. Bu yerda faqat Telegramda DOIM boshqa odam yozayotgani
-- mijozning O'Z xabarida ko'ringanlari bor ("Man o'g'illariman",
-- "Ман дилрабо опани эриман"). Ism faqat odam o'zi aytgan bo'lsa yozilgan,
-- Telegram nomidan olinmagan. Istisno — Raximova Guzal: yozayotgan
-- Telegram akkaunt (SuShod) Shodiyeva Surayyoniki, u o'z suhbatida
-- shartnoma egasi sifatida tanilgan va Guzalni "opam" deydi.
--
-- ATAYLAB KIRITILMAGAN (operator hal qiladi):
--   • egasining boshqa raqamini bergan: Ashurov Mamurjon, Umarova Nigora,
--     Buriyeva Dilafro'z — to'g'ri yo'l o'sha raqamga yozish;
--   • kimligi xabar matnida tasdiqlanmagan: Xodjimuratov Sirojiddin,
--     Redjapov Nozimjon, Xalbekova Zarina, Nurboboyeva Gulhayo;
--   • raqam begonaga o'tgan: Yo'ldoshev Shukurulla.
--
-- INSERT ... SELECT FROM clients: mijoz yo'q bazada (lokal, CI) hech narsa
-- yozilmaydi. Allaqachon to'ldirilgan suhbatdosh (agent yozgan) ustidan
-- yozilmaydi — qayta ishga tushirilsa ham natija o'zgarmaydi.
INSERT INTO client_profiles (client_id, interlocutor_name, interlocutor_gender, interlocutor_relation, updated_at)
SELECT c.id, v.name, v.gender, v.relation, now()
  FROM (VALUES
    -- Ismi o'zi aytgan
    ('df2ad8ab-3ad6-4523-82d4-c0d8fd0d7153'::uuid, 'Oybek',    'male',   'o''g''li'),   -- Xaitmuxamedova Dildora: "Ismim Oybek"
    ('994268a8-cc35-4903-b5d6-68c3484c3aa1'::uuid, 'Ойбек',    'male',   'eri'),        -- Kodirkulova Ruxsora: "Ман хўжайнилари бўламан", "Ойбек исмим"
    ('97ef5105-e6b3-4541-912a-c27a7d9d9a4d'::uuid, 'Юрий',     'male',   'eri'),        -- Urayeva Yevgeniya: "Ман Евгения опа эмас. Ман Юрий. Эрим"
    ('e8a7739a-c41b-4637-a68b-afd3b8738322'::uuid, 'Dilshod',  'male',   'eri'),        -- Kamolova Sabina: "Mani ismim Dilshod, Sabina opangizning turmush o'rtog'iman"
    ('e507cc5a-216e-4384-9c07-2f58b49122c8'::uuid, 'Мехригиё', 'female', 'ayoli'),      -- Umarov Lazizjon: "Мехригиё исмим аёллариман"
    ('4fd96377-4cc4-4b0b-af15-ed07554ad593'::uuid, 'Аликул',   'male',   'otasi'),      -- Xoliqova Kamola: "дадаси буламан ... исмим Аликул"
    ('9e4529f1-23f7-47f3-9c1b-3d20ee38cb41'::uuid, 'Алишер',   'male',   'o''g''li'),   -- Roximova Bekposhsha: "Ман ўғиллари бўламан исмим Алишер"
    ('512820e6-f279-4ba5-af20-66176060941c'::uuid, 'Surayyo',  'female', 'singlisi'),   -- Raximova Guzal: "Хар ой опамни оплата" (akkaunt Shodiyeva Surayyoniki)
    -- Ismi aytilmagan, kimligi aniq
    ('7a7dc1c4-5211-476c-8c7e-5842f1e00218'::uuid, NULL, 'male',   'o''g''li'),         -- Abdullayev Muqumjon: "Men o'gillari bo'laman"
    ('71434fa6-dcaf-43f4-9f3c-121a482affd0'::uuid, NULL, 'male',   'o''g''li'),         -- Eshmuratov Kutlimurot: "Man Og'li bolaman"
    ('0d22e2ff-9372-46b2-ac8b-f3cf9ef979be'::uuid, NULL, 'male',   'o''g''li'),         -- Kadirova Gulnoza: "Ман Гулноза опани угиллариман"
    ('9253ebc7-083f-4624-a05d-7139c92fbc7b'::uuid, NULL, 'male',   'o''g''li'),         -- Xomidova Gavxar: "Man ogillariman"
    ('0d88c2cc-1591-44c0-aa3a-cc907fd8d7ca'::uuid, NULL, 'male',   'eri'),              -- Ismoilova Shaxinabonu: "Мен ериман"
    ('3ade0dd1-f4d4-41c3-88df-977f344d89e1'::uuid, NULL, 'male',   'eri'),              -- Subxonova Parvina: "Мен Парвинани турмуш уртоги ман"
    ('3ab57beb-4f73-468b-a828-4faf316e7003'::uuid, NULL, 'male',   'eri'),              -- Xusanova Dilrabo: "Ман дилрабо опани эриман"
    ('1b220600-3ebd-4d51-b69a-2faae6bf2284'::uuid, NULL, 'female', 'ayoli'),            -- Doshimbetov Baxadir: "я супруга Бахадыра"
    ('10a2e7e0-534a-4dbb-ac34-3ef2827f7f88'::uuid, NULL, NULL,     'jiyani')            -- Raximova Gyulnoza: "Ман Гулноза опа масман", "Ман жияниман"
  ) AS v(client_id, name, gender, relation)
  JOIN clients c ON c.id = v.client_id
ON CONFLICT (client_id) DO UPDATE SET
  interlocutor_name     = EXCLUDED.interlocutor_name,
  interlocutor_gender   = EXCLUDED.interlocutor_gender,
  interlocutor_relation = EXCLUDED.interlocutor_relation,
  updated_at            = now()
WHERE client_profiles.interlocutor_name IS NULL
  AND client_profiles.interlocutor_relation IS NULL;
