import type { User } from '@/domain/entities/User';
import type {
  FailedLoginState,
  IUserRepository,
  NewUser,
  UserPatch,
} from '@/domain/repositories/IUserRepository';
import { query } from '@/infrastructure/db/pool';
import { mapUser } from '@/infrastructure/db/mappers';
import { NotFoundError } from '@/shared/errors';

// Foydalanuvchi doim roli bilan birga o'qiladi — huquq tekshiruvi shunga tayanadi.
const SELECT_USER = `
  SELECT u.*,
         r.id AS r_id, r.key AS r_key, r.name AS r_name, r.description AS r_description,
         r.permissions AS r_permissions, r.is_system AS r_is_system,
         r.created_at AS r_created_at, r.updated_at AS r_updated_at
    FROM users u
    JOIN roles r ON r.id = u.role_id
`;

// O'chirilgan xodim tizimga kira olmaydi va ro'yxatda ko'rinmaydi, lekin
// uning yozgan xabarlari va audit izlari joyida qoladi (032-migratsiya).
const ALIVE = 'u.deleted_at IS NULL';

export class PgUserRepository implements IUserRepository {
  async findById(id: string): Promise<User | null> {
    const { rows } = await query(`${SELECT_USER} WHERE u.id = $1 AND ${ALIVE}`, [id]);
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const { rows } = await query(`${SELECT_USER} WHERE lower(u.email) = lower($1) AND ${ALIVE}`, [email]);
    return rows[0] ? mapUser(rows[0]) : null;
  }

  async list(): Promise<User[]> {
    const { rows } = await query(`${SELECT_USER} WHERE ${ALIVE} ORDER BY u.created_at ASC`);
    return rows.map(mapUser);
  }

  async create(data: NewUser): Promise<User> {
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, full_name, role_id)
       VALUES (lower($1),$2,$3,$4) RETURNING id`,
      [data.email, data.passwordHash, data.fullName, data.roleId],
    );
    const created = await this.findById(rows[0]!.id);
    if (!created) throw new NotFoundError('Foydalanuvchi');
    return created;
  }

  async update(id: string, patch: UserPatch): Promise<User> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (col: string, value: unknown): void => {
      params.push(value);
      sets.push(`${col} = $${params.length}`);
    };

    if (patch.fullName !== undefined) push('full_name', patch.fullName);
    if (patch.roleId !== undefined) push('role_id', patch.roleId);
    if (patch.passwordHash !== undefined) push('password_hash', patch.passwordHash);
    if (patch.isActive !== undefined) push('is_active', patch.isActive);

    if (sets.length) {
      params.push(id);
      const { rowCount } = await query(
        `UPDATE users SET ${sets.join(', ')} WHERE id = $${params.length} AND deleted_at IS NULL`,
        params,
      );
      if (!rowCount) throw new NotFoundError('Foydalanuvchi', id);
    }

    const updated = await this.findById(id);
    if (!updated) throw new NotFoundError('Foydalanuvchi', id);
    return updated;
  }

  /**
  * Xodim bazadan yo'qolmaydi — belgilanadi va o'chiriladi.
  *
  * `is_active = FALSE` bilan aralashtirmaslik kerak: u vaqtincha to'xtatish,
  * ro'yxatda TURADI. `deleted_at` — ro'yxatdan butunlay chiqarish.
  */
  async remove(id: string): Promise<void> {
    await query(
      `UPDATE users SET deleted_at = now(), is_active = FALSE
        WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
  }

  async count(): Promise<number> {
    const { rows } = await query<{ count: number }>('SELECT COUNT(*)::int AS count FROM users WHERE deleted_at IS NULL');
    return rows[0]?.count ?? 0;
  }

  async countActiveWithPermission(permission: string): Promise<number> {
    const { rows } = await query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
         FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.is_active = TRUE AND u.deleted_at IS NULL AND $1 = ANY(r.permissions)`,
      [permission],
    );
    return rows[0]?.count ?? 0;
  }

  async registerFailedLogin(id: string, maxAttempts: number): Promise<FailedLoginState> {
    const { rows } = await query<{ failed_login_attempts: number; locked_at: string | null }>(
      `UPDATE users
          SET failed_login_attempts = failed_login_attempts + 1,
              last_failed_login_at = now(),
              -- Allaqachon bloklangan bo'lsa vaqt YANGILANMAYDI: hisob
              -- qachon bloklangani auditda aniq qolishi kerak.
              locked_at = CASE
                WHEN locked_at IS NULL AND failed_login_attempts + 1 >= $2 THEN now()
                ELSE locked_at
              END,
              updated_at = now()
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING failed_login_attempts, locked_at`,
      [id, maxAttempts],
    );

    const row = rows[0];
    if (!row) return { attempts: 0, locked: false };
    return { attempts: Number(row.failed_login_attempts), locked: row.locked_at !== null };
  }

  async clearLoginFailures(id: string): Promise<void> {
    await query(
      `UPDATE users
          SET failed_login_attempts = 0, locked_at = NULL, last_failed_login_at = NULL,
              updated_at = now()
        WHERE id = $1`,
      [id],
    );
  }
}
