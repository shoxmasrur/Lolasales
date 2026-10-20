import { TelegramConnectionWatcher } from '@/application/services/TelegramConnectionWatcher';
import type { TelegramAccount } from '@/domain/entities/TelegramAccount';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { ITelegramGateway } from '@/domain/services/ITelegramGateway';
import type { IClock } from '@/domain/services/support';

/**
 * Qo'lda ishga tushiriladi: npm run test:connection-watcher
 *
 * NEGA TEKSHIRILADI: bu kuzatuvchi 2026-08-09 dagi nosozlikni
 * takrorlanmasligi uchun yozilgan — proksi uzilib, akkaunt zombi
 * holatda qolgan va hech narsa uni tiklamagan edi. Agar u
 * `logged_out` akkauntlarni ham urinaversa, sessiyasi eskirgan
 * akkauntni cheksiz bezovta qiladi; agar o'lik akkauntni o'tkazib
 * yuborsa — nosozlik qaytadi.
 *
 * MUHIM: `MtprotoTelegramGateway.reconnect()` MUVAFFAQIYATSIZLIKDA HAM
 * hech qachon rad etmaydi — ichida ushlab, jurnallab, akkauntni `error`
 * holatiga o'tkazadi va oddiy qaytadi (rad etish faqat kutilmagan DB
 * xatosida bo'ladi). Shu sabab quyidagi soxta gateway ham xuddi shunday
 * ishlaydi: muvaffaqiyatsizlikda RESOLVE qiladi, natijani esa
 * `isConnected()` orqali bildiradi. Ilgari soxta gateway `throw`
 * qilardi — bu haqiqiy shartnomada yo'q xatti-harakat edi va aynan shu
 * soxta test kuzatuvchidagi nosozlikni yashirgan edi.
 */

let failed = 0;

function eq(nom: string, actual: unknown, kutilgan: unknown): void {
  if (actual === kutilgan) {
    console.log(`✓ ${nom}`);
  } else {
    failed += 1;
    console.log(`✗ ${nom}: ${String(actual)}  (kutilgan: ${String(kutilgan)})`);
  }
}

const HOZIR = new Date('2026-08-09T12:00:00Z');

function akk(id: string, patch: Partial<TelegramAccount> = {}): TelegramAccount {
  return {
    id, label: id, isEnabled: true, session: 'sessiya', status: 'connected',
    ...patch,
  } as unknown as TelegramAccount;
}

interface Qurilma {
  watcher: TelegramConnectionWatcher;
  urinishlar: string[];
  /** Qaysi akkauntlar uchun "o'tkazib yuborilgan xabarlarni tikla" chaqirildi. */
  tiklashlar: string[];
}

/**
 * @param muvaffaqiyatsizBolsin - true bo'lsa, `reconnect()` chaqirilganda
 *   klient ULANMAYDI (`isConnected()` false qoladi) — lekin baribir
 *   RESOLVE qiladi, xuddi haqiqiy gateway kabi. `throw` qilmaydi.
 */
function qur(accounts: TelegramAccount[], tirik: Set<string>, muvaffaqiyatsizBolsin = false): Qurilma {
  const urinishlar: string[] = [];
  const tiklashlar: string[] = [];

  const repo = { list: async () => accounts } as unknown as ITelegramAccountRepository;
  const gateway = {
    isConnected: (id: string) => tirik.has(id),
    reconnect: async (id: string) => {
      urinishlar.push(id);
      if (muvaffaqiyatsizBolsin) tirik.delete(id);
      else tirik.add(id);
    },
  } as unknown as ITelegramGateway;
  const clock = { now: () => HOZIR } as unknown as IClock;

  const watcher = new TelegramConnectionWatcher(repo, gateway, clock, async (id) => {
    tiklashlar.push(id);
  });
  return { watcher, urinishlar, tiklashlar };
}

// ── 1. O'lik akkaunt qayta ulanadi ─────────────────────────────────────
{
  const { watcher, urinishlar, tiklashlar } = qur([akk('a1')], new Set());
  await watcher.checkAll();
  eq('o\'lik akkaunt urinildi', urinishlar.join(','), 'a1');
  // Uzilish paytida kelgan xabarlar jonli oqimga tushmagan — qayta
  // ulanish bilan birga ular ham tortib olinishi kerak.
  eq('qayta ulangach xabarlar tiklandi', tiklashlar.join(','), 'a1');
}

// ── 1b. Qayta ulanmagan akkauntda tiklash ham ishlamaydi ───────────────
// Ulanmagan klientdan xabar so'rash faqat xato beradi.
{
  const { watcher, tiklashlar } = qur([akk('a1')], new Set(), true);
  await watcher.checkAll();
  eq('ulanmadi — tiklash chaqirilmadi', tiklashlar.join(','), '');
}

// ── 2. Tirik akkaunt tegilmaydi ────────────────────────────────────────
{
  const { watcher, urinishlar } = qur([akk('a1')], new Set(['a1']));
  await watcher.checkAll();
  eq('tirik akkaunt tegilmadi', urinishlar.length, 0);
}

