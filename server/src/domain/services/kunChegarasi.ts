/**
 * Kunlik xulosaning kun chegarasi.
 *
 * Kun — TOSHKENT kuni: operator uchun "bugun" soat 00:00 da boshlanadi,
 * UTC yarim tunida emas. Bazadagi vaqtlar UTC, shuning uchun chegara
 * bir joyda hisoblanadi va SQL faqat tayyor oraliqni oladi.
 *
 * O'zbekistonda yozgi vaqt yo'q — siljish doim +05:00, shuning uchun
 * mintaqa kutubxonasi kerak emas.
 */

export const TOSHKENT_OFFSET = '+05:00';

/** Oxiri KIRMAYDI: [bosh, oxir). */
export interface KunOraligi {
  readonly boshIso: string;
  readonly oxirIso: string;
}

const KUN_MS = 24 * 60 * 60 * 1000;
const SANA_SHAKLI = /^\d{4}-\d{2}-\d{2}$/;

/** Sana mavjudmi (2026-02-31 shaklga mos, lekin kalendarda yo'q). */
function sanaHaqiqiymi(kunIso: string): boolean {
  const t = Date.parse(`${kunIso}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === kunIso;
}

export function kunOraligi(kunIso: string): KunOraligi {
  const bosh = new Date(`${kunIso}T00:00:00${TOSHKENT_OFFSET}`);
  return {
    boshIso: bosh.toISOString(),
    oxirIso: new Date(bosh.getTime() + KUN_MS).toISOString(),
  };
}

/** Hozir Toshkentda qaysi kun. */
export function bugungiKun(now: Date): string {
  return new Date(now.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Ro'yxat qanchagacha orqaga ochiladi. */
export const ENG_ESKI_KUN = 30;

export function kunSanasiXatosi(kunIso: string, bugunIso: string): string | null {
  if (!SANA_SHAKLI.test(kunIso)) return "Sana YYYY-MM-DD ko'rinishida";
  if (!sanaHaqiqiymi(kunIso)) return "Sana noto'g'ri";
  if (kunIso > bugunIso) return 'Kelajakdagi kun tanlab bo\'lmaydi';

  const farq = Math.round(
    (Date.parse(`${bugunIso}T00:00:00Z`) - Date.parse(`${kunIso}T00:00:00Z`)) / KUN_MS,
  );
  return farq > ENG_ESKI_KUN ? "Faqat oxirgi 30 kunni ko'rish mumkin" : null;
}
