import crypto from 'node:crypto';
import type { ApiToken, NewApiToken } from '@/domain/entities/ApiToken';
import type { User } from '@/domain/entities/User';
import type { CreatedApiToken, IApiTokenRepository } from '@/domain/repositories/IApiTokenRepository';
import { query } from '@/infrastructure/db/pool';
import { mapUser, toDate } from '@/infrastructure/db/mappers';

const PREFIX = 'dbt_';

/** Kalit bazada ochiq saqlanmaydi — faqat xeshi. */
function hashKey(plainKey: string): string {
  return crypto.createHash('sha256').update(plainKey).digest('hex');
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapToken(r: Record<string, any>): ApiToken {
  return {
    id: r.id,
    name: r.name,
    tokenPrefix: r.token_prefix,
    userId: r.user_id,
    userEmail: r.user_email ?? '',
    roleName: r.role_name ?? '',
    expiresAt: toDate(r.expires_at),
    lastUsedAt: toDate(r.last_used_at),
    revokedAt: toDate(r.revoked_at),
    createdAt: toDate(r.created_at) ?? new Date(0),
  };
}

const SELECT_TOKEN = `
  SELECT t.*, u.email AS user_email, r.name AS role_name
    FROM api_tokens t
    JOIN users u ON u.id = t.user_id
    JOIN roles r ON r.id = u.role_id
`;

export class PgApiTokenRepository implements IApiTokenRepository {
  async list(): Promise<ApiToken[]> {
    const { rows } = await query(`${SELECT_TOKEN} ORDER BY t.created_at DESC`);
    return rows.map(mapToken);
  }

  async create(data: NewApiToken): Promise<CreatedApiToken> {
    // 32 bayt tasodifiy — taxmin qilib bo'lmaydi.
    const plainKey = `${PREFIX}${crypto.randomBytes(32).toString('base64url')}`;

    const { rows } = await query<{ id: string }>(
      `INSERT INTO api_tokens (name, token_hash, token_prefix, user_id, expires_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [
        data.name,
        hashKey(plainKey),
        plainKey.slice(0, PREFIX.length + 6),
        data.userId,
        data.expiresAt ?? null,
        data.createdBy ?? null,
      ],
    );

    const { rows: created } = await query(`${SELECT_TOKEN} WHERE t.id = $1`, [rows[0]!.id]);
    return { token: mapToken(created[0]!), plainKey };
  }

  async revoke(id: string): Promise<void> {
    await query('UPDATE api_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [id]);
  }

  /**
   * Kalitni tekshiradi va egasini rol bilan qaytaradi.
   * Bekor qilingan, muddati o'tgan yoki o'chirilgan hisob — rad etiladi.
   */
  async resolveUser(plainKey: string, now: Date): Promise<User | null> {
    if (!plainKey.startsWith(PREFIX)) return null;

    const { rows } = await query(
      `UPDATE api_tokens t
          SET last_used_at = $2
        WHERE t.token_hash = $1
          AND t.revoked_at IS NULL
          AND (t.expires_at IS NULL OR t.expires_at > $2)
        RETURNING t.user_id`,
      [hashKey(plainKey), now],
    );

    const userId = rows[0]?.user_id;
    if (!userId) return null;

    const { rows: users } = await query(
      `SELECT u.*,
              r.id AS r_id, r.key AS r_key, r.name AS r_name, r.description AS r_description,
              r.permissions AS r_permissions, r.is_system AS r_is_system,
              r.created_at AS r_created_at, r.updated_at AS r_updated_at
         FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.id = $1 AND u.is_active = TRUE AND u.deleted_at IS NULL`,
      [userId],
    );

    return users[0] ? mapUser(users[0]) : null;
  }
}
