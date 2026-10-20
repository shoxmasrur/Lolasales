import { mapMessage } from '@/infrastructure/db/mappers';

/** Qo'lda ishga tushiriladi: npm run test:rasm-turi-mapper --workspace=server */

let failed = 0;
function check(holat: string, ok: boolean, izoh = ''): void {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${holat}${ok ? '' : `  ${izoh}`}`);
}

const asos = {
  id: 'm1',
  conversation_id: 'cv1',
  direction: 'in',
  author: 'client',
  body: '',
  status: 'delivered',
  meta: {},
  created_at: new Date('2026-09-11T08:00:00Z'),
};

{
  const m = mapMessage({ ...asos } as never);
  check('tegilmagan xabarda imageKind null', m.imageKind === null, String(m.imageKind));
  check('tegilmagan xabarda imageStatus none', m.imageStatus === 'none', m.imageStatus);
  check('tegilmagan xabarda imageNote null', m.imageNote === null, String(m.imageNote));
}

{
  const m = mapMessage({
    ...asos,
    image_kind: 'tolov',
    image_status: 'done',
    image_note: 'Payme, 5 000 000 so\'m',
  } as never);
  check('imageKind o\'qiladi', m.imageKind === 'tolov', String(m.imageKind));
  check('imageStatus o\'qiladi', m.imageStatus === 'done', m.imageStatus);
  check('imageNote o\'qiladi', m.imageNote === 'Payme, 5 000 000 so\'m', String(m.imageNote));
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
