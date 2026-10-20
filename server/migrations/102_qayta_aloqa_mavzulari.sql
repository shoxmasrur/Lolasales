-- Qayta aloqa ro'yxati uchun tayyor mavzular (2026-09-16).
--
-- Operator "Qayta aloqa" ro'yxatidan mijozlarni tanlab, mavzu tanlaydi —
-- agent har biriga xabarni O'ZI tuzadi (`InstructAgentUseCase`). Mavzu
-- matni (`instruction`) mijozga KETMAYDI: u agentga topshiriq va chatga
-- `note` bo'lib yoziladi. Shuning uchun matn "agent nima qilsin" shaklida,
-- mijozga xat shaklida emas. Uzunlik chegarasi — `TOPSHIRIQ_MAX` (1000),
-- u kodda tekshiriladi: bazada CHECK qo'yilmaydi, aks holda chegara kodda
-- o'zgarsa ikki joyni birga ko'chirish kerak bo'lardi.
--
-- `deleted_at` — yumshoq o'chirish. Eski ommaviy navbat natijalari va
-- audit yozuvlari mavzu id'siga ishora qiladi; qator yo'qolsa "qaysi
-- mavzu bilan yuborilgan edi?" degan savolga javob qolmaydi.
--
-- `created_by` — foydalanuvchi id'si, FK'siz: foydalanuvchi o'chirilsa
-- ham mavzu qolishi kerak, kim o'zgartirgani esa audit jurnalida.
--
-- Qayta ishga tushirilsa natija o'zgarmaydi. Boshlang'ich mavzular
-- sarlavha bo'yicha qo'riqlanadi va `deleted_at` ga qaramaydi — admin
-- o'chirgan mavzu tirilmaydi.

CREATE TABLE IF NOT EXISTS recontact_topics (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  instruction  TEXT NOT NULL,
  sort_order   INT NOT NULL DEFAULT 0,
  is_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);

DROP TRIGGER IF EXISTS trg_recontact_topics_touch ON recontact_topics;
CREATE TRIGGER trg_recontact_topics_touch BEFORE UPDATE ON recontact_topics
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

INSERT INTO recontact_topics (title, instruction, sort_order)
SELECT v.title, v.instruction, v.sort_order
  FROM (VALUES
    ('Kelishilgan kun o''tdi',
     'Mijoz kelishilgan kunda to''lamadi va shundan beri jim. Muloyim salomlash va to''lov holatini so''ra: to''lov qilindimi yoki biror narsa to''sqinlik qildimi. Ayblama, "va''da bergan edingiz" deb eslatib bosim qilma. Mijoz javob bersa — yaqin kunlardan biriga yangi aniq sana kelish.',
     10),
    ('Aniq to''lov kunini kelishish',
     'Mijoz avval "xop" yoki "keyingi hafta" kabi javob bergan, lekin aniq sana aytilmagan. Qisqa salomdan keyin to''lovni qaysi kuni amalga oshirishini yopiq savol bilan so''ra — masalan, yaqin ikki kunni nomlab, qaysi biri qulay ekanini. Uzun tushuntirish yozma.',
     20),
    ('Uzoq jimlikdan keyin eslatma',
     'Mijoz oldingi xabarlarni o''qigan, lekin javob bermagan. Bezovta qilmaydigan qisqa eslatma yoz: kechikkan to''lov haqida bir jumla va bitta savol. Oldingi xabarlar javobsiz qolganini ta''kidlama, bir nechta savolni birga berma.',
     30),
    ('Oylik qo''shilishidan oldin ogohlantirish',
     'Navbatdagi oylik to''lov kuni yaqinlashyapti. Xotirjam ohangda ayt: o''sha kungacha kechikkan to''lov yopilmasa, navbatdagi oylik to''lov ham qo''shilib, to''lanadigan summa kattalashadi — shuning uchun shu kungacha to''lash qulayroq. Bu ogohlantirish, tahdid emas. Yangi jami summani o''zing hisoblab aytma: faqat mijoz ma''lumoti blokida turgan raqamlarni ishlat.',
     40),
    ('Qisman to''lov taklifi',
     'Mijozga kechikkan to''lovni to''liq yopish qiyin bo''layotgan bo''lishi mumkin. Muloyim taklif qil: to''liq bo''lmasa ham, bir qismini yaqin kunlarda to''lab qo''ysa bo''ladi. Qaysi kuni va qancha to''lay olishini so''ra, qolgan qismi uchun keyin alohida kun kelishiladi.',
     50)
  ) AS v(title, instruction, sort_order)
 WHERE NOT EXISTS (SELECT 1 FROM recontact_topics t WHERE t.title = v.title);
