import {
  DEFAULT_DAILY_LIMIT,
  DEFAULT_LOOKUP_LIMIT,
  type SpamStatus,
  type TelegramAccount,
  type TelegramAccountStatus,
} from '@/domain/entities/TelegramAccount';
import type { StyleVersion } from '@/domain/entities/UslubVersiyasi';
import type {
  ITelegramAccountRepository,
  NewTelegramAccount,
} from '@/domain/repositories/ITelegramAccountRepository';
import { query, withTransaction } from '@/infrastructure/db/pool';
import { mapTelegramAccount } from '@/infrastructure/db/mappers';
import { encrypt } from '@/shared/crypto';
import { NotFoundError } from '@/shared/errors';
import type { TelegramProxyPatch } from '@/domain/entities/telegramProxy';

export class PgTelegramAccountRepository implements ITelegramAccountRepository {
  // O'chirilgan akkaunt (deleted_at NOT NULL) hech bir so'rovda ko'rinmaydi —
  // u faqat tarix uchun bazada qoladi.

  async findById(id: string): Promise<TelegramAccount | null> {
    const { rows } = await query(
      'SELECT * FROM telegram_accounts WHERE id = $1 AND deleted_at IS NULL',
      [id],
    );
    return rows[0] ? mapTelegramAccount(rows[0]) : null;
  }

  async findByPhone(phone: string): Promise<TelegramAccount | null> {
    const { rows } = await query(
      'SELECT * FROM telegram_accounts WHERE phone = $1 AND deleted_at IS NULL',
      [phone],
    );
    return rows[0] ? mapTelegramAccount(rows[0]) : null;
  }

  async list(): Promise<TelegramAccount[]> {
    const { rows } = await query(
      'SELECT * FROM telegram_accounts WHERE deleted_at IS NULL ORDER BY created_at ASC',
    );
    return rows.map(mapTelegramAccount);
  }

  async listConnected(): Promise<TelegramAccount[]> {
    const { rows } = await query(
      `SELECT * FROM telegram_accounts
        WHERE status = 'connected' AND is_enabled = TRUE AND deleted_at IS NULL
        ORDER BY sent_today ASC, created_at ASC`,
    );
    return rows.map(mapTelegramAccount);
  }

