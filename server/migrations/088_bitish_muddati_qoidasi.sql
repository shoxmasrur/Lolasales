-- Xonadonni bitish muddati bo'yicha agent qoidasi.
--
-- 087 dan keyin kontekstda "Xonadonni bitish muddati: YYYY-yilning
-- N-choragi" qatori paydo bo'ladi — faqat sana ma'lum va o'tmagan
-- bo'lsa. Bu qoida agentga uni QACHON va QANDAY aytishni o'rgatadi.
--
-- QOIDADA ANIQ SANA MISOLI ATAYLAB YO'Q. Qoida har bir mijozning
-- promptiga tushadi; unda "2029-yilning 4-choragi" tursa, kontekstida
-- qator bo'lmagan mijozga model o'sha misolni aytib yuborishi mumkin —
-- 064-migratsiyada model promptdagi misolni aynan shunday ko'chirgan.
--
-- NEGA INSERT: bu yangi fakt. Qayta ishga tushirilsa takrorlanmaydi;
-- qo'riqchi `deleted_at` ga qaramaydi — operator o'chirgan bo'lsa
-- qoida tirilmaydi.

INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id,
       'XONADON BITISH MUDDATI faqat mijoz SO''RAGANDA aytiladi — o''zingdan tilga olma, suhbat to''lov haqida. Kontekstdagi "Xonadonni bitish muddati" qatorini XUDDI SHU KO''RINISHDA — yil va chorak bilan — ko''chir. Undan ANIQROQ gapirma: oy yoki kun AYTMA, ular kontekstda yo''q va taxmin keyin bahsga aylanadi. Bu qator umuman bo''lmasa muddatni AYTMA: "menejerimiz aniq aytadi" deb yo''naltir va ESKALATSIYA qil.',
       COALESCE((SELECT MAX(r2.sort_order) FROM agent_rules r2
                  WHERE r2.section_id = s.id AND r2.deleted_at IS NULL), 0) + 1
  FROM agent_rule_sections s
 WHERE s.key = 'contract_facts'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.body LIKE 'XONADON BITISH MUDDATI%');
