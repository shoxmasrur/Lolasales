/** Postgres unique indeks buzildimi (SQLSTATE 23505). */
export function uniqueBuzildimi(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === '23505';
}

/** Telegram profili boshqa mijozga allaqachon biriktirilgan bo'lsa ko'rsatiladigan matn. */
export const PROFIL_BAND = 'Bu Telegram profil boshqa mijozda';
