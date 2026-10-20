-- Yangi ruxsatlar qo'shilganda tizim rollariga ham qo'shilishi kerak,
-- aks holda admin ham yangi bo'limni ko'ra olmaydi.

UPDATE roles
   SET permissions = permissions || ARRAY['agent.view', 'agent.edit']
 WHERE key = 'admin'
   AND NOT ('agent.view' = ANY(permissions));

UPDATE roles
   SET permissions = permissions || ARRAY['agent.view']
 WHERE key IN ('operator', 'viewer')
   AND NOT ('agent.view' = ANY(permissions));
