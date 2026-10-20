import type { Permission } from '@/domain/entities/Permission';

export interface Role {
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly description: string | null;
  readonly permissions: Permission[];
  /** Tizim roli — o'chirib bo'lmaydi (admin, operator, viewer). */
  readonly isSystem: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Har doim to'liq huquqli bo'lib qoladigan rol. */
export const ADMIN_ROLE_KEY = 'admin';

export function hasPermission(role: Pick<Role, 'permissions'>, permission: Permission): boolean {
  return role.permissions.includes(permission);
}

export function hasAny(role: Pick<Role, 'permissions'>, permissions: Permission[]): boolean {
  return permissions.some((p) => role.permissions.includes(p));
}
