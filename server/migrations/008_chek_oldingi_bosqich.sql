-- Yakuniy sharh tuzatishlari.
--
-- 1) "Chek emas": menejer chek tekshiruvini yopganda xarid bosqichi chek
--    kelishidan OLDINGI holatiga qaytadi. Oldingi bosqich tekshiruv qatorida
--    saqlanadi (faqat chek bosqichni `chek_keldi` ga surgan bo'lsa).
ALTER TABLE payment_checks
    ADD COLUMN prev_stage text,
    ADD CONSTRAINT payment_checks_prev_stage_check
        CHECK (prev_stage IS NULL OR prev_stage IN
            ('yangi', 'suhbatda', 'qiziqdi', 'karta_yuborildi', 'chek_keldi', 'qisman_toladi', 'toladi', 'rad_etdi'));

-- 2) Bo'lib to'lash shartlari: birinchi qism narxdan oshmaydi; bo'lib
--    to'lash yoqilgan kursda kamida 2 qism (`bolibTolashXatosi` bilan bir xil).
ALTER TABLE courses
    ADD CONSTRAINT courses_installment_first_min_check
        CHECK (installment_first_min IS NULL OR installment_first_min <= price),
    ADD CONSTRAINT courses_installment_parts_check
        CHECK (NOT installment_allowed OR (installment_parts IS NOT NULL AND installment_parts >= 2));
