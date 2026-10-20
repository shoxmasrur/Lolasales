import type { Client, NewClient, TelegramLookupStatus } from '@/domain/entities/Client';
import { aloqaSharti } from '@/domain/entities/aloqaHolati';
import type {
  BulkStartMismatch,
  BulkStartOutlook,
  BulkStartPreview,
  ClientDeletionSummary,
  ClientQuery,
  ClientListItem,
  ClientTabCounts,
  IClientRepository,
  TelegramIdentity,
} from '@/domain/repositories/IClientRepository';
import type { Page } from '@/domain/repositories/types';
import { pool, query, withTransaction } from '@/infrastructure/db/pool';
import { mapClient } from '@/infrastructure/db/mappers';
import { mijozQatori } from '@/infrastructure/db/repositories/mijozQatori';
import { mijozTartibi } from '@/infrastructure/db/repositories/mijozTartibi';
import { xaridShartlari } from '@/infrastructure/db/xaridSharti';
import { bulkOldindanSql } from '@/infrastructure/db/bulkOldindan';
import { kampaniyaNishonSql } from '@/infrastructure/db/kampaniyaSharti';
import type { CampaignFilters } from '@/domain/entities/Campaign';
import { NotFoundError, ValidationError } from '@/shared/errors';

// DIQQAT: yangi ustun qo'shilganda SHU RO'YXATGA ham qo'shish kerak — aks
// holda u bazada bo'lsa ham API'ga yetib bormaydi va `null` bo'lib ko'rinadi.
// `clientCols.spec.ts` `mapClient` o'qiydigan har bir ustun shu ro'yxatda
// borligini tekshiradi.
const COLS = `c.id, c.full_name, c.first_name, c.phone, c.extra_phones, c.telegram_user_id,
              c.telegram_username, c.telegram_name, c.telegram_access_hash,
              c.telegram_hash_account_id,
              c.telegram_status, c.telegram_checked_at,
              c.telegram_account_id, c.account_assigned_at,
              c.do_not_contact, c.notes, c.created_at, c.updated_at,
              c.deleted_at, c.deleted_by,
              c.source, c.source_group, c.source_comment`;

/**
 * O'chirilgan mijoz hech bir oddiy so'rovda ko'rinmaydi — buni bitta joyda
 * unutish "o'chirilgan mijozga xabar ketdi" degan xatoga olib keladi.
 * Shuning uchun filtr shu yerda nomlanadi va hamma joyda shu ishlatiladi.
 */
const ALIVE = 'c.deleted_at IS NULL';

/**
 * `search` va `searchAll` uchun ustunlar — ikkalasi bir xil qatorni
 * qaytarishi shart, aks holda `mijozQatori` biriga to'g'ri kelmay qoladi.
 */
const SEARCH_COLS = `${COLS},
                (SELECT COALESCE(NULLIF(btrim(ta.persona_name), ''), ta.label)
                   FROM telegram_accounts ta
                  WHERE ta.id = c.telegram_account_id) AS account_name`;

export class PgClientRepository implements IClientRepository {
  async findById(id: string, options?: { includeDeleted?: boolean }): Promise<Client | null> {
    const { rows } = await query(
      `SELECT ${COLS} FROM clients c WHERE c.id = $1 ${options?.includeDeleted ? '' : `AND ${ALIVE}`}`,
      [id],
    );
    return rows[0] ? mapClient(rows[0]) : null;
  }

  async findByPhone(phoneE164: string): Promise<Client | null> {
    const { rows } = await query(
      `SELECT ${COLS} FROM clients c
        WHERE (c.phone = $1 OR $1 = ANY(c.extra_phones)) AND ${ALIVE} LIMIT 1`,
      [phoneE164],
    );
    return rows[0] ? mapClient(rows[0]) : null;
  }

