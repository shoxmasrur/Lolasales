import { ADMIN_ROLE_KEY } from '@/domain/entities/Role';

/**
 * Obyekt cheklovi: foydalanuvchi qaysi mijozlarni ko'radi.
 *
 * Cheklanmagan (`cheklangan: false`) — hammasi, SQL o'zgarmaydi.
 * Cheklangan — faqat `obyektlar` dagi tirik shartnomasi bor mijozlar
 * (mijoz darajasida: ko'rinadigan mijozning barcha shartnomalari ko'rinadi).
 */
export interface MijozQamrovi {
  readonly cheklangan: boolean;
  /** Qirqilgan, takrorsiz, tartiblangan. Cheklanmaganda bo'sh. */
  readonly obyektlar: readonly string[];
}

export const HAMMASI: MijozQamrovi = Object.freeze({ cheklangan: false, obyektlar: Object.freeze([]) as readonly string[] });

/**
 * Foydalanuvchining qamrovi. Admin rolida `objects` e'tiborsiz; bo'sh
 * ro'yxat — cheklovsiz. Chaqiruvchi: `qamrovOl({ objects: user.objects,
 * roleKey: user.role.key })`.
 *
 * Yopiq holatda yiqiladi: qaror XOM ro'yxat bo'yicha. Ro'yxat bo'sh emas,
 * lekin tozalangach hech narsa qolmasa ham — cheklangan (`= ANY('{}')`
 * hech narsaga mos kelmaydi), cheklov jimgina olib tashlanmaydi.
 */
export function qamrovOl(user: { objects: readonly string[]; roleKey: string | null }): MijozQamrovi {
  if (user.roleKey === ADMIN_ROLE_KEY || user.objects.length === 0) return HAMMASI;
  const obyektlar = [...new Set(user.objects.map((o) => o.trim()).filter((o) => o !== ''))].sort();
  return { cheklangan: true, obyektlar };
}

/** Kesh kalitiga qo'shiladigan qism: `'*'` yoki tartiblangan obyektlar JSON'i. */
export function qamrovKaliti(q: MijozQamrovi): string {
  if (!q.cheklangan) return '*';
  return JSON.stringify([...q.obyektlar].sort());
}

/**
 * Tashqi (CRM) shartnoma obyekti qamrovdami — bazada hali yo'q shartnoma
 * uchun (`from-contract`). Nom qirqiladi; bo'sh/yo'q obyekt cheklanganga
 * ko'rinmaydi.
 */
export function obyektQamrovdami(q: MijozQamrovi, objectName: string | null | undefined): boolean {
  if (!q.cheklangan) return true;
  const nom = objectName?.trim() ?? '';
  return nom !== '' && q.obyektlar.includes(nom);
}
