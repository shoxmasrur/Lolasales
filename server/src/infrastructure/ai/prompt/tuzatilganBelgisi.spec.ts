import { tarixQatori } from '@/infrastructure/ai/prompt/userPrompt';

/**
 * Qo'lda ishga tushiriladi: npm run test:tuzatilgan-belgisi --workspace=server
 *
 * Nima qo'riqlanadi: operator tuzatgan yoki o'chirgan xabar agentga
 * QANDAY ko'rinishi. O'chirilgan xabarning MATNI promptga tushmasligi
 * shart — aks holda agent mijoz ko'rmagan matnga tayanib javob yozadi.
 */

let failed = 0;
function check(holat: string, ok: boolean, izoh = ''): void {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${holat}${ok ? '' : `  ${izoh}`}`);
}

const at = new Date('2026-09-10T08:00:00Z');

// 1. Oddiy xabarlar — belgi qo'shilmaydi.
{
  const mijoz = tarixQatori({ role: 'client', text: 'pul yo\'q hozir', at });
  check('mijoz qatori o\'zgarmaydi', mijoz === 'MIJOZ: pul yo\'q hozir', mijoz);

  const biz = tarixQatori({ role: 'agent', text: '15-sanaga yozaymi?', at });
  check('oddiy chiquvchi qator o\'zgarmaydi', biz === 'SIZ: 15-sanaga yozaymi?', biz);
}

// 2. Tuzatilgan xabar — yangi matn va belgi.
{
  const q = tarixQatori({ role: 'agent', text: '15-sanaga yozaymi?', at, holat: 'tuzatilgan' });
  check('tuzatilgan belgisi bor', q.includes('TUZATILGAN'), q);
  check('tuzatilgan xabarda yangi matn ko\'rinadi', q.includes('15-sanaga yozaymi?'), q);
}

// 3. O'chirilgan xabar — MATN CHIQMAYDI.
{
  const q = tarixQatori({ role: 'agent', text: 'xato summa 999 999 so\'m', at, holat: 'ochirilgan' });
  check('o\'chirilgan xabar belgisi bor', q.includes('o\'chirildi'), q);
  check('o\'chirilgan xabarning MATNI chiqmaydi', !q.includes('999 999'), q);
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
