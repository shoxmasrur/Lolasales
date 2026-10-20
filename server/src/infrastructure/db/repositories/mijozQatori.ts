import type { ClientListItem } from '@/domain/repositories/IClientRepository';
import { mapClient } from '@/infrastructure/db/mappers';

type Row = Record<string, any>;

/**
 * `search` va `searchAll` so'rovlarining qatorini obyektga aylantiradi.
 *
 * NEGA ALOHIDA: ekrandagi ro'yxat va eksport bitta xaritalashdan yursin.
 * Nusxa bo'lsa, biri tuzatilib ikkinchisi unutiladi va fayldagi son
 * ekrandagidan farq qila boshlaydi.
 *
 * DIQQAT: `@/infrastructure/db/pool` ATAYLAB import qilinmaydi — u modul
 * yuklanishida `pg.Pool` yaratadi va `DATABASE_URL` talab qiladi. Shu
 * sabab bu modulni test bazasiz ham chaqira oladi.
 */
export function mijozQatori(r: Row): ClientListItem {
  return {
    ...mapClient(r),
    accountName: r.account_name ?? null,
  };
}
