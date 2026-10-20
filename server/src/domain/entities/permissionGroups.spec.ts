import { PERMISSION_GROUPS, PERMISSIONS } from '@/domain/entities/Permission';

/**
 * Qo'lda ishga tushiriladi: npm run test:ruxsat-guruhlari --workspace=server
 *
 * Rol tahrirlash oynasi `PERMISSION_GROUPS` bo'yicha chiziladi: guruhga
 * kirmagan ruxsat panelda umuman ko'rinmaydi va uni hech kim bera olmaydi.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

const guruhdagilar = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key));
const yoq = PERMISSIONS.filter((p) => !guruhdagilar.includes(p));
const takror = guruhdagilar.filter((p, i) => guruhdagilar.indexOf(p) !== i);

check('har ruxsat biror guruhda', yoq.length === 0, yoq.join(', '));
check('guruhlarda takror yo\'q', takror.length === 0, takror.join(', '));

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
