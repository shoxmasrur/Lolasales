-- Qo'shimcha kelishuv: obyekt menejerlarining raqamlari (2026-10-07, rahbariyat).
--
-- Bank rekvizitlari o'zgargach (118) investorlar shartnomaga qo'shimcha
-- kelishuvni so'rayapti: olib ketgani kelish yoki onlayn olish. Buning
-- uchun obyekt menejeriga bog'lanish kerak. Agentda bu raqamlar yo'q edi —
-- "alohida e'lon qilinadi" deb javob berardi (118 dagi jumla).
--
-- Raqam FAQAT mijozning o'z obyekti bo'yicha beriladi; ro'yxatda yo'q
-- obyekt (Orzular, Fazo, Okean) uchun agent raqam to'qimaydi, eskalatsiya qiladi.
--
-- Qayta ishga tushirilsa takrorlanmaydi. Qo'riqchi `deleted_at` ga
-- qaramaydi — operator o'chirgan qoida tirilmaydi.

INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id,
       'QO''SHIMCHA KELISHUV (yangi bank rekvizitlari bo''yicha shartnomaga qo''shimcha). Investor qo''shimcha kelishuvni OLIB KETGANI kelmoqchi bo''lsa yoki uni ONLAYN olmoqchi bo''lsa — o''z obyektining menejeriga qo''ng''iroq qilishi yoki yozishi kerak. Kontekstdagi "Obyekt" maydoniga qarab FAQAT o''sha obyektning raqamini ber: Muhabbat Shahri — +998 77 003 14 00; Zo''rsan — +998 90 062 14 00; Vatan — +998 90 003 14 00; Vodiy va Ramazon — +998 77 121 14 00; Afsona — +998 77 122 14 00. Raqamni XUDDI SHU KO''RINISHDA ko''chir, bitta raqamini ham o''zgartirma. Qo''shimcha kelishuvni o''zing yubormaysan, tayyor bo''lish muddatini va''da qilmaysan — bularni menejer aytadi. Bu savol uchun ESKALATSIYA QILMA. Obyekt shu ro''yxatda bo''lmasa yoki kontekstda ko''rsatilmagan bo''lsa — raqam berma, "menejerimiz siz bilan bog''lanadi" de va ESKALATSIYA qil. Mijozda bir nechta obyekt bo''lsa — har biriniki alohida.',
       -1
  FROM agent_rule_sections s
 WHERE s.key = 'investor_procedures'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.body LIKE 'QO''SHIMCHA KELISHUV%');

-- 118 dagi "alohida e'lon qilinadi" endi eskirdi — yangi qoidaga ishora.
-- Operator matnni tahrirlagan bo'lsa LIKE mos kelmaydi va jim o'tadi.
UPDATE agent_rules r
   SET body = replace(r.body, 'Shartnoma hujjatidagi eski rekvizit haqida so''rasa: to''lov yangi rekvizit bilan qilinadi, shartnoma hujjati bo''yicha alohida e''lon qilinadi.', 'Shartnoma hujjatidagi eski rekvizit haqida so''rasa: to''lov yangi rekvizit bilan qilinadi, shartnomaga qo''shimcha kelishuv beriladi — "QO''SHIMCHA KELISHUV" qoidasiga qara.'),
       updated_at = now()
  FROM agent_rule_sections s
 WHERE s.id = r.section_id
   AND s.key = 'payment_channels'
   AND r.deleted_at IS NULL
   AND r.body LIKE 'YANGI BANK REKVIZITLARI%'
   AND r.body LIKE '%alohida e''lon qilinadi%';
