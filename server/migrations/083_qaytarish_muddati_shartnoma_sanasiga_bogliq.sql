-- Bekor qilishda pul qaytarish muddati shartnoma sanasiga bog'liq
-- (Xurshid aka, 2026-09-10).
--
-- NIMA XATO EDI: bilimlar bazasida muddat QAT'IY 180 bank ish kuni deb
-- yozilgan edi, ustiga "90 kun EMAS" deb alohida ta'kidlangan ham. Bu
-- 2025-yil 1-oktabrdan OLDIN tuzilgan shartnomalar uchun noto'g'ri —
-- ularda 90 bank ish kuni. Agent bunday mijozga ikki barobar uzun
-- muddat aytib kelgan.
--
-- CHEGARA: 2025-10-01. Shu sanadan OLDIN tuzilgan shartnoma — 90 bank
-- ish kuni; shu sana va undan KEYIN — 180. Har ikkisida ham jarima yo'q.
--
-- SANA NOMA'LUM BO'LSA: agent muddatni umuman aytmaydi va menejerga
-- yo'naltiradi. Kontekstdagi "Shartnoma sanasi" qatori NULL bo'lishi
-- mumkin (`systemPrompt.ts`), va taxminiy raqam aytish eng yomon variant:
-- mijoz eshitgan sonni eslab qoladi va keyin bahs chiqadi.
--
-- NEGA UPDATE, INSERT EMAS: bu yangi qoida emas, MAVJUD qoidaning
-- tuzatilishi. Eski matn joyida qolsa, agent promptda bir-biriga zid
-- ikkita fakt ko'rardi va qaysi birini tanlashi tasodifga qolardi.
--
-- 077 BILAN BIR PARTIYADA: 077-migratsiya hali prodga qo'llanmagan va u
-- taktikaga eski "180 bank ish kunida qaytadi" matnini KIRITADI. Nom
-- bo'yicha tartibda 083 undan keyin ishlaydi, ya'ni o'sha qator kiritilib,
-- shu yerda darhol tuzatiladi. 077 ning o'zi tahrirlanmadi — u main'ga
-- push qilingan va boshqa muhitda allaqachon qo'llangan bo'lishi mumkin.
--
-- Taktika va misollarda `replace()` ishlatiladi — operator o'sha
-- qatorning boshqa joyini tahrirlagan bo'lsa, tahriri saqlanadi.
-- Har bir amalda takrorlanishdan qo'riqlovchi shart bor.

-- ─── 1. Asosiy fakt: qat'iy 180 → sanaga bog'liq ─────────────────────────
UPDATE agent_rules r
   SET body = 'Shartnoma bekor qilinganda to''langan pul qaytariladi, LEKIN MUDDAT SHARTNOMA SANASIGA BOG''LIQ — u hamma shartnomada bir xil EMAS. Kontekstdagi "Shartnoma sanasi" qatoriga qara: 2025-yil 1-oktabrdan OLDIN tuzilgan shartnomada 90 BANK ISH KUNI, 1-oktabr yoki undan KEYIN tuzilganida 180 BANK ISH KUNI. Muddat bekor qilish kelishuvi imzolangan kundan boshlanadi (3.7 va 4.5-bandlar). Har ikki holatda ham jarima qo''llanilmaydi.'
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'contract_facts'
   AND r.deleted_at IS NULL
   AND r.body LIKE 'Shartnoma bekor qilinganda to''langan pul 180 BANK%';

-- ─── 2. Sana noma'lum bo'lgan holat uchun yangi band ─────────────────────
INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id,
       'Kontekstda "Shartnoma sanasi" ko''rsatilmagan bo''lsa — qaytarish muddatini UMUMAN AYTMA. "Muddatni tartibi bo''yicha menejerimiz aniq aytadi" deb yo''naltir va eskalatsiya qil. Taxminiy raqam aytish keyin mijoz bilan bahsga aylanadi: u eshitgan sonni eslab qoladi.',
       COALESCE((SELECT MAX(r2.sort_order) FROM agent_rules r2
                  WHERE r2.section_id = s.id AND r2.deleted_at IS NULL), 0) + 1
  FROM agent_rule_sections s
 WHERE s.key = 'contract_facts'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.deleted_at IS NULL
            AND r.body LIKE 'Kontekstda "Shartnoma sanasi" ko''rsatilmagan%');

-- ─── 3. Taktikalardagi ikkita qat'iy raqam ───────────────────────────────
UPDATE agent_rules r
   SET body = replace(r.body,
                      '180 bank ish kunida qaytadi',
                      'shartnoma sanasiga qarab 90 yoki 180 bank ish kunida qaytadi')
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'tactics'
   AND r.deleted_at IS NULL
   AND r.body LIKE '%180 bank ish kunida qaytadi%'
   AND r.body NOT LIKE '%shartnoma sanasiga qarab%';

-- ─── 4. E'tirozlar misoli: 180 → 90, va sababga qoida qo'shiladi ─────────
UPDATE agent_rules r
   SET good_example = replace(r.good_example,
                              '180 bank ish kunida qaytariladi, xonadon',
                              '90 bank ish kunida qaytariladi, xonadon'),
       why = r.why || ' ' || 'RAQAM SHARTNOMA SANASIDAN olinadi: 2025-yil 1-oktabrdan oldin tuzilgan shartnomada 90, keyin tuzilganida 180 bank ish kuni — misoldagi sonni ko''chirma.'
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'objections'
   AND r.deleted_at IS NULL
   AND r.good_example LIKE '%180 bank ish kunida qaytariladi, xonadon%'
   AND (r.why IS NULL OR r.why NOT LIKE '%RAQAM SHARTNOMA SANASIDAN%');

-- ─── 5. Qo'pol javoblar misoli: raqam qoladi, sabab qoidani aytadi ───────
UPDATE agent_rules r
   SET why = r.why || ' ' || 'RAQAM SHARTNOMA SANASIDAN olinadi: 2025-yil 1-oktabrdan oldin tuzilgan shartnomada 90, keyin tuzilganida 180 bank ish kuni — misoldagi sonni ko''chirma.'
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'hostile_replies'
   AND r.deleted_at IS NULL
   AND r.good_example LIKE '%180 bank ish kunida qaytariladi%'
   AND (r.why IS NULL OR r.why NOT LIKE '%RAQAM SHARTNOMA SANASIDAN%');
