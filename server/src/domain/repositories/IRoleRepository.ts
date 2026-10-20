import type { Permission } from '@/domain/entities/Permission';
import type { Role } from '@/domain/entities/Role';

export interface NewRole {
  key: string;
  name: string;
  description?: string | null;
  permissions: Permission[];
}

export interface IRoleRepository {
  findById(id: string): Promise<Role | null>;
  findByKey(key: string): Promise<Role | null>;
  list(): Promise<Role[]>;
  create(data: NewRole): Promise<Role>;
  update(
    id: string,
    patch: { name?: string; description?: string | null; permissions?: Permission[] },
  ): Promise<Role>;
  remove(id: string): Promise<void>;
  /** Rolni o'chirishdan oldin — unga bog'langan foydalanuvchilar soni. */
  countUsers(roleId: string): Promise<number>;
}