  async existingTelegramUserIds(tgUserIds: string[]): Promise<Set<string>> {
    if (!tgUserIds.length) return new Set();
    const { rows } = await query<{ telegram_user_id: string }>(
      `SELECT c.telegram_user_id FROM clients c WHERE c.telegram_user_id = ANY($1::text[]) AND ${ALIVE}`,
      [tgUserIds],
    );
    return new Set(rows.map((r) => r.telegram_user_id));
  }

  async findByTelegramUserId(tgUserId: string): Promise<Client | null> {
    const { rows } = await query(
      `SELECT ${COLS} FROM clients c WHERE c.telegram_user_id = $1 AND ${ALIVE}`,
      [tgUserId],
    );
    return rows[0] ? mapClient(rows[0]) : null;
  }

  /**
   * Filtr shartlarini bir joyda quradi.
   *
   * `search` va `searchIds` AYNAN bir xil to'plamni topishi shart:
   * "filtrdagi hammasini belgilash" ko'rsatilgan ro'yxatdan boshqa
   * mijozlarni belgilab qo'ysa, operator o'zi ko'rmagan odamlarga
   * xabar yuborib yuborardi.
   */
  private buildSearchBase(q: ClientQuery): { base: string; params: unknown[] } {
    // "deleted" tabi — savat: faqat o'chirilganlar. Qolgan hamma tab
    // faqat tirik mijozlarni ko'rsatadi.
    const where: string[] = [q.tab === 'deleted' ? 'c.deleted_at IS NOT NULL' : ALIVE];
    const params: unknown[] = [];

    if (q.search) {
      params.push(`%${q.search.trim()}%`);
      where.push(`(c.full_name ILIKE $${params.length} OR c.phone ILIKE $${params.length}
                   OR c.telegram_username ILIKE $${params.length})`);
    }
    // Bir nechta holat tanlansa — "yoki". Bo'sh ro'yxat filtr emas.
    if (q.telegramStatus?.length) {
      params.push(q.telegramStatus);
      where.push(`c.telegram_status = ANY($${params.length}::text[])`);
    }
    // Tab filtri — operatorning ish oqimi bo'yicha guruhlar.
    const hasConversation =
      'EXISTS (SELECT 1 FROM conversations cv WHERE cv.client_id = c.id AND cv.deleted_at IS NULL)';
    if (q.tab === 'new') where.push(`NOT ${hasConversation}`);
    if (q.tab === 'in_conversation') where.push(hasConversation);
    if (q.tab === 'no_telegram') {
      where.push(`c.telegram_status IN ('not_found', 'privacy_restricted', 'blocked', 'deactivated')`);
    }
    if (q.tab === 'needs_review') where.push(`c.telegram_status = 'name_mismatch'`);

    if (q.hasPhone === true) where.push(`c.phone IS NOT NULL`);
    if (q.hasPhone === false) where.push(`c.phone IS NULL`);
    // Shart parametrsiz: ichida faqat koddagi konstanta bor
    // (`aloqaHolati.ts` izohiga qarang).
    //
    // Qavsga OLINADI: shart o'zi bir nechta `EXISTS`/`NOT EXISTS`ni
    // `AND` bilan bog'laydi va bu yerda `where.join(' AND ')` orqali
    // boshqa filtrlar bilan qo'shiladi. Qavssiz bugun to'g'ri natija
    // beradi (hammasi `AND`), lekin ertaga shartga top darajali `OR`
    // qo'shilsa, u qavssiz holda BOSHQA filtrlar bilan ham
    // assotsiatsiyalanib, ro'yxatni jimgina kengaytirib yuborardi.
    if (q.aloqa) where.push(`(${aloqaSharti(q.aloqa)})`);

    where.push(...xaridShartlari(q, params));

    const base = `
      FROM clients c
      WHERE ${where.join(' AND ')}
    `;

    return { base, params };
  }

