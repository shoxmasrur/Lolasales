import type { Permission } from '@/domain/entities/Permission';
import type { Role } from '@/domain/entities/Role';
import type { IRoleRepository, NewRole } from '@/domain/repositories/IRoleRepository';
import { query } from '@/infrastructure/db/pool';
import { mapRole } from '@/infrastructure/db/mappers';
import { ConflictError, NotFoundError } from '@/shared/errors';

export class PgRoleRepository implements IRoleRepository {
  async findById(id: string): Promise<Role | null> {
    const { rows } = await query('SELECT * FROM roles WHERE id = $1 AND deleted_at IS NULL', [id]);
    return rows[0] ? mapRole(rows[0]) : null;
  }

  async findByKey(key: string): Promise<Role | null> {
    const { rows } = await query('SELECT * FROM roles WHERE key = $1 AND deleted_at IS NULL', [key]);
    return rows[0] ? mapRole(rows[0]) : null;
  }

  async list(): Promise<Role[]> {
    const { rows } = await query(
      'SELECT * FROM roles WHERE deleted_at IS NULL ORDER BY is_system DESC, name ASC',
    );
    return rows.map(mapRole);
  }

  async create(data: NewRole): Promise<Role> {
    if (await this.findByKey(data.key)) {
      throw new ConflictError(`"${data.key}" kalitli rol allaqachon mavjud`);
    }
    const { rows } = await query(
      `INSERT INTO roles (key, name, description, permissions)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [data.key, data.name, data.description ?? null, data.permissions],
    );
    return mapRole(rows[0]!);
  }

  async update(
    id: string,
    patch: { name?: string; description?: string | null; permissions?: Permission[] },
  ): Promise<Role> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (col: string, value: unknown): void => {
      params.push(value);
      sets.push(`${col} = $${params.length}`);
    };

    if (patch.name !== undefined) push('name', patch.name);
    if (patch.description !== undefined) push('description', patch.description);
    if (patch.permissions !== undefined) push('permissions', patch.permissions);

    if (!sets.length) {
      const current = await this.findById(id);
      if (!current) throw new NotFoundError('Rol', id);
      return current;
    }

    params.push(id);
    const { rows } = await query(
      `UPDATE roles SET ${sets.join(', ')}
        WHERE id = $${params.length} AND deleted_at IS NULL RETURNING *`,
      params,
    );
    if (!rows[0]) throw new NotFoundError('Rol', id);
    return mapRole(rows[0]);
  }

  /** Rol bazadan yo'qolmaydi — belgilanadi (032-migratsiya). Tizim rollari tegilmaydi. */
  async remove(id: string): Promise<void> {
    await query(
      `UPDATE roles SET deleted_at = now()
        WHERE id = $1 AND is_system = FALSE AND deleted_at IS NULL`,
      [id],
    );
  }

  async countUsers(roleId: string): Promise<number> {
    const { rows } = await query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM users WHERE role_id = $1 AND deleted_at IS NULL',
      [roleId],
    );
    return rows[0]?.count ?? 0;
  }
}
