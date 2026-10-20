import { runMigrations } from '@/infrastructure/db/migrator';
import { closePool } from '@/infrastructure/db/pool';
import { PgUserRepository } from '@/infrastructure/db/repositories/PgUserRepository';
import { PgRoleRepository } from '@/infrastructure/db/repositories/PgRoleRepository';
import { ADMIN_ROLE_KEY } from '@/domain/entities/Role';
import { BcryptPasswordHasher } from '@/infrastructure/support/BcryptPasswordHasher';
import { config } from '@/shared/config';
import { logger } from '@/shared/logger';

/** Birinchi admin foydalanuvchini yaratadi (mavjud bo'lsa tegmaydi). */
async function seed(): Promise<void> {
  await runMigrations();

  const users = new PgUserRepository();
  const roles = new PgRoleRepository();
  const hasher = new BcryptPasswordHasher();

  if (config.ADMIN_PASSWORD === 'change-me') {
    logger.warn('ADMIN_PASSWORD hali standart qiymatda — .env faylda o\'zgartiring!');
  }

  const existing = await users.findByEmail(config.ADMIN_EMAIL);
  if (existing) {
    // Admin o'zini bloklab qo'ysa, uni ochadigan odam qolmaydi —
    // blokni faqat administrator ochadi. Shuning uchun `seed` ayni
    // paytda tiklash yo'li ham: serverga kira oladigan odam har doim
    // dashboardga qayta kira oladi.
    if (existing.lockedAt || existing.failedLoginAttempts > 0) {
      await users.clearLoginFailures(existing.id);
      logger.warn({ email: config.ADMIN_EMAIL }, 'Admin hisobi blokdan chiqarildi');
    }

    // .env dagi parol o'zgargan bo'lsa sinxronlaymiz — aks holda foydalanuvchi
    // yangi parol bilan kira olmaydi va sababi tushunarsiz bo'ladi.
    const matches = await hasher.verify(config.ADMIN_PASSWORD, existing.passwordHash);
    if (matches) {
      logger.info({ email: config.ADMIN_EMAIL }, 'Admin allaqachon mavjud');
    } else {
      await users.update(existing.id, { passwordHash: await hasher.hash(config.ADMIN_PASSWORD) });
      logger.warn({ email: config.ADMIN_EMAIL }, 'Admin paroli .env dagi qiymatga yangilandi');
    }
    return;
  }

  const adminRole = await roles.findByKey(ADMIN_ROLE_KEY);
  if (!adminRole) throw new Error('Administrator roli topilmadi — migratsiyalarni tekshiring');

  const admin = await users.create({
    email: config.ADMIN_EMAIL,
    passwordHash: await hasher.hash(config.ADMIN_PASSWORD),
    fullName: config.ADMIN_NAME,
    roleId: adminRole.id,
  });

  logger.info({ email: admin.email }, 'Admin yaratildi');
}

try {
  await seed();
} catch (err) {
  logger.error({ err }, 'Seed xatosi');
  process.exitCode = 1;
} finally {
  await closePool();
}
