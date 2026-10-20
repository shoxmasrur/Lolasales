-- 016-migratsiya ikkita yozuvni o'tkazib yubordi: biri bosh harf bilan
-- boshlangan ("Hamkasbim siz bilan…"), ikkinchisi boshqa shaklda edi
-- ("shundayligicha qayd qildim").

UPDATE agent_rules
   SET good_example = replace(good_example, 'Hamkasbim siz bilan bog''lanadi', 'Hamkasbim o''zi bog''lanadi')
 WHERE good_example LIKE '%Hamkasbim siz bilan bog''lanadi%';

UPDATE agent_rules
   SET good_example = replace(good_example, 'javobingizni shundayligicha qayd qildim', 'javobingizni shundayligicha yozib qo''ydim')
 WHERE good_example LIKE '%shundayligicha qayd qildim%';
