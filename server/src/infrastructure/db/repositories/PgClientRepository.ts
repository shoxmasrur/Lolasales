import type { Client, NewClient, TelegramLookupStatus } from '@/domain/entities/Client';
import { aloqaSharti } from '@/domain/entities/aloqaHolati';
import {
  holatniAniqla,
  holatSqlQiymatlari,
  YOZILADIGAN_SQL_QIYMATLARI,
} from '@/domain/entities/shartnomaHolati';
import type {
  BulkStartMismatch,
  BulkStartOutlook,
  BulkStartPreview,
  ClientDeletionSummary,
  ClientQuery,
  ClientTabCounts,
  ClientWithDebt,
  ContractStatusOption,
  IClientRepository,
  TelegramIdentity,
} from '@/domain/repositories/IClientRepository';
import type { Page } from '@/domain/repositories/types';
import { pool, query, withTransaction } from '@/infrastructure/db/pool';
import { mapClient } from '@/infrastructure/db/mappers';
import { mijozQatori } from '@/infrastructure/db/repositories/mijozQatori';
import { mijozTartibi } from '@/infrastructure/db/repositories/mijozTartibi';
import { HAMMASI, type MijozQamrovi } from '@/domain/entities/MijozQamrovi';
import { xaridShartlari } from '@/infrastructure/db/xaridSharti';
import { kampaniyaNishonSql } from '@/infrastructure/db/kampaniyaSharti';
import type { CampaignFilters } from '@/domain/entities/Campaign';
import { mijozQamroviSharti } from '@/infrastructure/db/qamrovSharti';
import { NotFoundError, ValidationError } from '@/shared/errors';

