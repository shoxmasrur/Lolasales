import { PERMISSIONS, PERMISSION_GROUPS, isPermission } from '@/domain/entities/Permission';

/**
 * Qo'lda ishga tushiriladi: npm run test:clients-export-ruxsat --workspace=server
 *
 * NEGA BU TEST KERAK: ruxsatlar katalogi (`PERMISSIONS`) va rol tahrirlash
 * oynasi chiziladigan tuzilma (`PERMISSION_GROUPS`) ikki alohida ro'yxat.
 * Kalit birinchisiga qo'shilib, ikkinchisiga unutilsa — huquq kodda
 * ishlaydi, lekin administrator uni oynadan HECH QACHON bera olmaydi.
 * Xato jimgina bo'ladi: hech narsa yiqilmaydi, shunchaki katak yo'q.
 */

let failed = 0;

function eq(nom: string, actual: unknown, kutilgan: unknown): void {
  const a = JSON.stringify(actual);
  const k = JSON.stringify(kutilgan);
  if (a === k) {
    console.log(`✓ ${nom}`);
  } else {
    failed += 1;
    console.log(`✗ ${nom}: ${a}  (kutilgan: ${k})`);
  }
}

// ── 1. Kalit katalogda bor ────────────────────────────────────────────
eq('clients.export katalogda', PERMISSIONS.includes('clients.export' as never), true);
eq('isPermission tanidi', isPermission('clients.export'), true);

// ── 2. Rol oynasida aynan bir marta va "clients" guruhida ─────────────
const uchragan = PERMISSION_GROUPS.flatMap((g) =>
  g.items.filter((i) => i.key === 'clients.export').map(() => g.section),
);
eq('oynada bir marta', uchragan.length, 1);
eq('mijozlar guruhida', uchragan[0], 'clients');

// ── 3. Har bir katalog kaliti oynada ham bor (umumiy siljish qo'riqchisi) ──
const oynadagilar = new Set(PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key)));
const yetishmaydi = PERMISSIONS.filter((p) => !oynadagilar.has(p));
eq('oynada yetishmayotgan kalit yo\'q', yetishmaydi, []);

console.log(failed === 0 ? '\nHammasi o\'tdi' : `\n${failed} ta test yiqildi`);
process.exit(failed === 0 ? 0 : 1);