  async search(q: ClientQuery): Promise<Page<ClientListItem>> {
    const { base, params } = this.buildSearchBase(q);

    const order = mijozTartibi(q.sort);

    const limit = Math.min(q.limit ?? 50, 200);
    const offset = q.offset ?? 0;

    const [{ rows: countRows }, { rows }] = await Promise.all([
      query<{ count: number }>(`SELECT COUNT(*)::int AS count ${base}`, params),
      query(
        `SELECT ${SEARCH_COLS} ${base} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`,
        params,
      ),
    ]);

    const items: ClientListItem[] = rows.map(mijozQatori);

    return { items, total: countRows[0]?.count ?? 0, limit, offset };
  }

  /**
   * Filtrga tushgan HAMMA mijozning id'lari — sahifalashsiz.
   *
   * "Filtrdagi hammasini belgilash" uchun. Ro'yxat so'rovi 200 tagacha
   * qaytaradi (u ekran uchun), bu esa to'liq to'plamni beradi. Faqat
   * id'lar olinadi, shuning uchun javob minglab mijozda ham yengil qoladi.
   */
  async searchIds(q: ClientQuery): Promise<string[]> {
    const { base, params } = this.buildSearchBase(q);
    const { rows } = await query<{ id: string }>(`SELECT c.id ${base} ORDER BY c.id`, params);
    return rows.map((r) => r.id);
  }

  /**
   * Filtrga tushgan hamma qator — bo'laklab, BITTA tranzaksiya ichida.
   *
   * NEGA ODDIY `LIMIT/OFFSET` YETARLI EMAS: har bo'lak alohida so'rov
   * bo'lsa (READ COMMITTED), ikkita muammo chiqadi. Birinchi — har
   * bo'lak saralashni QAYTADAN hisoblab, `OFFSET` qatorlarini tashlab
   * yuboradi (O(n²)). Ikkinchi — bo'laklar orasida ma'lumot o'zgarishi
   * mumkin: mijoz o'chirilsa keyingi `OFFSET`lar bir pog'ona siljib,
   * o'rtadagi bittasi faylga umuman tushmay qoladi.
   *
   * YECHIM: `REPEATABLE READ` tranzaksiyasi ichida server tomonidagi
   * kursor (`DECLARE ... CURSOR` + `FETCH FORWARD`). BITTA so'rov rejasi,
   * BITTA saralash, BITTA baza suratiga (snapshot) qarab o'qiladi —
   * tranzaksiya boshlangandan keyingi har qanday yozish (qo'shish,
   * o'chirish) shu faylga ta'sir qilmaydi.
   *
   * Ulanish (`client`) ATAYLAB `pool`dan qo'lda olinadi (`withTransaction`
   * faqat oddiy `BEGIN` beradi, bizga esa izolyatsiya darajasi kerak) va
   * ICHKI `finally`da HAR DOIM yopiladi/qaytariladi — bu HTTP mijoz
   * yuklab olishni bekor qilib, generator erta `return()` bilan
   * to'xtatilgan holatni ham qamrab oladi.
   */
  async *searchAll(
    q: ClientQuery,
    batchSize = 500,
  ): AsyncGenerator<ClientListItem[]> {
    const { base, params } = this.buildSearchBase(q);
    const order = mijozTartibi(q.sort);

    const client = await pool.connect();
    try {
      await query('BEGIN ISOLATION LEVEL REPEATABLE READ', [], client, { skipSlowWarn: true });
      try {
        await query(
          `DECLARE mijozlar_eksport CURSOR FOR SELECT ${SEARCH_COLS} ${base} ORDER BY ${order}`,
          params,
          client,
          { skipSlowWarn: true },
        );
        for (;;) {
          const { rows } = await query(`FETCH FORWARD ${batchSize} FROM mijozlar_eksport`, [], client);
          if (rows.length === 0) return;
          yield rows.map(mijozQatori);
          if (rows.length < batchSize) return;
        }
      } finally {
        // Shu yerga UCHTA holatda ham kirib o'tiladi: oddiy tugash, xato
        // VA erta to'xtatish (masalan, HTTP mijoz yuklab olishni bekor
        // qilsa generator `return()` bilan yopiladi). Tranzaksiya biror
        // sababdan buzilgan bo'lsa `COMMIT` xato beradi — shunda
        // `ROLLBACK` bilan yakunlaymiz. Ikkalasi ham kursorni yopadi va
        // ulanishni tranzaksiyasiz holatda pool'ga qaytarishga tayyorlaydi.
        await client.query('COMMIT').catch(() => client.query('ROLLBACK').catch(() => undefined));
      }
    } finally {
      client.release();
    }
  }

