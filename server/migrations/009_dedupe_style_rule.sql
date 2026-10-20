-- 008-migratsiya uzunlik qoidasining yangi tahririni qo'shdi, lekin eskisi
-- ("QISQA yoz. 1-3 jumla") o'chmay qoldi va ikkita qarama-qarshi
-- ko'rsatma paydo bo'ldi: "1-3 jumla" va "2-3 qator".

DELETE FROM agent_rules
 WHERE body = 'QISQA yoz. 1-3 jumla. Uzun matn yozma.';
