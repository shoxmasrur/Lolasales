-- Toza to'lov tarixli mijoz uzoq sanaga bahssiz rozi (2026-09-21).
--
-- 101 shu oy ichidagi uzoq sanani HAMMA mijoz uchun bir xil tartibga
-- solgan edi: 10 kundan narigi sanada oraliqning o'rtasi, ko'nmasa qisman
-- to'lov. Vaqtida to'lab keladigan mijozda bu savdolashish hech narsa
-- yutmaydi — pul baribir o'sha kuni tushadi, lekin yaxshi to'lovchi
-- keraksiz bosim ko'radi.
--
-- Endi kod `MIJOZ MA'LUMOTI` blokining oxiriga `TO'LOV TARIXI: TOZA`
-- yoki `TO'LOV TARIXI: KECHIKISHLI` qatorini chiqaradi (mezon: HAR BIR
-- shartnomada kechikish <= 30 kun va qoldirilgan oy <= 1). Shu ikki
-- UPDATE o'sha belgiga xulq bog'laydi.
--
-- NEGA ALOHIDA QOIDA EMAS: bir bo'limda "darhol rozi bo'lma" va "rozi
-- bo'l" degan ikki gap yonma-yon tursa, model qaysinisini olishi
-- tavakkalga qolardi. Istisno o'z qoidasining ICHIGA yoziladi.
--
-- QAMROV: faqat shu oy ichidagi sana. 091 (keyingi oy) va 089 (muhlat)
-- o'zgarishsiz — u yerda butun bir oylik to'lov tashlab ketiladi, bu
-- boshqa masala.
--
-- OPERATOR TAHRIRI: 101 ning matni UI'da tahrirlangan bo'lsa LIKE mos
-- kelmaydi va UPDATE jimgina o'tib ketadi. Qo'llagandan keyin tekshiring —
-- ikkala qator ham `istisno_bor = t` bo'lishi shart:
--   SELECT left(r.body, 45) AS qoida,
--          r.body LIKE '%TO''LOV TARIXI: TOZA%' AS istisno_bor
--     FROM agent_rules r
--     JOIN agent_rule_sections s ON s.id = r.section_id
--    WHERE s.key = 'promise_acceptance'
--      AND r.deleted_at IS NULL
--      AND (r.body LIKE 'MIJOZ SHU OY ICHIDAGI UZOQ SANANI AYTSA%'
--        OR r.body LIKE 'MIJOZ AYTGAN SANA NAVBATDAGI OYLIK TO''LOV KUNIDAN NARIDA%');
--
-- Qayta ishga tushirilsa natija o'zgarmaydi. Qo'riqchilar `deleted_at` ga
-- qaramaydi — operator o'chirgan qoida tirilmaydi.

-- ─── 1. Uzoq sana qoidasiga istisno ──────────────────────────────────────
UPDATE agent_rules r
   SET body = r.body || ' ISTISNO: MIJOZ MA''LUMOTI blokida "TO''LOV TARIXI: TOZA" tursa bu qoida QO''LLANMAYDI — bu mijoz grafikni buzmay kelayotgan odam. O''rtadagi kunni ham, qisman to''lovni ham so''rama: u aytgan sanani tasdiqla, rahmat ayt va o''sha kuni eslatishingni ayt.',
       updated_at = now()
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'promise_acceptance'
   AND r.deleted_at IS NULL
   AND r.body LIKE 'MIJOZ SHU OY ICHIDAGI UZOQ SANANI AYTSA%'
   AND r.body NOT LIKE '%TO''LOV TARIXI: TOZA%';

-- ─── 2. Oylik qo'shilishi ogohlantirishiga istisno ───────────────────────
UPDATE agent_rules r
   SET body = r.body || ' "TO''LOV TARIXI: TOZA" bo''lgan mijozga bu ogohlantirishni AYTMA — u grafigini o''zi biladi, ogohlantirish unga yana bir bosim bo''lib tuyuladi.',
       updated_at = now()
  FROM agent_rule_sections s
 WHERE r.section_id = s.id
   AND s.key = 'promise_acceptance'
   AND r.deleted_at IS NULL
   AND r.body LIKE 'MIJOZ AYTGAN SANA NAVBATDAGI OYLIK TO''LOV KUNIDAN NARIDA%'
   AND r.body NOT LIKE '%TO''LOV TARIXI: TOZA%';
