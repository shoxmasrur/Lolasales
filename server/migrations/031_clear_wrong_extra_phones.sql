-- Import xatosi natijasida yozilgan soxta "qo'shimcha raqamlar"ni tozalash.
--
-- SABAB: "debitor_prod_test.xlsx" faylida "Телефон" nomli IKKITA ustun bor:
--   • 4-ustun  — mijozning haqiqiy raqami;
--   • 32-ustun — fayl oxirida, ogohlantirish (предупреждение) bloki ortida.
--
-- Parser bir xil nomli hamma ustunni olib, 32-ustundagi raqamni mijozning
-- "qo'shimcha raqami" qilib yozib qo'ygan edi. Bu raqam mijozga tegishli
-- emas: masalan bitta mijozda u +998771301200 bo'lib chiqdi — bu bizning
-- o'z Telegram akkauntimizning raqami. Ya'ni 32-ustun ogohlantirish
-- yuborilgan KOMPANIYA raqami.
--
-- Oqibati og'ir bo'lardi: `ClientTelegramResolver` mijozning barcha
-- raqamlarini navbat bilan sinaydi va birinchi topilganini oladi — ya'ni
-- begona (yoki o'z) raqamga qarz haqida xabar ketishi mumkin edi.
--
-- Parser tuzatildi (`findPhoneColumns` endi takroriy sarlavhani tashlab
-- yuboradi), bu yerda esa allaqachon yozilgan ma'lumot tozalanadi.
--
-- Faqat `extra_phones` bo'shatiladi — asosiy `phone` to'g'ri ustundan
-- olingani uchun tegilmaydi.

UPDATE clients
   SET extra_phones = '{}'
 WHERE cardinality(extra_phones) > 0;
