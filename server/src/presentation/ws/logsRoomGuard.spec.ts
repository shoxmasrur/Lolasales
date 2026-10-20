import { checkLogsRoomAccess } from '@/presentation/ws/logsRoomGuard';
import type { User } from '@/domain/entities/User';

/**
 * Qo'lda ishga tushiriladi: npm run test:logs-room-guard
 *
 * NEGA BU TEST MUHIM (jurnal-dashboard so'nggi ko'rikdagi 1-topilma):
 * `logs` xonasiga bir marta qo'shilgan socket, `logs:subscribe`ni qayta
 * yubormasa, soatlab (yoki abadiy) xonada qolib ketardi — hatto
 * foydalanuvchining `logs.view` ruxsati olib qo'yilgan, hisobi bloklangan
 * yoki o'chirilgan bo'lsa ham. `checkLogsRoomAccess` shu bo'shliqni
 * yopadigan qayta tekshiruv — bu yerda socket.io yoki http server
 * ishga tushirilmaydi, faqat sof funksiya tekshiriladi.
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

const ROLE_WITH_LOGS = { id: 'r1', name: 'admin', permissions: ['logs.view'] } as const;
const ROLE_WITHOUT_LOGS = { id: 'r2', name: 'operator', permissions: [] } as const;

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    email: 'u1@example.com',
    passwordHash: 'x',
    fullName: 'Foydalanuvchi',
    roleId: ROLE_WITH_LOGS.id,
    role: ROLE_WITH_LOGS as unknown as User['role'],
    isActive: true,
    failedLoginAttempts: 0,
    lockedAt: null, objects: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── 1. Ruxsati bor, faol, bloklanmagan foydalanuvchi — authorized ─────
{
  const users = new Map<string, User>([['u1', user()]]);
  const res = await checkLogsRoomAccess(
    [{ socketId: 's1', userId: 'u1' }],
    async (id) => users.get(id) ?? null,
  );
  eq('ruxsatli foydalanuvchi authorized', res, { authorized: ['s1'], unauthorized: [], indeterminate: [] });
}

// ── 2. Ruxsat olib qo'yilgan (rol o'zgargan) — unauthorized ───────────
// Aynan 1-topilmaning stsenariysi: admin `logs.view`ni olib qo'yadi,
// socket esa hali xonada.
{
  const users = new Map<string, User>([['u1', user({ role: ROLE_WITHOUT_LOGS as unknown as User['role'] })]]);
  const res = await checkLogsRoomAccess(
    [{ socketId: 's1', userId: 'u1' }],
    async (id) => users.get(id) ?? null,
  );
  eq('ruxsat olib qo\'yilgan foydalanuvchi unauthorized', res, { authorized: [], unauthorized: ['s1'], indeterminate: [] });
}

// ── 3. Hisob bloklangan — unauthorized ─────────────────────────────────
// isLocked — auth.ts va logs:subscribe bilan bir xil qoida: can() o'zi
// lockedAt'ni tekshirmaydi.
{
  const users = new Map<string, User>([['u1', user({ lockedAt: new Date() })]]);
  const res = await checkLogsRoomAccess(
    [{ socketId: 's1', userId: 'u1' }],
    async (id) => users.get(id) ?? null,
  );
  eq('bloklangan hisob unauthorized', res, { authorized: [], unauthorized: ['s1'], indeterminate: [] });
}

// ── 4. Hisob o'chirilgan (isActive: false) — unauthorized ─────────────
{
  const users = new Map<string, User>([['u1', user({ isActive: false })]]);
  const res = await checkLogsRoomAccess(
    [{ socketId: 's1', userId: 'u1' }],
    async (id) => users.get(id) ?? null,
  );
  eq('o\'chirilgan hisob unauthorized', res, { authorized: [], unauthorized: ['s1'], indeterminate: [] });
}

// ── 5. Foydalanuvchi bazada topilmadi (o'chirilgan) — unauthorized ────
{
  const res = await checkLogsRoomAccess(
    [{ socketId: 's1', userId: 'yoq-foydalanuvchi' }],
    async () => null,
  );
  eq('topilmagan foydalanuvchi unauthorized', res, { authorized: [], unauthorized: ['s1'], indeterminate: [] });
}

// ── 6. userId yo'q (autentifikatsiyasiz socket) — unauthorized, loadUser umuman chaqirilmaydi ──
{
  let chaqirildi = 0;
  const res = await checkLogsRoomAccess(
    [{ socketId: 's1', userId: undefined }],
    async () => { chaqirildi += 1; return null; },
  );
  eq('userId yo\'q bo\'lsa unauthorized', res, { authorized: [], unauthorized: ['s1'], indeterminate: [] });
  eq('userId yo\'q bo\'lsa loadUser chaqirilmaydi', chaqirildi, 0);
}

// ── 7. loadUser rad etilgan promise qaytarsa — indeterminate, XONADA QOLADI ──
// Aynan shu vazifaning stsenariysi: Postgres vaqtincha to'yingan yoki
// ulanish eskirgan — bitta findById yiqiladi, boshqa ulanishdagi app_log
// yozuvlari esa davom etadi. Bu holatni "ruxsat yo'q" deb talqin qilib
// xonadan chiqarish — doimiy jazo, vaqtinchalik nosozlik uchun. Qator
// yetkazilmaydi (fail-closed), lekin a'zolik saqlanadi: baza tiklangach,
// keyingi qatorda operator hech narsa qilmasdan davom etadi.
{
  const res = await checkLogsRoomAccess(
    [{ socketId: 's1', userId: 'u1' }],
    async () => { throw new Error('baza xatosi'); },
  );
  eq('loadUser yiqilsa indeterminate (xonadan chiqarilmaydi)', res, {
    authorized: [],
    unauthorized: [],
    indeterminate: ['s1'],
  });
}

// ── 7b. loadUser bir marta yiqiladi, keyin tiklanadi — a'zolik saqlanib, ──
// ikkinchi urinishda yetkaziladi. Bu tiklanish stsenariysini qadab qo'yadi:
// eviction qaytarilmasligi kerak.
{
  const users = new Map<string, User>([['u1', user()]]);
  let chaqiruv = 0;
  const loadUser = async (id: string): Promise<User | null> => {
    chaqiruv += 1;
    if (chaqiruv === 1) throw new Error('baza vaqtincha yiqildi');
    return users.get(id) ?? null;
  };

  const birinchi = await checkLogsRoomAccess([{ socketId: 's1', userId: 'u1' }], loadUser);
  eq('1-urinish: baza yiqiladi — indeterminate, xonada qoladi', birinchi, {
    authorized: [],
    unauthorized: [],
    indeterminate: ['s1'],
  });

  // Eviction bo'lmagani uchun socket haligacha xonada — keyingi qator uchun
  // yana tekshiriladi (createSocketServer.ts bu a'zolikni o'zgartirmaydi).
  const ikkinchi = await checkLogsRoomAccess([{ socketId: 's1', userId: 'u1' }], loadUser);
  eq('2-urinish: baza tiklandi — authorized, qator yetkaziladi', ikkinchi, {
    authorized: ['s1'],
    unauthorized: [],
    indeterminate: [],
  });
}

// ── 8. Bir nechta socket — aralash natija, tartib muhim emas ──────────
// Operator U ikkita tabda ochgan, ikkalasi ham bir xil holatga ega
// bo'lishi kerak; boshqa foydalanuvchi V ruxsatli.
{
  const users = new Map<string, User>([
    ['u1', user({ role: ROLE_WITHOUT_LOGS as unknown as User['role'] })],
    ['u2', user({ id: 'u2' })],
  ]);
  const res = await checkLogsRoomAccess(
    [
      { socketId: 's1', userId: 'u1' },
      { socketId: 's2', userId: 'u1' },
      { socketId: 's3', userId: 'u2' },
    ],
    async (id) => users.get(id) ?? null,
  );
  eq('authorized to\'plami', [...res.authorized].sort(), ['s3']);
  eq('unauthorized to\'plami', [...res.unauthorized].sort(), ['s1', 's2']);
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
