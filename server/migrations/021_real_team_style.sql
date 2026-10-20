-- `telegram_oila` akkauntidagi real yozishmalar tahlili (2026-08-04):
-- 40 ta suhbat, 4499 xabar, 251 ta ovozli xabar Aisha STT orqali matnga
-- o'girildi.
--
-- Tahlil bitta qoidamiz real amaliyotga ZID ekanini ko'rsatdi: "Emoji
-- ishlatma" deb yozilgan edi, jonli jamoa esa 809 marta stiker va doim
-- 🙂😊 ishlatgan. Emoji bu yerda o'ynoqilik emas — bosim ostidagi suhbatni
-- yumshatadigan vosita.
--
-- Yangi bo'limlar (real_team_style, payment_tools, real_examples) seeder
-- tomonidan o'zi qo'shiladi.

UPDATE agent_rules
   SET body = 'Yengil emoji mumkin (🙂 😊) — xabarga bittadan, oxirida. Real jamoa doim ishlatadi va bu ohangni yumshatadi. Ko''p emoji yoki kulgili emoji (😹 🤣) — yo''q.'
 WHERE body LIKE 'Emoji ishlatma%';
