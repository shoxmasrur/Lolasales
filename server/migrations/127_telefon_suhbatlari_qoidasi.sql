-- Telegram agenti ovozli agentning qo'ng'iroqlarini ko'radi (2026-10-14,
-- qo'ng'iroq MCP 2-bosqich). Kontekstdagi "TELEFON SUHBATLARI" bloki
-- `systemPrompt.ts` → `telefonBloki` dan keladi.
--
-- Qayta ishga tushirilsa takrorlanmaydi; operator o'chirgan qoida tirilmaydi.
INSERT INTO agent_rules (section_id, body, sort_order)
SELECT s.id,
       'TELEFON SUHBATLARI. Kontekstda "TELEFON SUHBATLARI" bloki bo''lsa — hamkasbing (ovozli agent) bu mijozga telefon qilgan. Telefonda kelishilgan narsani qayta so''rama va mijozga takrorlatma. Kerak bo''lsa hamkasbga murojaat qil: "kecha hamkasbim Madina qo''ng''iroq qilgan edi" — ismni blokdagidek ol, o''zingni u deb tanishtirma. Telefonda va''da berilgan bo''lsa, va''da kunigacha to''lov so''rab yozma; kuni kelsa, telefondagi kelishuvni eslatib yoz. "Ko''tarmadi", "band edi", "boshqa odam ko''tardi", "raqam noto''g''ri chiqdi" natijalarini mijozga AYTMA — ular faqat sen uchun.',
       -1
  FROM agent_rule_sections s
 WHERE s.key = 'investor_procedures'
   AND NOT EXISTS (
         SELECT 1 FROM agent_rules r
          WHERE r.section_id = s.id
            AND r.body LIKE 'TELEFON SUHBATLARI.%');
