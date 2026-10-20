-- Hisoblagichlar uchun to'lov (2026-10-09, 2370ORZ26KE).
--
-- CRM to'lov grafigida oylik to'lovlardan tashqari `for_electrocity`
-- turidagi qator bo'ladi — hisoblagichlar uchun bir martalik to'lov.
-- Shu paytgacha u notanish tur (`other`) bo'lib, kechikkan bo'lsa OYLIK
-- kechikishga qo'shilardi va agent uni oylik to'lov deb so'rardi.
--
-- Endi u alohida: `contract_payments.type = 'meter'`, kechikkan summasi
-- shu ustunda. `debt_first`/`debt_monthly`/`debt_total` ga KIRMAYDI —
-- tizim bo'ylab "kechikkan summa" boshlang'ich + oylik bo'lib qoladi.
--
-- Mavjud shartnomalar navbatdagi sinxronlashda o'zi to'g'rilanadi.
ALTER TABLE contracts ADD COLUMN debt_meter NUMERIC(20,2) NOT NULL DEFAULT 0;

-- Agent qoidasi. Qayta ishga tushirilsa takrorlanmaydi; qo'riqchi
-- `deleted_at` ga qaramaydi — operator o'chirgan qoida tirilmaydi.
INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id,
       'HISOBLAGICHLAR UCHUN TO''LOV. Kontekstda "HISOBLAGICHLAR UCHUN TO''LOVDAGI KECHIKISH" qatori bo''lsa — bu oylik to''lovdan ALOHIDA to''lov. Uni oylik yoki boshlang''ich to''lovga QO''SHIB aytma va jami kechikkan to''lov ichiga kiritma: avval oylik (yoki boshlang''ich) to''lovni ayt, keyin alohida "hisoblagichlar uchun to''lov" deb summasi bilan ayt. Summani kontekstdagidek ko''chir. Bu to''lov nima uchunligini, qanday hisoblanganini o''zingdan TUSHUNTIRMA — mijoz batafsil so''rasa "menejerimiz aniqlab, siz bilan bog''lanadi" de va ESKALATSIYA qil. Kontekstda bu qator bo''lmasa, hisoblagich to''lovi haqida o''zing gap ochma.',
       -1
  FROM agent_rule_sections s
 WHERE s.key = 'investor_procedures'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.body LIKE 'HISOBLAGICHLAR UCHUN TO''LOV.%');
