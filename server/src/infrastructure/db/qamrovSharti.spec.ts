import { HAMMASI } from '@/domain/entities/MijozQamrovi';
import { mijozOrqaliSharti, mijozQamroviSharti, shartnomaQamroviSharti } from '@/infrastructure/db/qamrovSharti';

/** Qo'lda: npm run test:qamrov-sharti --workspace=server */
let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};

const p: unknown[] = [1];
check('cheklanmagan TRUE', [mijozQamroviSharti(HAMMASI, 'cl', p), p.length], ['TRUE', 1]);
const p2: unknown[] = [1];
const s = mijozQamroviSharti({ cheklangan: true, obyektlar: ['A'] }, 'cl', p2);
check('cheklangan $2', [s.includes('NOT cl.nomalum'), s.includes('= ANY($2::text[])'), p2[1]], [true, true, ['A']]);
check('mijoz sharti aynan', s,
  '(NOT cl.nomalum AND EXISTS (SELECT 1 FROM contracts qct WHERE qct.client_id = cl.id AND qct.deleted_at IS NULL AND trim(qct.object_name) = ANY($2::text[])))');
const p3: unknown[] = [];
check('boshqa alias, $1', mijozQamroviSharti({ cheklangan: true, obyektlar: ['A', 'B'] }, 'c', p3).includes('qct.client_id = c.id AND'), true);
check('params nusxa (keyin o\'zgarmaydi)', JSON.stringify(p3), '[["A","B"]]');

const p4: unknown[] = ['x', 'y'];
check('shartnoma cheklanmagan TRUE', [shartnomaQamroviSharti(HAMMASI, 'ct', p4), p4.length], ['TRUE', 2]);
const t = shartnomaQamroviSharti({ cheklangan: true, obyektlar: ['Vatan'] }, 'ct', p4);
check('shartnoma sharti aynan', [t, p4[2]], ['trim(ct.object_name) = ANY($3::text[])', ['Vatan']]);

const p5: unknown[] = ['bugun'];
const k5 = mijozOrqaliSharti(HAMMASI, p5);
check('mijoz orqali — cheklanmagan bo\'sh, params tegilmadi', [k5('x.client_id'), p5.length], ['', 1]);
const p6: unknown[] = ['bugun'];
const k6 = mijozOrqaliSharti({ cheklangan: true, obyektlar: ['Vatan'] }, p6);
const a6 = k6('conversations.client_id');
const b6 = k6('contracts.client_id');
check('mijoz orqali — EXISTS, parametr bir marta ($2)', [p6.length, p6[1], a6.startsWith(' AND EXISTS (SELECT 1 FROM clients qcl WHERE qcl.id = conversations.client_id AND (NOT qcl.nomalum'), a6.includes('$2::text[]'), b6.includes('$2::text[]'), b6.includes('qcl.id = contracts.client_id')],
  [2, ['Vatan'], true, true, true, true]);

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