// DIQQAT: yangi ustun qo'shilganda SHU RO'YXATGA ham qo'shish kerak — aks
// holda u bazada bo'lsa ham API'ga yetib bormaydi va `null` bo'lib ko'rinadi.
// `nomalum` shu yerda yo'qligi butun himoyani o'chirib qo'ygan edi (har qidiruv
// `nomalum:false` qaytargan) — endi `clientCols.spec.ts` `mapClient` o'qiydigan
// har bir ustun shu ro'yxatda borligini tekshiradi.
const COLS = `c.id, c.external_id, c.full_name, c.first_name, c.phone, c.extra_phones, c.telegram_user_id,
              c.telegram_username, c.telegram_name, c.telegram_access_hash,
              c.telegram_hash_account_id,
              c.telegram_status, c.telegram_checked_at,
              c.telegram_account_id, c.account_assigned_at,
              c.do_not_contact, c.notes, c.created_at, c.updated_at,
              c.deleted_at, c.deleted_by, c.nomalum,
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
const SEARCH_COLS = `${COLS}, agg.debt_monthly, agg.debt_total, agg.days_overdue, agg.contracts_count,
                agg.virtual_statuses,
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

  async findByExternalId(externalId: string): Promise<Client | null> {
    const { rows } = await query(
      `SELECT ${COLS} FROM clients c WHERE c.external_id = $1 AND ${ALIVE}`,
      [externalId],
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
  private buildSearchBase(q: ClientQuery, qamrov: MijozQamrovi = HAMMASI): { base: string; params: unknown[] } {
    // "deleted" tabi — savat: faqat o'chirilganlar. Qolgan hamma tab
    // faqat tirik mijozlarni ko'rsatadi.
    // Noma'lum mijoz — shartnomasiz, unga ommaviy/eslatma yozilmaydi.
    const where: string[] = [q.tab === 'deleted' ? 'c.deleted_at IS NOT NULL' : ALIVE, 'NOT c.nomalum'];
    const params: unknown[] = [];
    // Obyekt cheklovi. Cheklanmaganda shart QO'SHILMAYDI — SQL aynan avvalgidek.
    if (qamrov.cheklangan) where.push(mijozQamroviSharti(qamrov, 'c', params));

    if (q.search) {
      params.push(`%${q.search.trim()}%`);
      where.push(`(c.full_name ILIKE $${params.length} OR c.phone ILIKE $${params.length}
                   OR c.external_id ILIKE $${params.length}
                   OR EXISTS (SELECT 1 FROM contracts ct WHERE ct.client_id = c.id
                              AND ct.deleted_at IS NULL AND ct.contract_no ILIKE $${params.length}))`);
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
    if (q.objectName) {
      params.push(q.objectName);
      where.push(`EXISTS (SELECT 1 FROM contracts ct
                           WHERE ct.client_id = c.id AND ct.deleted_at IS NULL
                             AND ct.object_name = $${params.length})`);
    }
    if (q.virtualStatus?.length) {
      // Bitta holat bazada ikki xil yozilgan bo'lishi mumkin (kalit va
      // ko'rinadigan nom), shuning uchun kalit barcha yozilishlariga
      // yoyiladi va solishtirish kichik harfda ketadi.
      // Bir nechta holat tanlansa ularning yozilishlari bitta ro'yxatga
      // qo'shiladi — mijozning biror shartnomasi shulardan birida bo'lsa kifoya.
      params.push([...new Set(q.virtualStatus.flatMap(holatSqlQiymatlari))]);
      where.push(`EXISTS (SELECT 1 FROM contracts ct
                           WHERE ct.client_id = c.id AND ct.deleted_at IS NULL
                             AND trim(ct.virtual_status) = ANY($${params.length}::text[]))`);
    }
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

    if (q.hasDebt) where.push(`agg.debt_total > 0`);
    if (q.minDaysOverdue !== undefined) {
      params.push(q.minDaysOverdue);
      where.push(`agg.days_overdue >= $${params.length}`);
    }

    const base = `
      FROM clients c
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(ct.debt_monthly), 0) AS debt_monthly,
               COALESCE(SUM(ct.debt_total), 0) AS debt_total,
               COALESCE(MAX(ct.days_overdue), 0) AS days_overdue,
               COUNT(*)::int AS contracts_count,
               -- Xom qiymatlar; kanonik kalitga JS'da keltiriladi, chunki
               -- kirillni tushira oladigan lower() bu bazada yo'q.
               array_remove(array_agg(DISTINCT trim(ct.virtual_status)), NULL)
                 AS virtual_statuses
        FROM contracts ct
        WHERE ct.client_id = c.id
          -- Mijoz o'chirilganda shartnomalari ham o'sha payt belgilanadi.
          -- Savatda to'lov summasi ko'rinib turishi kerak, shuning uchun
          -- aynan shu partiyani hisobga qo'shamiz.
          AND (ct.deleted_at IS NULL OR ct.deleted_at = c.deleted_at)
      ) agg ON TRUE
      WHERE ${where.join(' AND ')}
    `;

    return { base, params };
  }

  async search(q: ClientQuery, qamrov: MijozQamrovi = HAMMASI): Promise<Page<ClientWithDebt>> {
    const { base, params } = this.buildSearchBase(q, qamrov);

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

    const items: ClientWithDebt[] = rows.map(mijozQatori);

    return { items, total: countRows[0]?.count ?? 0, limit, offset };
  }

  /** Tab tugmalari yonidagi sonlar — bitta so'rovda. */
  /**
   * Filtrga tushgan HAMMA mijozning id'lari — sahifalashsiz.
   *
   * "Filtrdagi hammasini belgilash" uchun. Ro'yxat so'rovi 200 tagacha
   * qaytaradi (u ekran uchun), bu esa to'liq to'plamni beradi. Faqat
   * id'lar olinadi — to'lov, shartnoma va boshqa maydonlar kerak emas,
   * shuning uchun javob minglab mijozda ham yengil qoladi.
   */
  async searchIds(q: ClientQuery, qamrov: MijozQamrovi = HAMMASI): Promise<string[]> {
    const { base, params } = this.buildSearchBase(q, qamrov);
    const { rows } = await query<{ id: string }>(`SELECT c.id ${base} ORDER BY c.id`, params);
    return rows.map((r) => r.id);
  }

  /**
   * Filtrga tushgan hamma qator — bo'laklab, BITTA tranzaksiya ichida.
   *
   * NEGA ODDIY `LIMIT/OFFSET` YETARLI EMAS: har bo'lak alohida so'rov
   * bo'lsa (READ COMMITTED), ikkita muammo chiqadi. Birinchi — har
   * bo'lak butun agregatsiya + saralashni QAYTADAN hisoblab, `OFFSET`
   * qatorlarini tashlab yuboradi (O(n²)), va katta eksportda bu
   * `pool.ts`dagi 500ms chegarasidan oshib "Sekin so'rov" ogohlantirishi
   * beradi — bu esa xuddi shu faylning boshqa joyida (`jurnalPool`
   * izohi) hujjatlashtirilgan o'z-o'zini kuchaytiruvchi halqaga ozuqa
   * bo'ladi. Ikkinchi — bo'laklar orasida ma'lumot o'zgarishi mumkin:
   * saralash ustuni bo'lgan `agg.debt_monthly`ni `ContractSyncScheduler`
   * (yoki qo'lda "Shartnomani yangilash") aynan shu payt qayta yozishi
   * mumkin, mijoz o'chirilsa esa keyingi `OFFSET`lar bir pog'ona siljib,
   * o'rtadagi bittasi faylga umuman tushmay qoladi.
   *
   * YECHIM: `REPEATABLE READ` tranzaksiyasi ichida server tomonidagi
   * kursor (`DECLARE ... CURSOR` + `FETCH FORWARD`). BITTA so'rov rejasi,
   * BITTA saralash, BITTA baza suratiga (snapshot) qarab o'qiladi —
   * tranzaksiya boshlangandan keyingi har qanday yozish (qo'shish,
   * o'chirish, qayta sinxronlash) shu faylga ta'sir qilmaydi.
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
    qamrov: MijozQamrovi = HAMMASI,
  ): AsyncGenerator<ClientWithDebt[]> {
    const { base, params } = this.buildSearchBase(q, qamrov);
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

  async contractStatuses(qamrov: MijozQamrovi = HAMMASI): Promise<ContractStatusOption[]> {
    // Xom qiymat + mijoz juftliklari olinadi va guruhlash JS'da bo'ladi.
    //
    // NEGA SQL'DA EMAS: bitta holat bazada ikki xil yozilgan bo'lishi
    // mumkin ("sold" va "Сотилди"), ularni kalitga keltirish uchun esa
    // kirillni tushira oladigan `lower()` kerak — baza `lc_collate = C`
    // bilan yaratilgani uchun u ishlamaydi. JS'dagi `toLowerCase()`
    // ishlaydi va natija bazaning kollatsiyasiga bog'liq bo'lmaydi.
    //
    // Mijozlar sonini SHU YERDA sanaymiz: har bir yozilish bo'yicha
    // alohida sanab keyin qo'shsak, ikkala yozilishda ham shartnomasi bor
    // mijoz IKKI MARTA sanalardi va son filtr natijasidan katta chiqardi.
    // Obyekt cheklovi: cheklanmaganda shart va parametr yo'q — SQL avvalgidek.
    const params: unknown[] = [];
    const qamrovSharti = qamrov.cheklangan ? ` AND ${mijozQamroviSharti(qamrov, 'c', params)}` : '';
    const { rows } = await query<{ raw: string; client_id: string }>(
      `SELECT DISTINCT trim(ct.virtual_status) AS raw, ct.client_id
         FROM contracts ct
         JOIN clients c ON c.id = ct.client_id AND c.deleted_at IS NULL
        WHERE ct.deleted_at IS NULL AND trim(coalesce(ct.virtual_status, '')) <> ''${qamrovSharti}`,
      params,
    );

    const byKey = new Map<string, { label: string; clients: Set<string> }>();
    for (const r of rows) {
      const holat = holatniAniqla(r.raw);
      // Tanilmagan qiymat ham ro'yxatda qoladi: CRM yangi holat qo'shsa,
      // u xom nomi bilan ko'rinadi va filtr baribir ishlaydi.
      const key = holat?.key ?? r.raw;
      const entry = byKey.get(key) ?? { label: holat?.label ?? r.raw, clients: new Set<string>() };
      entry.clients.add(r.client_id);
      byKey.set(key, entry);
    }

    return [...byKey.entries()]
      .map(([key, v]) => ({ key, label: v.label, clients: v.clients.size }))
      .sort((a, b) => b.clients - a.clients);
  }

  async tabCounts(qamrov: MijozQamrovi = HAMMASI): Promise<ClientTabCounts> {
    // Noma'lum mijoz — shartnomasiz, unga ommaviy/eslatma yozilmaydi.
    const alive = `c.deleted_at IS NULL AND NOT c.nomalum`;
    const hasConv = `EXISTS (SELECT 1 FROM conversations cv WHERE cv.client_id = c.id AND cv.deleted_at IS NULL)`;

    // Obyekt cheklovi: cheklanmaganda `WHERE` va parametr yo'q — SQL avvalgidek.
    // Cheklanganda o'chirilganlar soni 0: savat ko'rinmaydi (shartnomalari ham
    // o'chirilgan, qamrov sharti tirik shartnoma talab qiladi).
    const params: unknown[] = [];
    const qamrovSharti = qamrov.cheklangan ? ` WHERE ${mijozQamroviSharti(qamrov, 'c', params)}` : '';
    const { rows } = await query<Record<string, number>>(`
      SELECT COUNT(*) FILTER (WHERE ${alive})::int AS all,
             COUNT(*) FILTER (WHERE ${alive} AND NOT ${hasConv})::int AS new,
             COUNT(*) FILTER (WHERE ${alive} AND ${hasConv})::int AS in_conversation,
             COUNT(*) FILTER (
               WHERE ${alive} AND c.telegram_status IN ('not_found', 'privacy_restricted', 'blocked', 'deactivated')
             )::int AS no_telegram,
             COUNT(*) FILTER (WHERE ${alive} AND c.telegram_status = 'name_mismatch')::int AS needs_review,
             COUNT(*) FILTER (WHERE c.deleted_at IS NOT NULL AND NOT c.nomalum)::int AS deleted
        FROM clients c${qamrovSharti}
    `, params);

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

      const contracts = await stamp('contracts', 'client_id');
      const conversations = await stamp('conversations', 'client_id');
      const promises = await stamp('payment_promises', 'client_id');
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
        contracts,
        conversations,
        messages: messages ?? 0,
        promises,
        campaignTargets,
        profiles,
      };
    });
  }

  /**
   * O'chirishni bekor qilish — o'sha partiyadagi qatorlar qaytariladi.
   *
   * Tiklash muvaffaqiyatsiz bo'lishi mumkin: mijoz o'chirilgandan keyin
   * o'sha eksport ID yoki shartnoma raqami bilan YANGI yozuv import
   * qilingan bo'lsa, unique indeks tiklashga yo'l bermaydi. Bu holatda
   * tushunarli xato beramiz — bazani jimgina buzib qo'ymaymiz.
   */
  async restore(id: string): Promise<ClientDeletionSummary> {
    try {
      return await this.restoreInTransaction(id);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new ValidationError(
          'Tiklab bo\'lmadi: bu mijozning eksport ID si yoki shartnoma raqami '
          + 'boshqa (yangi import qilingan) yozuvda band. Avval o\'sha yozuvni tekshiring.',
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

      const contracts = await unstamp('contracts', 'client_id');
      const conversations = await unstamp('conversations', 'client_id');
      const promises = await unstamp('payment_promises', 'client_id');
      const campaignTargets = await unstamp('campaign_targets', 'client_id');
      const profiles = await unstamp('client_profiles', 'client_id');

      await query('UPDATE clients SET deleted_at = NULL, deleted_by = NULL WHERE id = $1', [id], tx);

      return {
        deletedAt: at,
        contracts,
        conversations,
        messages: messages ?? 0,
        promises,
        campaignTargets,
        profiles,
      };
    });
  }

  async findCampaignTargets(filters: CampaignFilters, qamrov: MijozQamrovi = HAMMASI): Promise<string[]> {
    const { sql, params } = kampaniyaNishonSql(filters, qamrov);
    const { rows } = await query<{ client_id: string }>(sql, params);
    return rows.map((r) => r.client_id);
  }

  async create(data: NewClient): Promise<Client> {
    const tg = data.telegram;
    const { rows } = await query(
      `INSERT INTO clients (external_id, full_name, first_name, phone, extra_phones, notes,
                            created_import_batch_id, source, source_group, source_comment,
                            telegram_user_id, telegram_username, telegram_access_hash,
                            telegram_hash_account_id, telegram_name, telegram_status,
                            telegram_checked_at, telegram_account_id, account_assigned_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'qolda'), $9, $10,
               $11, $12, $13, $14, $15, CASE WHEN $11::text IS NULL THEN 'unknown' ELSE 'found' END,
               CASE WHEN $11::text IS NULL THEN NULL ELSE now() END, $16,
               CASE WHEN $16::uuid IS NULL THEN NULL ELSE now() END)
       RETURNING *`,
      [
        data.externalId ?? null, data.fullName, data.firstName ?? null, data.phone ?? null,
        data.extraPhones ?? [], data.notes ?? null, data.createdImportBatchId ?? null,
        data.source ?? null, data.sourceGroup ?? null, data.sourceComment ?? null,
        tg?.telegramUserId ?? null, tg?.telegramUsername ?? null, tg?.telegramAccessHash ?? null,
        tg?.telegramHashAccountId ?? null, tg?.telegramName ?? null, tg?.telegramAccountId ?? null,
      ],
    );
    return mapClient(rows[0]!);
  }

  async nomalumniYopish(clientId: string): Promise<void> {
    // Faqat noma'lum mijoz qatorini yopadi. `softDelete` dan farqi: suhbat va
    // xabarlarga tegmaydi — suhbat allaqachon haqiqiy mijozga ko'chirilgan.
    // Telegram id tozalanadi, shunda haqiqiy mijoz yagona egasi bo'lib qoladi.
    await query(
      `UPDATE clients
          SET deleted_at = now(), telegram_user_id = NULL, telegram_access_hash = NULL, updated_at = now()
        WHERE id = $1 AND nomalum AND deleted_at IS NULL`,
      [clientId],
    );
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
    if (patch.externalId !== undefined) push('external_id', patch.externalId);
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
      // Noma'lum mijoz — shartnomasiz, unga ommaviy/eslatma yozilmaydi.
      `SELECT id FROM clients c
        WHERE telegram_account_id IS NULL AND do_not_contact = FALSE AND deleted_at IS NULL
          AND NOT c.nomalum
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
          AND NOT c.nomalum -- Noma'lum mijoz — shartnomasiz, unga ommaviy/eslatma yozilmaydi.
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
  async previewBulkStart(clientIds: string[], minDebt: number): Promise<BulkStartPreview> {
    const counts: Record<BulkStartOutlook, number> = {
      ready: 0,
      name_mismatch: 0,
      needs_lookup: 0,
      do_not_contact: 0,
      blocked: 0,
      deactivated: 0,
      no_phone: 0,
      not_sold: 0,
      no_debt: 0,
      below_min_debt: 0,
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
      `SELECT c.id, c.full_name, c.telegram_name, c.phone,
              CASE
                WHEN c.do_not_contact THEN 'do_not_contact'
                WHEN c.telegram_status = 'blocked' THEN 'blocked'
                WHEN c.telegram_status = 'deactivated' THEN 'deactivated'
                WHEN c.phone IS NULL AND c.telegram_user_id IS NULL THEN 'no_phone'
                WHEN COALESCE(cv.state, 'new') <> 'new' THEN 'already_started'
                WHEN COALESCE(agg.sold_count, 0) = 0 THEN 'not_sold'
                WHEN COALESCE(agg.debt_first, 0) + COALESCE(agg.debt_monthly, 0) <= 0
                  THEN 'no_debt'
                -- Kechikish bor, lekin minimal chegaradan katta emas.
                -- Tartib StartConversationUseCase bilan bir xil:
                -- u ham nolni va chegarani BITTA tekshiruvda kesadi.
                WHEN COALESCE(agg.debt_first, 0) + COALESCE(agg.debt_monthly, 0) <= $3
                  THEN 'below_min_debt'
                WHEN c.telegram_status = 'name_mismatch' THEN 'name_mismatch'
                WHEN c.telegram_user_id IS NOT NULL THEN 'ready'
                ELSE 'needs_lookup'
              END AS outlook
         FROM clients c
         LEFT JOIN LATERAL (
           -- Ikkala qismi ham: use case boshlang'ich to'lovda kechikish bo'lsa ham
           -- suhbatni boshlaydi. Bu yerda faqat oyma-oy kechikishga qaralsa,
           -- ogohlantirish "o'tkazib yuboriladi" degan mijozga aslida
           -- xabar ketib qolardi.
           --
           -- Kechikkan to'lov FAQAT "Сотилди" shartnomalari bo'yicha sanaladi — use case
           -- ham shunday qiladi. Aks holda bekor qilinayotgan shartnomasi
           -- borlar "xabar ketadi" bo'lib ko'rinardi.
           SELECT COUNT(*) AS sold_count,
                  COALESCE(SUM(ct.debt_first), 0) AS debt_first,
                  COALESCE(SUM(ct.debt_monthly), 0) AS debt_monthly
             FROM contracts ct
            WHERE ct.client_id = c.id AND ct.deleted_at IS NULL
              AND TRIM(ct.virtual_status) = ANY($2::text[])
         ) agg ON TRUE
         -- Use case eng OXIRGI suhbatga qaraydi (findByClientId), shuning
         -- uchun bu yerda ham aynan shu qator olinadi. "Bittasi 'new' emas"
         -- deb tekshirilsa, eski yopilgan suhbati borlar noto'g'ri
         -- "allaqachon boshlangan" bo'lib chiqardi.
         LEFT JOIN LATERAL (
           SELECT cv2.state
             FROM conversations cv2
            WHERE cv2.client_id = c.id AND cv2.deleted_at IS NULL
            ORDER BY cv2.created_at DESC
            LIMIT 1
         ) cv ON TRUE
        WHERE c.id = ANY($1::uuid[]) AND ${ALIVE}
          AND NOT c.nomalum -- Noma'lum mijoz — shartnomasiz, unga ommaviy/eslatma yozilmaydi.
        ORDER BY c.full_name ASC`,
      [clientIds, YOZILADIGAN_SQL_QIYMATLARI, minDebt],
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
          AND NOT c.nomalum -- Noma'lum mijoz — shartnomasiz, unga ommaviy/eslatma yozilmaydi.
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
