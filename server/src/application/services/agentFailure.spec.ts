import { agentFailureReason } from '@/application/services/agentFailure';

/**
 * Qo'lda ishga tushiriladi: npm run test:agent-failure --workspace=server
 *
 * Bannerdagi matnni operator o'qiydi. Xom ingliz xatosi u yerga tushmasligi
 * kerak, limit vaqti esa MAHALLIY soatda ko'rsatilishi kerak — "2pm (UTC)"
 * Toshkentda 19:00.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  ${izoh}`}`);
};

const TZ = 'Asia/Tashkent';
const NOW = new Date('2026-08-12T09:00:00Z');

const limit = agentFailureReason(
  new Error('Claude Code returned an error result: You\'ve hit your session limit · resets 2pm (UTC)'),
  NOW,
  TZ,
);
check(
  'limit xatosi — o\'zbekcha sabab va mahalliy vaqt',
  limit === 'Agent vaqtincha ishlamadi: Claude limiti (19:00 da tiklanadi)',
  limit,
);

const limitsiz = agentFailureReason(new Error('You have hit your usage limit'), NOW, TZ);
check(
  'vaqtsiz limit — qavs qo\'shilmaydi',
  limitsiz === 'Agent vaqtincha ishlamadi: Claude limiti',
  limitsiz,
);

const yarimTun = agentFailureReason(new Error('session limit · resets 12am (UTC)'), NOW, TZ);
check(
  'yarim tun (12am) — 05:00 Toshkentda',
  yarimTun === 'Agent vaqtincha ishlamadi: Claude limiti (05:00 da tiklanadi)',
  yarimTun,
);

const tush = agentFailureReason(new Error('session limit · resets 12pm (UTC)'), NOW, TZ);
check(
  'tush (12pm) — 17:00 Toshkentda',
  tush === 'Agent vaqtincha ishlamadi: Claude limiti (17:00 da tiklanadi)',
  tush,
);

const chegaradanTashqari = agentFailureReason(new Error('session limit · resets 25:00 (UTC)'), NOW, TZ);
check(
  'chegaradan chiqqan soat — vaqt ko\'rsatilmaydi',
  chegaradanTashqari === 'Agent vaqtincha ishlamadi: Claude limiti',
  chegaradanTashqari,
);

const tarmoq = agentFailureReason(new Error('fetch failed: ECONNRESET'), NOW, TZ);
check(
  'tarmoq xatosi',
  tarmoq === 'Agent vaqtincha ishlamadi: tarmoq xatosi',
  tarmoq,
);

const notanish = agentFailureReason(new Error('Agent javob bera olmadi: error_max_turns'), NOW, TZ);
check(
  'noma\'lum xato — zaxira matn',
  notanish === 'Agent xatosi: Agent javob bera olmadi: error_max_turns',
  notanish,
);

const uzun = agentFailureReason(new Error('x'.repeat(500)), NOW, TZ);
check('uzun xato qisqartiriladi', uzun.length <= 220, `uzunlik: ${uzun.length}`);

const bosh = agentFailureReason(undefined, NOW, TZ);
check('xato obyekti yo\'q', bosh === 'Agent xatosi: noma\'lum xato', bosh);

console.log(failed ? `\n${failed} ta tekshiruv yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