  async create(data: NewTelegramAccount): Promise<TelegramAccount> {
    const { rows } = await query(
      `INSERT INTO telegram_accounts
         (label, phone, api_id, api_hash_enc, daily_limit, persona_name, lookup_limit)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        data.label,
        data.phone,
        data.apiId,
        encrypt(data.apiHash),
        data.dailyLimit ?? DEFAULT_DAILY_LIMIT,
        data.personaName ?? null,
        data.lookupLimit ?? DEFAULT_LOOKUP_LIMIT,
      ],
    );
    return mapTelegramAccount(rows[0]!);
  }

  async saveSession(id: string, session: string): Promise<TelegramAccount> {
    const { rows } = await query(
      'UPDATE telegram_accounts SET session_enc = $2 WHERE id = $1 RETURNING *',
      [id, encrypt(session)],
    );
    if (!rows[0]) throw new NotFoundError('Telegram akkaunt', id);
    return mapTelegramAccount(rows[0]);
  }

  async setStatus(
    id: string,
    status: TelegramAccountStatus,
    extra?: { statusMessage?: string | null; tgUserId?: string | null; tgUsername?: string | null },
  ): Promise<TelegramAccount> {
    const { rows } = await query(
      `UPDATE telegram_accounts
          SET status = $2,
              status_message = $3,
              tg_user_id = COALESCE($4, tg_user_id),
              tg_username = COALESCE($5, tg_username)
        WHERE id = $1 RETURNING *`,
      [id, status, extra?.statusMessage ?? null, extra?.tgUserId ?? null, extra?.tgUsername ?? null],
    );
    if (!rows[0]) throw new NotFoundError('Telegram akkaunt', id);
    return mapTelegramAccount(rows[0]);
  }

  async setFloodWait(id: string, until: Date): Promise<void> {
    // `flood_wait_since` faqat YANGI cheklovda yoziladi: eski muddat
    // allaqachon o'tgan bo'lsa yoki umuman bo'lmasa. Cheklov davom
    // etayotganda tegilmaydi — aks holda har xatoda "qachondan beri"
    // oldinga siljib, cheklov qancha cho'zilayotgani ko'rinmay qolardi.
    await query(
      `UPDATE telegram_accounts
          SET flood_wait_until = $2,
              flood_wait_since = CASE
                WHEN flood_wait_until IS NULL OR flood_wait_until <= now()
                  THEN now()
                ELSE flood_wait_since
              END
        WHERE id = $1`,
      [id, until],
    );
  }

  async markPeerFlood(id: string): Promise<void> {
    await query(
      `UPDATE telegram_accounts
          SET peer_flood_since = COALESCE(peer_flood_since, now())
        WHERE id = $1`,
      [id],
    );
  }

  async clearPeerFlood(id: string): Promise<void> {
    await query('UPDATE telegram_accounts SET peer_flood_since = NULL WHERE id = $1', [id]);
  }

  async setSpamStatus(
    id: string,
    status: SpamStatus,
    extra?: { message?: string | null; until?: Date | null },
  ): Promise<TelegramAccount> {
    const { rows } = await query(
      `UPDATE telegram_accounts
          SET spam_status = $2, spam_message = $3, spam_until = $4, spam_checked_at = now()
        WHERE id = $1 RETURNING *`,
      [id, status, extra?.message ?? null, extra?.until ?? null],
    );
    if (!rows[0]) throw new NotFoundError('Telegram akkaunt', id);
    return mapTelegramAccount(rows[0]);
  }

  /** Kun almashsa hisoblagich noldan boshlanadi — bitta atomik so'rovda. */
  async incrementSentToday(id: string, todayIso: string): Promise<number> {
    const { rows } = await query<{ sent_today: number }>(
      `UPDATE telegram_accounts
          SET sent_today    = CASE WHEN counter_date = $2::date THEN sent_today + 1 ELSE 1 END,
              -- Kun almashgan bo'lsa qidiruv hisoblagichi ham nolga tushadi:
              -- ikkalasi bitta counter_date ustunini bo'lishadi.
              lookups_today = CASE WHEN counter_date = $2::date THEN lookups_today ELSE 0 END,
              counter_date  = $2::date
        WHERE id = $1
        RETURNING sent_today`,
      [id, todayIso],
    );
    return rows[0]?.sent_today ?? 0;
  }

  /** Qidiruv hisoblagichi ham kun almashsa noldan boshlanadi — bitta atomik so'rovda. */
  async incrementLookupsToday(id: string, todayIso: string): Promise<number> {
    const { rows } = await query<{ lookups_today: number }>(
      `UPDATE telegram_accounts
          SET lookups_today = CASE WHEN counter_date = $2::date THEN lookups_today + 1 ELSE 1 END,
              sent_today    = CASE WHEN counter_date = $2::date THEN sent_today ELSE 0 END,
              counter_date  = $2::date
        WHERE id = $1
        RETURNING lookups_today`,
      [id, todayIso],
    );
    return rows[0]?.lookups_today ?? 0;
  }

  /**
   * Bugungi hisoblagichni nolga tushiradi.
   *
   * `counter_date` ham bugungi kunga qo'yiladi: aks holda hisoblagich eski
   * sanada qolib, keyingi yuborishda `sent_today = 1` dan boshlanardi va
   * operator nechta xabar ketganini ko'ra olmasdi.
   */
  async resetSentToday(id: string, todayIso: string): Promise<TelegramAccount> {
    const { rows } = await query(
      `UPDATE telegram_accounts
          SET sent_today = 0, lookups_today = 0, counter_date = $2::date
        WHERE id = $1
        RETURNING *`,
      [id, todayIso],
    );
    if (!rows[0]) throw new NotFoundError('Telegram akkaunt', id);
    return mapTelegramAccount(rows[0]);
  }

  async update(
    id: string,
    patch: {
      label?: string;
      dailyLimit?: number;
      isEnabled?: boolean;
      personaName?: string | null;
      lookupLimit?: number;
      /** `null` — proksini butunlay o'chirish. */
      proxy?: TelegramProxyPatch | null;
      styleVersion?: StyleVersion;
      /** `null` — standart yo'lga (Claude, .env) qaytarish. */
      llmModelId?: string | null;
    },
  ): Promise<TelegramAccount> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (col: string, value: unknown) => {
      params.push(value);
      sets.push(`${col} = $${params.length}`);
    };
    if (patch.label !== undefined) push('label', patch.label);
    if (patch.dailyLimit !== undefined) push('daily_limit', patch.dailyLimit);
    if (patch.isEnabled !== undefined) push('is_enabled', patch.isEnabled);
    if (patch.personaName !== undefined) push('persona_name', patch.personaName);
    if (patch.lookupLimit !== undefined) push('lookup_limit', patch.lookupLimit);
    if (patch.styleVersion !== undefined) push('style_version', patch.styleVersion);
    if (patch.llmModelId !== undefined) push('llm_model_id', patch.llmModelId);
    if (patch.proxy !== undefined) {
      if (patch.proxy === null) {
        push('proxy_host', null);
        push('proxy_port', null);
        push('proxy_username', null);
        push('proxy_password_enc', null);
      } else {
        push('proxy_host', patch.proxy.host);
        push('proxy_port', patch.proxy.port);
        push('proxy_username', patch.proxy.username);
        // `undefined` — parolga tegilmaydi (panel uni qaytarib
        // ko'rsatmaydi, bo'sh maydon "o'chir" degani emas).
        if (patch.proxy.password !== undefined) {
          push('proxy_password_enc', patch.proxy.password ? encrypt(patch.proxy.password) : null);
        }
      }
    }

    if (!sets.length) {
      const current = await this.findById(id);
      if (!current) throw new NotFoundError('Telegram akkaunt', id);
      return current;
    }

    params.push(id);
    const { rows } = await query(
      `UPDATE telegram_accounts SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params,
    );
    if (!rows[0]) throw new NotFoundError('Telegram akkaunt', id);
    return mapTelegramAccount(rows[0]);
  }

