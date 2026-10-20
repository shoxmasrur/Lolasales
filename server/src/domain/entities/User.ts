import type { Permission } from '@/domain/entities/Permission';
import type { Role } from '@/domain/entities/Role';

export interface User {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly fullName: string;
  readonly roleId: string;
  /** So'rov paytida rol bilan birga yuklanadi. */
  readonly role: Role;
  readonly isActive: boolean;
  /** Ketma-ket xato kirish urinishlari. Muvaffaqiyatli kirishda nolga tushadi. */
  readonly failedLoginAttempts: number;
  /** Bloklangan vaqt. NULL bo'lmasa kirish taqiqlanadi. */
  readonly lockedAt: Date | null;
  /**
   * Biriktirilgan obyekt nomlari (134). Bo'sh — cheklovsiz; admin rolida
   * e'tiborsiz. Qamrov `qamrovOl` orqali hisoblanadi.
   */
  readonly objects: string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Shuncha ketma-ket xato urinishdan keyin hisob bloklanadi.
 *
 * Uchta — ataylab kam: dashboardda mijozlarning shaxsiy ma'lumotlari
 * bor, xodim esa o'z parolini biladi. Adashib qolgan xodimni
 * administrator bir bosishda ochadi.
 */
export const MAX_LOGIN_ATTEMPTS = 3;

export function isLocked(user: Pick<User, 'lockedAt'>): boolean {
  return user.lockedAt !== null;
}

export type PublicUser = Omit<User, 'passwordHash'>;

export function toPublicUser(user: User): PublicUser {
  const { passwordHash: _omit, ...rest } = user;
  return rest;
}

export function can(user: Pick<User, 'role' | 'isActive'>, permission: Permission): boolean {
  if (!user.isActive) return false;
  return user.role.permissions.includes(permission);
}
