import { holatniAniqla } from '@/domain/entities/shartnomaHolati';
import type { ClientWithDebt } from '@/domain/repositories/IClientRepository';
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
export function mijozQatori(r: Row): ClientWithDebt {
  return {
    ...mapClient(r),
    debtMonthly: Number(r.debt_monthly ?? 0),
    debtTotal: Number(r.debt_total ?? 0),
    daysOverdue: Number(r.days_overdue ?? 0),
    contractsCount: Number(r.contracts_count ?? 0),
    // Bir xil holatning ikki xil yozilishi ("sold" va "Сотилди") bitta
    // kalitga keltiriladi — aks holda bitta mijozda ikkita bir xil
    // yorliq turardi.
    contractStatuses: [
      ...new Set(
        ((r.virtual_statuses ?? []) as string[])
          .map((v) => holatniAniqla(v)?.key ?? v.trim())
          .filter(Boolean),
      ),
    ],
    accountName: r.account_name ?? null,
  };
}