  /**
   * Yumshoq o'chirish: yozuv bazada qoladi, lekin hech qayerda ko'rinmaydi.
   *
   * Uch ish bir tranzaksiyada bajariladi:
   *   1. `deleted_at` qo'yiladi va akkaunt o'chiriladi (`is_enabled = FALSE`);
   *   2. sessiya tozalanadi — o'chirilgan akkauntning shifrlangan sessiyasini
   *      saqlab turishning ma'nosi yo'q va bu xavfsizlik uchun ham keraksiz;
   *   3. mijozlar va suhbatlar bu akkauntdan uziladi — aks holda ular
   *      ko'rinmaydigan akkauntga biriktirilgan bo'lib qolar va ularga
   *      umuman xabar ketmasdi.
   *
   * Eski suhbatlarning `telegram_account_id` si ham tozalanadi, lekin
   * xabarlarning o'zi joyida qoladi — tarix yo'qolmaydi.
   */
  async remove(id: string): Promise<void> {
    await withTransaction(async (client) => {
      const { rowCount } = await query(
        `UPDATE telegram_accounts
            SET deleted_at = now(), is_enabled = FALSE, session_enc = NULL,
                status = 'logged_out', status_message = 'O''chirilgan'
          WHERE id = $1 AND deleted_at IS NULL`,
        [id],
        client,
      );
      if (!rowCount) throw new NotFoundError('Telegram akkaunt', id);

      await query(
        'UPDATE clients SET telegram_account_id = NULL WHERE telegram_account_id = $1',
        [id],
        client,
      );
      await query(
        'UPDATE conversations SET telegram_account_id = NULL WHERE telegram_account_id = $1',
        [id],
        client,
      );
    });
  }
}
