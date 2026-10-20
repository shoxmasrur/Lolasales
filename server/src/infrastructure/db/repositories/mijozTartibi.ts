import type { ClientQuery } from '@/domain/repositories/IClientRepository';

/**
 * Mijozlar ro'yxatining SQL tartibi — `ORDER BY` dan keyingi ifoda.
 *
 * NEGA ALOHIDA MODUL: ekrandagi sahifalash (`search`) va eksportning
 * bo'laklab o'qishi (`searchAll`) AYNAN bir xil tartibda yurishi shart.
 * Ikki joyda ikki nusxa bo'lsa, ular bir kuni ajralib qoladi va fayl
 * ekranda ko'ringan ro'yxatdan boshqa to'plam bo'lib chiqadi.
 *
 * NEGA `c.id ASC`: asosiy ustunlar takrorlanishi mumkin (bir xil ism, bir
 * xil importda bir xil `created_at`). Postgres teng qatorlarning tartibini
 * kafolatlamaydi, ya'ni `OFFSET 50` ikkinchi so'rovda boshqa qatordan
 * boshlanishi mumkin: kimdir ikki marta chiqadi, kimdir umuman tushmaydi.
 */
export function mijozTartibi(sort: ClientQuery['sort']): string {
  const asosiy = sort === 'name' ? 'c.full_name ASC' : 'c.created_at DESC';
  return `${asosiy}, c.id ASC`;
}
