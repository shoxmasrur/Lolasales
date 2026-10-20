import { PERMISSIONS, PERMISSION_GROUPS, isPermission } from '@/domain/entities/Permission';

/**
 * Qo'lda ishga tushiriladi: npm run test:bayram-ruxsati --workspace=server
 *
 * NEGA BU TEST KERAK: ruxsat UCH joyda yozilgan — `PERMISSIONS`
 * katalogi, rol oynasi chiziladigan `PERMISSION_GROUPS`, va web
 * tomondagi `Permission` uniyasi. Birinchisiga qo'shib, ikkinchisini
 * unutish eng jimgina xato: huquq kodda ishlaydi, lekin administrator
 * uni rol oynasidan HECH QACHON bera olmaydi — katakcha shunchaki yo'q.
 * Uchinchisini unutish esa kompilyatsiyada ushlanadi, shuning uchun
 * bu test ikkitasini qo'riqlaydi.
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

// ── 1. Ikkala kalit katalogda ─────────────────────────────────────────
for (const kalit of ['holidays.view', 'holidays.manage']) {
  eq(`${kalit} katalogda`, PERMISSIONS.includes(kalit as never), true);
  eq(`${kalit} tanildi`, isPermission(kalit), true);
}

// ── 2. Ikkalasi ham rol oynasida, bitta guruhda ───────────────────────
{
  const guruhlar = PERMISSION_GROUPS.filter((g) =>
    g.items.some((i) => i.key === 'holidays.view' || i.key === 'holidays.manage'),
  );
  eq('bitta guruhda', guruhlar.length, 1);
  eq('guruh kaliti', guruhlar[0]?.section, 'holidays');
  eq('guruhda ikki band', guruhlar[0]?.items.length, 2);
}

// ── 3. Katalogdagi HAR kalit oynada ham bor (umumiy qo'riqchi) ────────
{
  const oynadagilar = new Set(PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key)));
  eq('oynada yetishmayotgan kalit yo\'q', PERMISSIONS.filter((p) => !oynadagilar.has(p)), []);
}

console.log(failed === 0 ? '\nHammasi o\'tdi' : `\n${failed} ta test yiqildi`);
process.exit(failed === 0 ? 0 : 1);
