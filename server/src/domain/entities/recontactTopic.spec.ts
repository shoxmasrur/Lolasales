import { MAVZU_SARLAVHA_MAX, mavzuTekshiruvi } from '@/domain/entities/RecontactTopic';

/**
 * Qo'lda ishga tushiriladi: npm run test:mavzu-tekshiruvi --workspace=server
 *
 * NEGA BU TEST KERAK: topshiriq chegarasi `TOPSHIRIQ_MAX` bilan bir xil
 * bo'lishi shart. Admin 1000 belgidan uzun mavzu saqlay olsa, u ro'yxatda
 * ko'rinadi, lekin yuborishda `InstructAgentUseCase` HAR bir mijozda uni
 * rad etadi — butun ommaviy navbat "failed" bo'lib tugaydi.
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

const MAX = 1000;

// ── 1. To'g'ri qiymatlar ──────────────────────────────────────────────
eq('oddiy mavzu', mavzuTekshiruvi({ title: 'Kelishilgan kun o\'tdi', instruction: 'Holatini so\'ra' }, MAX), null);
eq('sarlavha aynan chegarada', mavzuTekshiruvi({ title: 'a'.repeat(MAVZU_SARLAVHA_MAX), instruction: 'x' }, MAX), null);
eq('topshiriq aynan chegarada', mavzuTekshiruvi({ title: 't', instruction: 'x'.repeat(MAX) }, MAX), null);
eq('chetdagi bo\'shliq sanalmaydi', mavzuTekshiruvi({ title: `  ${'a'.repeat(MAVZU_SARLAVHA_MAX)}  `, instruction: 'x' }, MAX), null);

// ── 2. Bo'sh qiymatlar ───────────────────────────────────────────────
eq('bo\'sh sarlavha', mavzuTekshiruvi({ title: '', instruction: 'x' }, MAX), 'Mavzu nomi bo\'sh bo\'lmasin');
eq('faqat bo\'shliq sarlavha', mavzuTekshiruvi({ title: '   ', instruction: 'x' }, MAX), 'Mavzu nomi bo\'sh bo\'lmasin');
eq(
  'bo\'sh topshiriq',
  mavzuTekshiruvi({ title: 't', instruction: ' \n ' }, MAX),
  'Topshiriq bo\'sh — agent nima haqida yozishini yozing',
);

// ── 3. Chegaradan oshgan ─────────────────────────────────────────────
eq(
  'sarlavha 121',
  mavzuTekshiruvi({ title: 'a'.repeat(MAVZU_SARLAVHA_MAX + 1), instruction: 'x' }, MAX),
  `Mavzu nomi ${MAVZU_SARLAVHA_MAX} belgidan oshmasin`,
);
eq(
  'topshiriq 1001',
  mavzuTekshiruvi({ title: 't', instruction: 'x'.repeat(MAX + 1) }, MAX),
  'Topshiriq 1000 belgidan oshmasin — mavzuni qisqa yozing',
);

// ── 4. Tahrir: faqat berilgan maydon tekshiriladi ────────────────────
eq('bo\'sh yamoq', mavzuTekshiruvi({}, MAX), null);
eq('faqat sarlavha', mavzuTekshiruvi({ title: 'Yangi nom' }, MAX), null);
eq('faqat bo\'sh topshiriq', mavzuTekshiruvi({ instruction: '' }, MAX), 'Topshiriq bo\'sh — agent nima haqida yozishini yozing');

console.log(failed === 0 ? '\nHammasi o\'tdi' : `\n${failed} ta test yiqildi`);
process.exit(failed === 0 ? 0 : 1);