  /** Tab tugmalari yonidagi sonlar — bitta so'rovda. */
  async tabCounts(): Promise<ClientTabCounts> {
    const alive = `c.deleted_at IS NULL`;
    const hasConv = `EXISTS (SELECT 1 FROM conversations cv WHERE cv.client_id = c.id AND cv.deleted_at IS NULL)`;

    const { rows } = await query<Record<string, number>>(`
      SELECT COUNT(*) FILTER (WHERE ${alive})::int AS all,
             COUNT(*) FILTER (WHERE ${alive} AND NOT ${hasConv})::int AS new,
             COUNT(*) FILTER (WHERE ${alive} AND ${hasConv})::int AS in_conversation,
             COUNT(*) FILTER (
               WHERE ${alive} AND c.telegram_status IN ('not_found', 'privacy_restricted', 'blocked', 'deactivated')
             )::int AS no_telegram,
             COUNT(*) FILTER (WHERE ${alive} AND c.telegram_status = 'name_mismatch')::int AS needs_review,
             COUNT(*) FILTER (WHERE c.deleted_at IS NOT NULL)::int AS deleted
        FROM clients c
    `);

    const r = rows[0] ?? {};
    return {
      all: Number(r.all ?? 0),
      new: Number(r.new ?? 0),
      in_conversation: Number(r.in_conversation ?? 0),
      no_telegram: Number(r.no_telegram ?? 0),
      needs_review: Number(r.needs_review ?? 0),
      deleted: Number(r.deleted ?? 0),
    };
  }

  /**
   * Mijozni yumshoq o'chirish — u va unga tegishli hamma narsa bitta
   * vaqt belgisi bilan belgilanadi.
   *
   * Bitta `deleted_at` qiymati ataylab: tiklashda aynan SHU partiyani
   * qaytaramiz. Aks holda ilgari (boshqa sabab bilan) o'chirilgan
   * suhbat ham mijoz bilan birga tirilib ketardi.
   *
   * Xabarlar (`messages`) suhbat orqali belgilanadi — ular hech qachon
   * mustaqil o'chirilmaydi.
   *
   * Vaqt belgisi HAR BIR so'rovda `now()` bilan qo'yiladi va JS tomoniga
   * chiqarilmaydi: `now()` tranzaksiya boshlanish vaqtini qaytaradi, ya'ni
   * hamma qatorga AYNAN bir xil qiymat tushadi. JS orqali aylantirilsa
   * mikrosoniyalar yo'qolib, mijoz bilan bolalarining qiymati farq qilib
   * qolardi va partiya bir-biriga bog'lanmay ketardi.
   */
  async softDelete(id: string, actor: string): Promise<ClientDeletionSummary> {
    return withTransaction(async (tx) => {
      const stamp = async (table: string, column: string): Promise<number> => {
        const { rowCount } = await query(
          `UPDATE ${table} SET deleted_at = now() WHERE ${column} = $1 AND deleted_at IS NULL`,
          [id],
          tx,
        );
        return rowCount ?? 0;
      };

      const conversations = await stamp('conversations', 'client_id');
      const campaignTargets = await stamp('campaign_targets', 'client_id');
      const profiles = await stamp('client_profiles', 'client_id');

      const { rowCount: messages } = await query(
        `UPDATE messages m SET deleted_at = now()
           FROM conversations cv
          WHERE cv.id = m.conversation_id AND cv.client_id = $1
            AND m.deleted_at IS NULL`,
        [id],
        tx,
      );

      // Mijozning o'zi oxirida — shu paytgacha bolalar allaqachon belgilangan.
      const { rows } = await query<{ deleted_at: Date }>(
        `UPDATE clients SET deleted_at = now(), deleted_by = $2
          WHERE id = $1 AND deleted_at IS NULL
          RETURNING deleted_at`,
        [id, actor],
        tx,
      );
      if (!rows[0]) throw new NotFoundError('Mijoz', id);
      const at = rows[0].deleted_at;

      return {
        deletedAt: at,
        conversations,
        messages: messages ?? 0,
        campaignTargets,
        profiles,
      };
    });
  }

