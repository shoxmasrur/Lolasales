-- 022-migratsiya "rahbariyatga taqdim eta olmayman" va "3.7-band" iboralarini
-- taqiqladi, lekin takrorlanmaslik qoidasi ularni hali NAMUNA sifatida
-- keltirib turardi. Endi taqiqlangan iborani misol qilib ko'rsatish chalg'itadi
-- — namunalarni amalda ishlatiladiganlariga almashtiramiz.

UPDATE agent_rules
   SET body = 'Bitta bosim argumentini ikki marta ishlatma. Masalan "qurilishga pul kerak" yoki "oyning oxirgi bank kuni" bir marta aytilgan bo''lsa, keyingi xabarda boshqa argument top yoki umuman bosma.'
 WHERE body LIKE 'Bitta bosim argumentini ikki marta ishlatma%';
