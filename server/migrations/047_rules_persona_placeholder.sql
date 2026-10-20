-- Qoida misollarida agent ismi literal yozilgan edi ("Men Madina, ...").
-- Ism endi akkauntga bog'langani uchun bu ziddiyatga olib keladi:
-- promptda "isming Shoxsanam" deyilib, misolda "Men Madina" turadi.
--
-- Misollar bazada saqlanadi va bir marta urug'lantirilgandan keyin
-- qayta yozilmaydi (seedDefaultRules.ts), shuning uchun koddagi matnni
-- tuzatishning o'zi yetmaydi — mavjud yozuvlar ham ko'chiriladi.
--
-- Almashtirish global sozlamadagi ismga emas, literal 'Madina' satriga
-- tayanadi: urug'langan matn aynan shu satrni o'z ichiga oladi.
UPDATE agent_rules SET
  body         = replace(body,         'Madina', '{ism}'),
  situation    = replace(situation,    'Madina', '{ism}'),
  bad_example  = replace(bad_example,  'Madina', '{ism}'),
  good_example = replace(good_example, 'Madina', '{ism}'),
  why          = replace(why,          'Madina', '{ism}')
WHERE body         LIKE '%Madina%'
   OR situation    LIKE '%Madina%'
   OR bad_example  LIKE '%Madina%'
   OR good_example LIKE '%Madina%'
   OR why          LIKE '%Madina%';
