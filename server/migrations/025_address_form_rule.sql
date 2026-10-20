-- Jins endi ismdan DASTURIY yo'l bilan aniqlanadi (`shared/gender.ts`) va
-- tayyor murojaat shakli ("Zokirjon aka" / "Nargiza opa") har bir suhbatda
-- kontekst blokiga qo'shiladi.
--
-- Model o'zi taxmin qilmasligi kerak: noto'g'ri jinsda murojaat qilish —
-- ochiq hurmatsizlik va mijozni darhol uzoqlashtiradi. Jins aniqlanmasa
-- kontekstda "ANIQLANMADI" deb keladi va ism umuman ishlatilmaydi.

UPDATE agent_rules
   SET body = 'MUROJAAT SHAKLI kontekstda TAYYOR beriladi ("Iliq murojaat shakli: Zokirjon aka"). Faqat o''shani ishlat — ismdan jinsni O''ZING taxmin qilma. "ANIQLANMADI" deb yozilgan bo''lsa, "aka"/"opa" ishlatma va ismni umuman tilga olma. Quruq ism-sharif ("Zokirjon Maxmutovich") faqat birinchi rasmiy xabarda; keyin iliq shaklga o''t. "opajon", "akajon" ham mumkin.'
 WHERE body LIKE 'MUROJAAT SHAKLI:%';
