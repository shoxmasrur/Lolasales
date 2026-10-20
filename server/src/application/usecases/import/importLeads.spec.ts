import { ImportLeadsUseCase, kursniTop } from '@/application/usecases/import/ImportLeadsUseCase';
import type { ParsedLeadFile } from '@/domain/services/ILeadFileParser';

/** Qo'lda ishga tushiriladi: npm run test:import-leads --workspace=server (bazasiz). */
let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

const KURSLAR = [{ id: 'k1', name: 'Python Asoslari' }, { id: 'k2', name: "Ma'lumotlar tahlili" }];

check('kurs: katta-kichik harf', kursniTop(KURSLAR, 'python   asoslari'), 'k1');
check('kurs: apostrof turlari', kursniTop(KURSLAR, "Ma’lumotlar tahlili"), 'k2');
check('kurs: topilmadi', kursniTop(KURSLAR, 'Java'), null);
check('kurs: bo\'sh', kursniTop(KURSLAR, null), null);

function qur(file: ParsedLeadFile) {
  const bazadagi = new Set<string>();
  const yaratilgan: Array<{ phone: string; courseId: string | null; batchId: string }> = [];
  const yangilangan: Array<{ id: string; extra: string[] }> = [];
  let finalized: Record<string, unknown> | null = null;
  const uc = new ImportLeadsUseCase(
    { parseLeads: async () => file },
    {
      raqamdan: async (i: { fullName: string; phone: string; courseId: string | null; batchId: string }) => {
        if (i.phone === '+998900000000') throw new Error('baza xatosi');
        const bor = bazadagi.has(i.phone);
        bazadagi.add(i.phone);
        if (!bor) yaratilgan.push({ phone: i.phone, courseId: i.courseId, batchId: i.batchId });
        return { client: { id: `c-${i.phone}` }, created: !bor };
      },
    } as never,
    { list: async () => KURSLAR } as never,
    {
      start: async () => ({ id: 'b1' }),
      finalize: async (_id: string, d: Record<string, unknown>) => { finalized = d; return { id: 'b1', ...d }; },
    } as never,
    { update: async (id: string, p: { extraPhones: string[] }) => { yangilangan.push({ id, extra: p.extraPhones }); } } as never,
    { isPhoneBlocked: async (p: string) => p === '+998909999999' } as never,
  );
  return { uc, yaratilgan, yangilangan, getFinalized: () => finalized };
}

(async () => {
  const fayl: ParsedLeadFile = {
    rows: [
      { rowNumber: 2, fullName: 'Ali', phones: ['+998901111111'], courseName: 'python asoslari' },
      { rowNumber: 3, fullName: 'Vali', phones: ['+998902222222', '+998903333333'], courseName: 'Noma\'lum kurs' },
      { rowNumber: 4, fullName: null, phones: ['+998901111111'], courseName: null },
      { rowNumber: 7, fullName: 'Uzilgan', phones: ['+998909999999'], courseName: null },
      { rowNumber: 5, fullName: 'Xato', phones: ['+998900000000'], courseName: null },
    ],
    errors: [{ row: 6, reason: "Yaroqli telefon raqami yo'q" }],
    totalRows: 6,
    detectedHeaders: ['Ism', 'Telefon', 'Kurs'],
  };
  const { uc, yaratilgan, yangilangan, getFinalized } = qur(fayl);
  const r = await uc.execute({ buffer: Buffer.alloc(0), filename: 'a.xlsx', userId: 'u1' });
  check('natija: created/existing/totalRows', [r.created, r.existing, r.totalRows], [2, 1, 6]);
  check('natija: xatolar (parser + baza)', r.errors.map((e) => e.row), [6, 7, 5]);
  check('kurs topilsa courseId, topilmasa null', yaratilgan.map((y) => y.courseId), ['k1', null]);
  check('batchId uzatiladi', yaratilgan.every((y) => y.batchId === 'b1'), true);
  check('qo\'shimcha raqam yangi mijozga yoziladi', yangilangan, [{ id: 'c-+998902222222', extra: ['+998903333333'] }]);
  check('ogohlantirish: noma\'lum kurs', r.warnings.length === 1 && r.warnings[0]!.includes("Noma'lum kurs"), true);
  check('batch yakuni', [getFinalized()!.clientsCreated, getFinalized()!.rowsOk, getFinalized()!.rowsFailed], [2, 3, 3]);

  // Ikkinchi yuklash: hammasi mavjud.
  const takror = qur({ ...fayl, rows: fayl.rows.slice(0, 2), errors: [], totalRows: 2 });
  await takror.uc.execute({ buffer: Buffer.alloc(0), filename: 'a.xlsx' });
  const ikkinchi = await takror.uc.execute({ buffer: Buffer.alloc(0), filename: 'a.xlsx' });
  check('ikkinchi marta: hammasi mavjud', [ikkinchi.created, ikkinchi.existing], [0, 2]);
  process.exitCode = failed ? 1 : 0;
})();
