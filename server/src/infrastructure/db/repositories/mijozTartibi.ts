import type { ClientQuery } from '@/domain/repositories/IClientRepository';

/**
 * Mijozlar ro'yxatining SQL tartibi — `ORDER BY` dan keyingi ifoda.
 *
 * NEGA ALOHIDA MODUL: ekrandagi sahifalash (`search`) va eksportning
 * bo'laklab o'qishi (`searchAll`) AYNAN bir xil tartibda yurishi shart.
 * Ikki joyda ikki nusxa bo'lsa, ular bir kuni ajralib qoladi va fayl
 * ekranda ko'ringan ro'yxatdan boshqa to'plam bo'lib chiqadi.
 *
 * NEGA `c.id ASC`: asosiy ustunlar takrorlanadigan qiymatlarga to'la —
 * ko'p mijozning `debt_monthly` i teng, `days_overdue` i esa aksar
 * hollarda bir xil. Postgres teng qatorlarning tartibini kafolatlamaydi,
 * ya'ni `OFFSET 50` ikkinchi so'rovda boshqa qatordan boshlanishi mumkin:
 * kimdir ikki marta chiqadi, kimdir umuman tushmaydi.
 */
export function mijozTartibi(sort: ClientQuery['sort']): string {
  const asosiy =
    sort === 'name' ? 'c.full_name ASC'
    : sort === 'recent' ? 'c.created_at DESC'
    : sort === 'overdue' ? 'agg.days_overdue DESC NULLS LAST'
    // "To'lov bo'yicha" saralash — oyma-oy kechikish bo'yicha: ro'yxatdagi
    // asosiy ustun ham shu.
    : 'agg.debt_monthly DESC NULLS LAST';

  return `${asosiy}, c.id ASC`;
}
