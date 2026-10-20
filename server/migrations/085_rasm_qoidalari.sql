-- Rasm turiga qarab xatti-harakat qoidalari.
--
-- NIMA XATO EDI: `media` bo'limidagi birinchi qoida "Bu ko'pincha
-- TO'LOV CHEKI bo'ladi" deb yozilgan edi va agent har rasmni chek deb
-- qabul qilardi. Endi turni tizim aytadi (`image_kind`), ya'ni bu
-- jumla nafaqat keraksiz, balki zararli: agent belgini o'qish o'rniga
-- taxmin qilishda davom etardi.
--
-- STIKER: eski qoida uni shovqin deb ko'rardi ("uzun javob yozma,
-- mavzuga qayt"). Aslida stiker ko'pincha salom yoki xursandchilik va
-- unga iliq javob berish kerak. Endi belgida emoji ham ko'rinadi.
--
-- NEGA BUTUN BO'LIM ALMASHTIRILADI: qoidalar bir-biriga bog'liq —
-- eskisi qolsa, agent promptda "taxmin qil" va "taxmin qilma" degan
-- ikkita zid ko'rsatmani birga ko'rardi.
--
-- ESKI QOIDALAR O'CHIRILMAYDI, `deleted_at` bilan belgilanadi. Repoda
-- soft-delete allaqachon bor (032-migratsiya) va prompt faqat
-- `deleted_at IS NULL` qatorlarni oladi. Ya'ni promptdagi ziddiyat
-- yopiladi, lekin operator o'sha bo'limda qilgan tahrirlar bazada
-- qolaveradi va kerak bo'lsa qo'lda tiklanadi.
--
-- Qayta ishga tushirilsa takrorlanmaydi.

UPDATE agent_rules r
   SET deleted_at = now()
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'media'
   AND r.deleted_at IS NULL
   AND r.body NOT LIKE 'RASM TURINI TIZIM AYTADI%'
   AND r.body NOT LIKE 'CHEK kelganda:%'
   AND r.body NOT LIKE 'HUJJAT kelganda:%'
   AND r.body NOT LIKE 'NIMALIGI ANIQLANMAGAN%'
   AND r.body NOT LIKE 'ODDIY RASM kelsa:%'
   AND r.body NOT LIKE 'STIKER kelsa%'
   AND r.body NOT LIKE 'Ovozli xabar avtomatik%';

INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id, v.body, v.ord
  FROM agent_rule_sections s,
       (VALUES
         ('RASM TURINI TIZIM AYTADI, o''zing taxmin qilma. Matndagi belgiga qara: "[mijoz to''lov cheki yubordi]" — bu chek; "[mijoz hujjat rasmini yubordi]" — shartnoma, pasport yoki ariza; "[mijoz rasm yubordi]" — oddiy rasm; "[mijoz rasm yubordi — nimaligi aniqlanmadi]" — nima ekani aniqlanmadi.', 0),
         ('CHEK kelganda: chek uchun rahmat ayt va tekshirayotganingni bildir. O''ZING TASDIQLAMA — "to''lovingiz tushdi" dema, summani "tushdi" deb hisoblama.', 1),
         ('HUJJAT kelganda: qisqa tan ol ("hujjatni oldik") va ESKALATSIYA qil. Hujjat bo''yicha o''zing qaror berma, shart aytma va va''da qilma — buni hamkasbing hal qiladi.', 2),
         ('NIMALIGI ANIQLANMAGAN rasm kelsa: taxmin qilma va "chek uchun rahmat" dema. Bir og''iz so''ra: "rasmni oldim, bu to''lov cheki bo''ldimi yoki boshqa narsami?". Javobni kutib, keyin harakat qil.', 3),
         ('ODDIY RASM kelsa: qisqa e''tibor ber va to''lov mavzusiga qayt. Uzun javob yozma.', 4),
         ('STIKER kelsa — bu ko''pincha salom yoki xursandchilik. Belgida emoji ko''rsatilgan bo''lishi mumkin ("[stiker: 👋]"). ILIQ va QISQA javob ber, odam kabi. Uni e''tiborsiz qoldirma va darhol to''lov talab qilishga o''tib ketma — bir jumla iliqlik suhbatni yaxshilaydi.', 5),
         ('Ovozli xabar avtomatik matnga o''girilgan bo''lishi mumkin — matn g''alati yoki tushunarsiz bo''lsa, "ovozingiz to''liq tushunarli bo''lmadi, qisqa yozib yuboring" deb so''ra.', 6)
       ) AS v(body, ord)
 WHERE s.key = 'media'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.deleted_at IS NULL
            AND r.body LIKE 'RASM TURINI TIZIM AYTADI%');