  /**
   * O'chirishni bekor qilish — o'sha partiyadagi qatorlar qaytariladi.
   *
   * Tiklash muvaffaqiyatsiz bo'lishi mumkin: mijoz o'chirilgandan keyin
   * o'sha Telegram profili bilan YANGI mijoz yaratilgan bo'lsa, unique
   * indeks tiklashga yo'l bermaydi. Bu holatda
   * tushunarli xato beramiz — bazani jimgina buzib qo'ymaymiz.
   */
  async restore(id: string): Promise<ClientDeletionSummary> {
    try {
      return await this.restoreInTransaction(id);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new ValidationError(
          'Tiklab bo\'lmadi: bu mijozning Telegram profili boshqa (yangi) mijozda band. '
          + 'Avval o\'sha yozuvni tekshiring.',
        );
      }
      throw err;
    }
  }

  private async restoreInTransaction(id: string): Promise<ClientDeletionSummary> {
    return withTransaction(async (tx) => {
      const { rows } = await query<{ deleted_at: Date }>(
        `SELECT deleted_at FROM clients WHERE id = $1 AND deleted_at IS NOT NULL`,
        [id],
        tx,
      );
      if (!rows[0]) throw new NotFoundError('O\'chirilgan mijoz', id);
      const at = rows[0].deleted_at;

      // Taqqoslash bazaning o'zida bajariladi (`BATCH` quyi so'rovi) — JS
      // Date orqali o'tkazilsa mikrosoniyalar kesilib, hech bir qator
      // topilmasdi. Mijozning belgisi eng oxirida olib tashlanadi.
      const BATCH = '(SELECT deleted_at FROM clients WHERE id = $1)';

      const unstamp = async (table: string, column: string): Promise<number> => {
        const { rowCount } = await query(
          `UPDATE ${table} SET deleted_at = NULL WHERE ${column} = $1 AND deleted_at = ${BATCH}`,
          [id],
          tx,
        );
        return rowCount ?? 0;
      };

      const { rowCount: messages } = await query(
        `UPDATE messages m SET deleted_at = NULL
           FROM conversations cv
          WHERE cv.id = m.conversation_id AND cv.client_id = $1
            AND m.deleted_at = ${BATCH}`,
        [id],
        tx,
      );

      const conversations = await unstamp('conversations', 'client_id');
      const campaignTargets = await unstamp('campaign_targets', 'client_id');
      const profiles = await unstamp('client_profiles', 'client_id');

      await query('UPDATE clients SET deleted_at = NULL, deleted_by = NULL WHERE id = $1', [id], tx);

      return {
        deletedAt: at,
        conversations,
        messages: messages ?? 0,
        campaignTargets,
        profiles,
      };
    });
  }

  async findCampaignTargets(filters: CampaignFilters): Promise<string[]> {
    const { sql, params } = kampaniyaNishonSql(filters);
    const { rows } = await query<{ client_id: string }>(sql, params);
    return rows.map((r) => r.client_id);
  }

  async create(data: NewClient): Promise<Client> {
    const tg = data.telegram;
    const { rows } = await query(
      `INSERT INTO clients (full_name, first_name, phone, extra_phones, notes,
                            created_import_batch_id, source, source_group, source_comment,
                            telegram_user_id, telegram_username, telegram_access_hash,
                            telegram_hash_account_id, telegram_name, telegram_status,
                            telegram_checked_at, telegram_account_id, account_assigned_at)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'qolda'), $8, $9,
               $10, $11, $12, $13, $14, CASE WHEN $10::text IS NULL THEN 'unknown' ELSE 'found' END,
               CASE WHEN $10::text IS NULL THEN NULL ELSE now() END, $15,
               CASE WHEN $15::uuid IS NULL THEN NULL ELSE now() END)
       RETURNING *`,
      [
        data.fullName, data.firstName ?? null, data.phone ?? null,
        data.extraPhones ?? [], data.notes ?? null, data.createdImportBatchId ?? null,
        data.source ?? null, data.sourceGroup ?? null, data.sourceComment ?? null,
        tg?.telegramUserId ?? null, tg?.telegramUsername ?? null, tg?.telegramAccessHash ?? null,
        tg?.telegramHashAccountId ?? null, tg?.telegramName ?? null, tg?.telegramAccountId ?? null,
      ],
    );
    return mapClient(rows[0]!);
  }

  async update(id: string, patch: Partial<NewClient> & { doNotContact?: boolean }): Promise<Client> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (col: string, value: unknown) => {
      params.push(value);
      sets.push(`${col} = $${params.length}`);
    };

    if (patch.fullName !== undefined) push('full_name', patch.fullName);
    if (patch.firstName !== undefined) push('first_name', patch.firstName);
    if (patch.phone !== undefined) push('phone', patch.phone);
    if (patch.extraPhones !== undefined) push('extra_phones', patch.extraPhones);
    if (patch.notes !== undefined) push('notes', patch.notes);
    if (patch.doNotContact !== undefined) push('do_not_contact', patch.doNotContact);
    if (!sets.length) {
      const current = await this.findById(id);
      if (!current) throw new NotFoundError('Mijoz', id);
      return current;
    }

    params.push(id);
    // O'chirilgan mijozni tahrirlab bo'lmaydi — avval tiklash kerak.
    const { rows } = await query(
      `UPDATE clients SET ${sets.join(', ')}
        WHERE id = $${params.length} AND deleted_at IS NULL RETURNING *`,
      params,
    );
    if (!rows[0]) throw new NotFoundError('Mijoz', id);
    return mapClient(rows[0]);
  }

  async setTelegramName(id: string, name: string | null): Promise<void> {
    await query('UPDATE clients SET telegram_name = $2 WHERE id = $1 AND deleted_at IS NULL', [id, name]);
  }

  async setTelegramIdentity(
    id: string,
    identity: TelegramIdentity,
    status: TelegramLookupStatus,
  ): Promise<Client> {
    const { rows } = await query(
      `UPDATE clients
         SET telegram_user_id = $2, telegram_username = $3, telegram_access_hash = $4,
             telegram_status = $5, telegram_name = $6, telegram_checked_at = now(),
             telegram_hash_account_id = $7
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [
        id,
        identity.telegramUserId,
        identity.telegramUsername ?? null,
        identity.telegramAccessHash ?? null,
        status,
        identity.telegramName ?? null,
        identity.telegramHashAccountId,
      ],
    );
    if (!rows[0]) throw new NotFoundError('Mijoz', id);
    return mapClient(rows[0]);
  }

  async setTelegramStatus(id: string, status: TelegramLookupStatus): Promise<Client> {
    const { rows } = await query(
      `UPDATE clients SET telegram_status = $2, telegram_checked_at = now()
        WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id, status],
    );
    if (!rows[0]) throw new NotFoundError('Mijoz', id);
    return mapClient(rows[0]);
  }

  /**
   * `telegram_checked_at` ham tozalanadi: tekshiruv vaqti qolsa, mijoz
   * "yaqinda qidirilgan" ko'rinib, qayta qidiruv navbatidan tushib
   * qolardi — va boshqa to'g'ri raqami bo'lsa ham unga yetib bormasdik.
   */
  async clearTelegramIdentity(id: string): Promise<void> {
    await query(
      `UPDATE clients
          SET telegram_user_id = NULL,
              telegram_username = NULL,
              telegram_access_hash = NULL,
              telegram_status = 'unknown',
              telegram_checked_at = NULL
        WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
  }

  async assignAccount(clientId: string, accountId: string): Promise<Client> {
    const { rows } = await query(
      `UPDATE clients SET telegram_account_id = $2, account_assigned_at = now()
        WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [clientId, accountId],
    );
    if (!rows[0]) throw new NotFoundError('Mijoz', clientId);
    return mapClient(rows[0]);
  }

  /**
   * Ko'p mijozni bir yo'la biriktirish — bitta tranzaksiya, bitta so'rov.
   *
   * `unnest` bilan ikki massiv jadvalga aylantiriladi va `UPDATE ... FROM`
   * hammasini bir marta yangilaydi. 5000 ta round-trip o'rniga bitta so'rov,
   * va yarim bajarilgan taqsimot bo'lishi mumkin emas: xatoda `withTransaction`
   * ROLLBACK qiladi.
   */
  async assignAccounts(assignments: Array<{ clientId: string; accountId: string }>): Promise<number> {
    // Bo'sh ro'yxatda bazaga umuman bormaymiz.
    if (!assignments.length) return 0;

    const clientIds = assignments.map((a) => a.clientId);
    const accountIds = assignments.map((a) => a.accountId);

    return withTransaction(async (tx) => {
      const { rowCount } = await query(
        `UPDATE clients c
            SET telegram_account_id = v.account_id,
                account_assigned_at = now()
           FROM unnest($1::uuid[], $2::uuid[]) AS v(client_id, account_id)
          WHERE c.id = v.client_id
            AND c.deleted_at IS NULL`,
        [clientIds, accountIds],
        tx,
      );
      return rowCount ?? 0;
    });
  }

  async findUnassigned(limit: number): Promise<string[]> {
    const { rows } = await query<{ id: string }>(
      `SELECT id FROM clients c
        WHERE telegram_account_id IS NULL AND do_not_contact = FALSE AND deleted_at IS NULL
        ORDER BY created_at ASC LIMIT $1`,
      [limit],
    );
    return rows.map((r) => r.id);
  }

  async countByAccount(): Promise<Array<{ accountId: string; count: number }>> {
    const { rows } = await query<{ account_id: string; count: number }>(
      `SELECT telegram_account_id AS account_id, COUNT(*)::int AS count
         FROM clients WHERE telegram_account_id IS NOT NULL AND deleted_at IS NULL
        GROUP BY telegram_account_id`,
    );
    return rows.map((r) => ({ accountId: r.account_id, count: r.count }));
  }

  async countConversationClientsByAccount(): Promise<Array<{ accountId: string; count: number }>> {
    const { rows } = await query<{ account_id: string; count: number }>(
      `SELECT cv.telegram_account_id AS account_id, COUNT(DISTINCT cv.client_id)::int AS count
         FROM conversations cv
         JOIN clients c ON c.id = cv.client_id
        WHERE cv.telegram_account_id IS NOT NULL
          AND cv.deleted_at IS NULL
          AND c.deleted_at IS NULL
        GROUP BY cv.telegram_account_id`,
    );
    return rows.map((r) => ({ accountId: r.account_id, count: r.count }));
  }

  async countNotFoundByAccount(): Promise<Array<{ accountId: string; count: number }>> {
    const { rows } = await query<{ account_id: string; count: number }>(
      `SELECT telegram_account_id AS account_id, COUNT(*)::int AS count
         FROM clients
        WHERE telegram_account_id IS NOT NULL
          AND deleted_at IS NULL
          AND telegram_status = 'not_found'
        GROUP BY telegram_account_id`,
    );
    return rows.map((r) => ({ accountId: r.account_id, count: r.count }));
  }

  async releaseAccount(accountId: string): Promise<number> {
    const { rowCount } = await query(
      `UPDATE clients SET telegram_account_id = NULL, account_assigned_at = NULL
        WHERE telegram_account_id = $1`,
      [accountId],
    );
    return rowCount ?? 0;
  }

  async findPendingTelegramLookup(limit: number): Promise<Client[]> {
    const { rows } = await query(
      `SELECT ${COLS} FROM clients c
        WHERE c.phone IS NOT NULL
          AND c.do_not_contact = FALSE
          AND c.telegram_status = 'unknown'
          AND ${ALIVE}
        ORDER BY c.created_at ASC
        LIMIT $1`,
      [limit],
    );
    return rows.map(mapClient);
  }

  /**
   * Ommaviy boshlashdan oldingi tekshiruv.
   *
   * CASE tartibi `StartConversationUseCase.execute` dagi tekshiruvlar
   * tartibini AYNAN takrorlaydi — aks holda dialogda aytilgan sabab ish
   * paytida chiqadigan sababdan boshqacha bo'lib qolardi.
   *
   * `needs_lookup` — Telegramda qidiriladi (hali qidirilmagan yoki oldin
   * topilmagan). Natijasini oldindan aytib bo'lmaydi, shuning uchun uni
   * "ketadi" deb ham, "ketmaydi" deb ham ko'rsatmaymiz.
   */
  async previewBulkStart(clientIds: string[]): Promise<BulkStartPreview> {
    const counts: Record<BulkStartOutlook, number> = {
      ready: 0,
      name_mismatch: 0,
      needs_lookup: 0,
      do_not_contact: 0,
      blocked: 0,
      deactivated: 0,
      no_phone: 0,
      already_started: 0,
    };
    // accountPlan/reassigned — akkaunt tanlovi bo'yicha taqsimot; buni
    // `BulkStartPlanner` hisoblaydi (chaqiruvchi tomonda, akkauntlar
    // tanlanganda). Bu yerda hali akkaunt tanlanmagan holat uchun bo'sh.
    if (!clientIds.length) return { total: 0, counts, mismatches: [], accountPlan: [], reassigned: 0 };

    const { rows } = await query<{
      id: string;
      full_name: string;
      telegram_name: string | null;
      phone: string | null;
      outlook: BulkStartOutlook;
    }>(
      bulkOldindanSql(ALIVE),
      [clientIds],
    );

    const mismatches: BulkStartMismatch[] = [];
    for (const row of rows) {
      counts[row.outlook] += 1;
      if (row.outlook === 'name_mismatch') {
        mismatches.push({
          id: row.id,
          fullName: row.full_name,
          telegramName: row.telegram_name,
          phone: row.phone,
        });
      }
    }

    return { total: rows.length, counts, mismatches, accountPlan: [], reassigned: 0 };
  }

  async findReassignableForBulkStart(clientIds: string[]): Promise<string[]> {
    if (!clientIds.length) return [];

    const { rows } = await query<{ id: string }>(
      `SELECT c.id
         FROM clients c
        WHERE c.id = ANY($1::uuid[])
          AND c.deleted_at IS NULL
          AND c.do_not_contact = FALSE
          AND c.telegram_status NOT IN ('blocked', 'deactivated')
          AND (c.phone IS NOT NULL OR c.telegram_user_id IS NOT NULL)
          -- Chiquvchi xabar — akkauntni muzlatuvchi yagona dalil.
          -- Qoralama hisobga olinmaydi: u hech qayerga ketmagan.
          AND NOT EXISTS (
                SELECT 1
                  FROM conversations cv
                  JOIN messages m ON m.conversation_id = cv.id
                 WHERE cv.client_id = c.id
                   AND cv.deleted_at IS NULL
                   AND m.direction = 'out'
                   AND m.status <> 'draft'
              )
        ORDER BY c.id`,
      [clientIds],
    );
    return rows.map((r) => r.id);
  }
}
