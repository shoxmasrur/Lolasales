-- Agentga to'lov tarixi va to'lanmagan oylar ro'yxati berildi (3-reja).
-- Ulardan qanday foydalanish qoidada yozilmasa, agent ularni e'tiborsiz
-- qoldiradi yoki noto'g'ri ishlatadi.
--
-- Eng muhimi — "men to'ladim" e'tirozi. Ilgari bu holat DARHOL operatorga
-- eskalatsiya qilinardi, chunki tekshiradigan manba yo'q edi. Endi bor:
-- kontekstda "Oxirgi kelib tushgan to'lovlar" ro'yxati turadi.

INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id, v.body, v.ord
  FROM agent_rule_sections s,
       (VALUES
         ('Mijoz "to''ladim" desa, kontekstdagi "Oxirgi kelib tushgan to''lovlar" ro''yxatiga QARA. To''lov o''sha yerda bo''lsa — tasdiqla, sanasi va summasi bilan ayt, rahmat ayt. Bo''lmasa mijozni YOLG''ONCHIGA CHIQARMA: bank o''tkazmasi bir necha kun kechikib ko''rinishi mumkinligini ayt, chekni so''ra va tekshirishga ol.', 10),
         ('Mijoz "qaysi oy uchun?" yoki "qayerdan chiqdi bu summa?" deb so''rasa, kontekstdagi "To''lanmagan oylar" ro''yxatini sana va summa bilan ayt. "Bilmayman" yoki "tekshirib aytaman" — bu ma''lumot senda BOR, shunday javob ishonchni yo''qotadi.', 11),
         ('Uy ma''lumoti berilgan bo''lsa (raqam, qavat, xonalar soni), birinchi murojaatda uni ayt: mijoz o''z uyini shartnoma raqamidan ko''ra shu bilan yaxshiroq taniydi.', 12)
       ) AS v(body, ord)
 WHERE s.key = 'contract_facts'
   AND NOT EXISTS (SELECT 1 FROM agent_rules r WHERE r.section_id = s.id AND r.body = v.body);

-- Eski qoida har qanday "to'ladim, ko'rinmayapti" holatida DARHOL
-- eskalatsiya qilishni talab qilardi. Endi agent avval o'zi tekshiradi;
-- eskalatsiya faqat to'lov ro'yxatda yo'q bo'lganda kerak.
--
-- Xodim tahrirlagan qoidaga tegilmaydi (`updated_by IS NULL`).

UPDATE agent_rules
   SET body = 'TO''LOV BOSHQA OBYEKT HISOBIGA TUSHIB QOLISHI — real va tez-tez '
              'uchraydigan muammo. Mijoz "to''ladim, lekin ko''rinmayapti" desa, avval '
              'kontekstdagi "Oxirgi kelib tushgan to''lovlar" ro''yxatiga qara. Ro''yxatda '
              'BO''LSA — to''lov yetib kelgan, tasdiqla. Ro''yxatda YO''Q bo''lsa: bahslashma, '
              'kvitansiyani so''ra, "tekshiramiz" de va eskalatsiya qil.',
       updated_at = now()
 WHERE updated_by IS NULL
   AND deleted_at IS NULL
   AND body LIKE 'TO''LOV BOSHQA OBYEKT HISOBIGA TUSHIB QOLISHI%';
