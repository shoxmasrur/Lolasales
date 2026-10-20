import type { NewMessage } from '@/domain/entities/Message';

/**
 * Qo'lda ishga tushiriladi: npm run test:rasm-saqlash --workspace=server
 *
 * `HandleIncomingMessageUseCase` ning butun grafini qurish qimmat,
 * shuning uchun bu yerda faqat XARITALASH tekshiriladi: tasnif natijasi
 * `NewMessage` ga to'liq o'tadimi. Xaritalash funksiyasi use case'dan
 * eksport qilinadi.
 */

import { xabarMaydonlari } from '@/application/usecases/messaging/HandleIncomingMessageUseCase';

let failed = 0;
function check(holat: string, ok: boolean, izoh = ''): void {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${holat}${ok ? '' : `  ${izoh}`}`);
}

{
  const m: Partial<NewMessage> = xabarMaydonlari({
    imageKind: 'tolov',
    imageStatus: 'done',
    imageNote: 'Payme, 5 000 000 so\'m',
  });
  check('imageKind o\'tadi', m.imageKind === 'tolov', String(m.imageKind));
  check('imageStatus o\'tadi', m.imageStatus === 'done', String(m.imageStatus));
  check('imageNote o\'tadi', m.imageNote === 'Payme, 5 000 000 so\'m', String(m.imageNote));
}

{
  const m: Partial<NewMessage> = xabarMaydonlari(null);
  check('media yo\'q bo\'lsa imageKind null', m.imageKind === null, String(m.imageKind));
  check('media yo\'q bo\'lsa imageStatus none', m.imageStatus === 'none', String(m.imageStatus));
  check('media yo\'q bo\'lsa imageNote null', m.imageNote === null, String(m.imageNote));
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
