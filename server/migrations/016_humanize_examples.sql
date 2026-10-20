-- Xurshid akaning e'tirozi (2026-08-04): agent juda rasmiy yozadi, robot
-- yozayotgandek tuyuladi. Yangi "human_tone" bo'limi buni tuzatadi, lekin
-- oldin qo'shilgan misollardagi YAXSHI variantlarning o'zi ham idora tilida
-- yozilgan edi — ular yangi qoidaga zid turmasligi uchun jonlashtiriladi.
--
-- Faqat good_example (mijozga ketadigan namuna matn) o'zgaradi; situation,
-- bad_example va why o'z holicha qoladi.

-- 1) "siz bilan bog'lanadi" — majhul, idoraviy. "O'zi bog'lanadi" tabiiyroq.
UPDATE agent_rules
   SET good_example = replace(good_example, 'ular siz bilan bog''lanadi', 'o''zlari bog''lanadi')
 WHERE good_example LIKE '%ular siz bilan bog''lanadi%';

UPDATE agent_rules
   SET good_example = replace(good_example, 'hamkasbim siz bilan bog''lanadi', 'hamkasbim o''zi bog''lanadi')
 WHERE good_example LIKE '%hamkasbim siz bilan bog''lanadi%';

UPDATE agent_rules
   SET good_example = replace(good_example, 'siz bilan bog''lanishadi', 'o''zlari gaplashadi')
 WHERE good_example LIKE '%siz bilan bog''lanishadi%';

UPDATE agent_rules
   SET good_example = replace(good_example, 'rahbarim siz bilan bog''lanadi', 'rahbarim o''zi gaplashadi')
 WHERE good_example LIKE '%rahbarim siz bilan bog''lanadi%';

-- 2) Telefon so'rovi: "telefon orqali bog'lanadi" → odamcha
UPDATE agent_rules
   SET good_example = replace(
         good_example,
         'Debitorlik bo''limidagi hamkasbim siz bilan telefon orqali bog''lanadi.',
         'Debitorlik bo''limidan hamkasbim o''zi qo''ng''iroq qiladi.')
 WHERE good_example LIKE '%telefon orqali bog''lanadi%';

-- 3) "Murojaatingizni … yetkazaman" — idora tili
UPDATE agent_rules
   SET good_example = 'Sizni tushundim. Bunisini rahbariyatga aytaman — o''zlari siz bilan gaplashadi.'
 WHERE good_example LIKE 'Sizni tushundim. Murojaatingizni rahbariyatga yetkazaman%';

-- 4) "Noroziligingizni qayd qildim va tegishli bo'limga o'tkazaman"
UPDATE agent_rules
   SET good_example = 'Shikoyatingizni yozib oldim, tegishli bo''limga o''tkazaman — o''zlari gaplashadi.'
 WHERE good_example LIKE 'Noroziligingizni qayd qildim%';

-- 5) "qayd qildim" → "yozib qo'ydim" (misollarda ko'p uchraydi)
UPDATE agent_rules
   SET good_example = replace(good_example, 'deb qayd qildim', 'deb yozib qo''ydim')
 WHERE good_example LIKE '%deb qayd qildim%';