// ── 3. logged_out — urinilmaydi ────────────────────────────────────────
// Prodda Nafosat aynan shunday: proksi ishlayapti, sessiya eskirgan.
{
  const { watcher, urinishlar } = qur([akk('a1', { status: 'logged_out' })], new Set());
  await watcher.checkAll();
  eq('logged_out urinilmadi', urinishlar.length, 0);
}

// ── 4. Muvaffaqiyatsizlikdan keyin darhol qayta urinilmaydi ───────────
// `reconnect()` RESOLVE qiladi, lekin klient ulanmay qoladi — kuzatuvchi
// buni `isConnected()`dan bilib, tanaffusni o'zi qo'yishi kerak.
{
  const { watcher, urinishlar } = qur([akk('a1')], new Set(), true);
  await watcher.checkAll();
  await watcher.checkAll();
  eq('ikkinchi tsiklda tanaffus', urinishlar.join(','), 'a1');
}

// ── 5. Bitta akkauntdagi xato qolganlarini to'xtatmaydi ───────────────
// Ketma-ket ishlaganda birinchi yiqilsa qolgani ham qolib ketardi.
{
  const { watcher, urinishlar } = qur([akk('a1'), akk('a2')], new Set(), true);
  await watcher.checkAll();
  eq('ikkalasi ham urinildi', urinishlar.sort().join(','), 'a1,a2');
}

// ── 5b. Chin rad etish (masalan DB xatosi) ham qolganlarni to'xtatmaydi ─
// `reconnect()` odatda rad etmaydi, lekin `setStatus` ichidagi DB xatosi
// hali ham chin `throw` bo'lishi mumkin — `try/catch` shuning uchun qoladi.
{
  const accounts = [akk('a1'), akk('a2')];
  const urinishlar: string[] = [];
  const repo = { list: async () => accounts } as unknown as ITelegramAccountRepository;
  const gateway = {
    isConnected: () => false,
    reconnect: async (id: string) => {
      urinishlar.push(id);
      throw new Error('DB bilan bog\'lanib bo\'lmadi');
    },
  } as unknown as ITelegramGateway;
  const clock = { now: () => HOZIR } as unknown as IClock;
  const watcher = new TelegramConnectionWatcher(repo, gateway, clock);

  await watcher.checkAll();
  eq('chin rad etishda ham ikkalasi urinildi', urinishlar.sort().join(','), 'a1,a2');
}

// ── 6. O'chirilgan akkaunt tegilmaydi ──────────────────────────────────
{
  const { watcher, urinishlar } = qur([akk('a1', { isEnabled: false })], new Set());
  await watcher.checkAll();
  eq('o\'chirilgan tegilmadi', urinishlar.length, 0);
}

// ── 7. Sog'aygan akkauntning eski xato vaqti tozalanadi ────────────────
// NEGA: `xatolar`dagi eskirgan yozuv o'chirilmasa, akkaunt SOG'AYGANDAN
// KEYIN duch kelgan YANGI muvaffaqiyatsizlik ham hali eski tanaffus
// davom etayotgandek noto'g'ri o'tkazib yuboriladi. Shu tozalash
// qatorini o'chirsa ham eski test to'plami yashil qolar edi — shuning
// uchun bu holat alohida tekshiriladi.
{
  let vaqt = HOZIR;
  const tirik = new Set<string>();
  const accounts = [akk('a1')];
  const repo = { list: async () => accounts } as unknown as ITelegramAccountRepository;
  const urinishlar: string[] = [];
  const gateway = {
    isConnected: (id: string) => tirik.has(id),
    reconnect: async (id: string) => {
      urinishlar.push(id);
      // Bu urinish ham muvaffaqiyatsiz — `tirik`ni o'zgartirmaydi.
    },
  } as unknown as ITelegramGateway;
  const clock = { now: () => vaqt } as unknown as IClock;
  const watcher = new TelegramConnectionWatcher(repo, gateway, clock);

  // t0: birinchi urinish — muvaffaqiyatsiz.
  await watcher.checkAll();

  // t0+1daq: akkaunt (masalan qo'lda yoki tashqi sabab bilan) tiklandi —
  // kuzatuvchi buni ko'rib, eski xato vaqtini tozalashi kerak.
  vaqt = new Date(HOZIR.getTime() + 60_000);
  tirik.add('a1');
  await watcher.checkAll();

  // t0+2daq: akkaunt yana yiqildi — bu YANGI muvaffaqiyatsizlik va 5
  // daqiqalik eski tanaffus tugashini kutmasdan darhol urinilishi kerak.
  vaqt = new Date(HOZIR.getTime() + 2 * 60_000);
  tirik.delete('a1');
  await watcher.checkAll();

  eq('sog\'ayishdan keyingi yangi xato darhol uriniladi', urinishlar.join(','), 'a1,a1');
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
