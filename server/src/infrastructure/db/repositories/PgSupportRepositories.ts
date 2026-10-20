import type { ImportBatch } from '@/domain/entities/ImportBatch';
import type { ImportKind } from '@/domain/entities/ImportBatch';
import type {
  AuditEntry,
  DashboardStats,
  IAuditRepository,
  IImportBatchRepository,
  ImportBatchResult,
  ImportUndoSummary,
  ISettingsRepository,
  IStatsRepository,
  NewImportBatch,
  PeriodStats,
} from '@/domain/repositories/ISupportRepositories';
import type { Page, Pagination } from '@/domain/repositories/types';
import { query, withTransaction, type Sql } from '@/infrastructure/db/pool';
import { mapImportBatch, toDate } from '@/infrastructure/db/mappers';
import { mijozOrqaliSharti } from '@/infrastructure/db/qamrovSharti';
import { HAMMASI, type MijozQamrovi } from '@/domain/entities/MijozQamrovi';
import { NotFoundError, ValidationError } from '@/shared/errors';

export class PgImportBatchRepository implements IImportBatchRepository {
  /**
   * Import boshlanishida bo'sh yozuv — id qatorlarga yoziladi.
   * Import yarim yo'lda uzilib qolsa ham yozuv qoladi va nima
   * yaratilgani ko'rinib turadi (sonlar nol bo'lsa ham).
   */
  async start(data: { filename: string; kind: ImportKind; createdBy?: string | null }): Promise<ImportBatch> {
    const { rows } = await query(
      `INSERT INTO import_batches (filename, kind, created_by) VALUES ($1,$2,$3) RETURNING *`,
      [data.filename, data.kind, data.createdBy ?? null],
    );
    return mapImportBatch(rows[0]!);
  }

  async finalize(id: string, data: ImportBatchResult): Promise<ImportBatch> {
    const { rows } = await query(
      `UPDATE import_batches
          SET rows_total = $2, rows_ok = $3, rows_failed = $4,
              clients_created = $5, contracts_created = $6, contracts_updated = $7,
              errors = $8
        WHERE id = $1 RETURNING *`,
      [
        id, data.rowsTotal, data.rowsOk, data.rowsFailed,
        data.clientsCreated, data.contractsCreated, data.contractsUpdated,
        JSON.stringify(data.errors.slice(0, 500)),
      ],
    );
    if (!rows[0]) throw new NotFoundError('Import', id);
    return mapImportBatch(rows[0]);
  }

  /** Qaytarish nechta TIRIK qatorga tegishini sanaydi (o'chirmaydi). */
  async undoPreview(id: string): Promise<Pick<ImportUndoSummary, 'clients' | 'contracts'>> {
    const { rows } = await query<{ clients: string; contracts: string }>(
      `SELECT (SELECT COUNT(*) FROM clients
                WHERE created_import_batch_id = $1 AND deleted_at IS NULL) AS clients,
              (SELECT COUNT(*) FROM contracts
                WHERE created_import_batch_id = $1 AND deleted_at IS NULL) AS contracts`,
      [id],
    );
    const r = rows[0]!;
    return { clients: Number(r.clients), contracts: Number(r.contracts) };
  }

  /**
   * Importni qaytarish.
   *
   * Faqat SHU import YARATGAN qatorlar belgilanadi. Import yangilagan
   * (ilgari mavjud bo'lgan) shartnomalarga tegilmaydi — eski qiymatlari
   * hech qayerda saqlanmagan, ya'ni ularni tiklab bo'lmaydi.
   *
   * Hamma narsa bitta tranzaksiyada va `now()` bilan belgilanadi:
   * tranzaksiya ichida `now()` o'zgarmaydi, shuning uchun mijoz,
   * shartnoma, suhbat, xabar va `import_batches.undone_at` — hammasida
   * AYNAN bir xil vaqt turadi. `restore` o'sha vaqt bo'yicha aynan shu
   * partiyani topib qaytaradi va boshqa sabab bilan o'chirilgan
   * yozuvlarni tirgizib yubormaydi.
   */
  async undo(id: string, actor: string): Promise<ImportUndoSummary> {
    return withTransaction(async (tx) => {
      const batch = await query<{ undone_at: Date | null }>(
        'SELECT undone_at FROM import_batches WHERE id = $1',
        [id],
        tx,
      );
      if (!batch.rows[0]) throw new NotFoundError('Import', id);
      if (batch.rows[0].undone_at) throw new ValidationError('Bu import allaqachon qaytarilgan');

      // Mijozning o'zi bilan birga hamma narsasi ketadi.
      const clients = await this.rowCount(
        tx,
        `UPDATE clients SET deleted_at = now(), deleted_by = $2
          WHERE created_import_batch_id = $1 AND deleted_at IS NULL`,
        [id, actor],
      );

      const child = (table: string): string =>
        `UPDATE ${table} SET deleted_at = now()
          WHERE deleted_at IS NULL
            AND client_id IN (SELECT id FROM clients
                               WHERE created_import_batch_id = $1 AND deleted_at = now())`;

      const messages = await this.rowCount(
        tx,
        `UPDATE messages m SET deleted_at = now()
           FROM conversations cv
          WHERE cv.id = m.conversation_id AND m.deleted_at IS NULL
            AND cv.client_id IN (SELECT id FROM clients
                                  WHERE created_import_batch_id = $1 AND deleted_at = now())`,
        [id],
      );
      const conversations = await this.rowCount(tx, child('conversations'), [id]);
      const promises = await this.rowCount(tx, child('payment_promises'), [id]);
      const campaignTargets = await this.rowCount(tx, child('campaign_targets'), [id]);
      const profiles = await this.rowCount(tx, child('client_profiles'), [id]);

      // Shartnomalar: o'chirilgan mijozlarniki ham, ilgari mavjud
      // mijozga shu import qo'shgan yangi shartnomalar ham.
      const contracts = await this.rowCount(
        tx,
        `UPDATE contracts SET deleted_at = now()
          WHERE deleted_at IS NULL
            AND (created_import_batch_id = $1
                 OR client_id IN (SELECT id FROM clients
                                   WHERE created_import_batch_id = $1 AND deleted_at = now()))`,
        [id],
      );

      await query(
        'UPDATE import_batches SET undone_at = now(), undone_by = $2 WHERE id = $1',
        [id, actor],
        tx,
      );

      return { clients, contracts, conversations, messages, promises, campaignTargets, profiles };
    });
  }

  async restore(id: string): Promise<ImportUndoSummary> {
    return withTransaction(async (tx) => {
      const batch = await query<{ undone_at: Date | null }>(
        'SELECT undone_at FROM import_batches WHERE id = $1',
        [id],
        tx,
      );
      if (!batch.rows[0]) throw new NotFoundError('Import', id);
      if (!batch.rows[0].undone_at) throw new ValidationError('Bu import qaytarilmagan');

      // Vaqt taqqoslash bazaning o'zida — JS Date orqali o'tkazilsa
      // mikrosoniyalar kesilib, hech bir qator topilmasdi.
      const AT = '(SELECT undone_at FROM import_batches WHERE id = $1)';

      const messages = await this.rowCount(
        tx,
        `UPDATE messages m SET deleted_at = NULL
           FROM conversations cv
          WHERE cv.id = m.conversation_id AND m.deleted_at = ${AT}`,
        [id],
      );

      const child = (table: string): string =>
        `UPDATE ${table} SET deleted_at = NULL
          WHERE deleted_at = ${AT}
            AND client_id IN (SELECT id FROM clients WHERE created_import_batch_id = $1)`;

      const conversations = await this.rowCount(tx, child('conversations'), [id]);
      const promises = await this.rowCount(tx, child('payment_promises'), [id]);
      const campaignTargets = await this.rowCount(tx, child('campaign_targets'), [id]);
      const profiles = await this.rowCount(tx, child('client_profiles'), [id]);

      const contracts = await this.rowCount(
        tx,
        `UPDATE contracts SET deleted_at = NULL WHERE deleted_at = ${AT}`,
        [id],
      );
      const clients = await this.rowCount(
        tx,
        `UPDATE clients SET deleted_at = NULL, deleted_by = NULL
          WHERE created_import_batch_id = $1 AND deleted_at = ${AT}`,
        [id],
      );

      await query('UPDATE import_batches SET undone_at = NULL, undone_by = NULL WHERE id = $1', [id], tx);

      return { clients, contracts, conversations, messages, promises, campaignTargets, profiles };
    });
  }

  private async rowCount(tx: Sql, sql: string, params: unknown[]): Promise<number> {
    const { rowCount } = await query(sql, params, tx);
    return rowCount ?? 0;
  }

  async create(data: NewImportBatch): Promise<ImportBatch> {
    const { rows } = await query(
      `INSERT INTO import_batches
         (filename, kind, rows_total, rows_ok, rows_failed, clients_created,
          contracts_created, contracts_updated, errors, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        data.filename, data.kind, data.rowsTotal, data.rowsOk, data.rowsFailed,
        data.clientsCreated, data.contractsCreated, data.contractsUpdated,
        JSON.stringify(data.errors.slice(0, 500)), data.createdBy ?? null,
      ],
    );
    return mapImportBatch(rows[0]!);
  }

  async list(pagination: Pagination = {}): Promise<Page<ImportBatch>> {
    const limit = Math.min(pagination.limit ?? 20, 100);
    const offset = pagination.offset ?? 0;
    const [{ rows: countRows }, { rows }] = await Promise.all([
      query<{ count: number }>('SELECT COUNT(*)::int AS count FROM import_batches'),
      query('SELECT * FROM import_batches ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]),
    ]);
    return { items: rows.map(mapImportBatch), total: countRows[0]?.count ?? 0, limit, offset };
  }

  async findById(id: string): Promise<ImportBatch | null> {
    const { rows } = await query('SELECT * FROM import_batches WHERE id = $1', [id]);
    return rows[0] ? mapImportBatch(rows[0]) : null;
  }
}

export class PgSettingsRepository implements ISettingsRepository {
  async get<T = unknown>(key: string): Promise<T | null> {
    const { rows } = await query<{ value: T }>('SELECT value FROM settings WHERE key = $1', [key]);
    return rows[0]?.value ?? null;
  }

  async set(key: string, value: unknown, updatedBy?: string | null): Promise<void> {
    await query(
      `INSERT INTO settings (key, value, updated_by) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value,
                                       updated_by = EXCLUDED.updated_by,
                                       updated_at = now()`,
      [key, JSON.stringify(value), updatedBy ?? null],
    );
  }

  async all(): Promise<Record<string, unknown>> {
    const { rows } = await query<{ key: string; value: unknown }>('SELECT key, value FROM settings');
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }
}

export class PgAuditRepository implements IAuditRepository {
  async record(entry: AuditEntry): Promise<void> {
    await query(
      `INSERT INTO audit_log (actor, action, entity, entity_id, payload) VALUES ($1,$2,$3,$4,$5)`,
      [entry.actor, entry.action, entry.entity ?? null, entry.entityId ?? null, JSON.stringify(entry.payload ?? {})],
    );
  }

  async list(q: Pagination & { entity?: string; entityId?: string }): Promise<Page<AuditEntry & { createdAt: Date }>> {
    const where: string[] = ['TRUE'];
    const params: unknown[] = [];
    if (q.entity) {
      params.push(q.entity);
      where.push(`entity = $${params.length}`);
    }
    if (q.entityId) {
      params.push(q.entityId);
      where.push(`entity_id = $${params.length}`);
    }
    const limit = Math.min(q.limit ?? 100, 500);
    const offset = q.offset ?? 0;
    const base = `FROM audit_log WHERE ${where.join(' AND ')}`;
    const [{ rows: countRows }, { rows }] = await Promise.all([
      query<{ count: number }>(`SELECT COUNT(*)::int AS count ${base}`, params),
      query(`SELECT * ${base} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`, params),
    ]);
    return {
      items: rows.map((r) => ({
        actor: r.actor,
        action: r.action,
        entity: r.entity,
        entityId: r.entity_id,
        payload: r.payload,
        createdAt: toDate(r.created_at) ?? new Date(0),
      })),
      total: countRows[0]?.count ?? 0,
      limit,
      offset,
    };
  }
}

/**
 * Obyekt cheklovi: har bir ichki so'rov `mijozOrqaliSharti` (mijoz id'si
 * orqali EXISTS) bilan cheklanadi — cheklangan foydalanuvchi faqat o'z
 * qamrovidagi mijozlar (va ularning BARCHA shartnomalari, suhbatlari,
 * xabarlari, va'dalari) bo'yicha raqam ko'radi. Cheklanmaganda bo'laklar
 * bo'sh: so'rov matni va parametrlari aynan avvalgidek. Global
 * `debt_snapshots` bu yerda o'qilmaydi (`debtNow` — jonli hisob).
 */
export class PgStatsRepository implements IStatsRepository {
  async dashboard(todayIso: string, qamrov: MijozQamrovi = HAMMASI): Promise<DashboardStats> {
    const pTotals: unknown[] = [];
    const kT = mijozOrqaliSharti(qamrov, pTotals);
    const pStates: unknown[] = [];
    const kS = mijozOrqaliSharti(qamrov, pStates);
    const pStages: unknown[] = [];
    const kG = mijozOrqaliSharti(qamrov, pStages);
    const pMsg: unknown[] = [todayIso];
    const kM = mijozOrqaliSharti(qamrov, pMsg);
    const pProm: unknown[] = [];
    const kP = mijozOrqaliSharti(qamrov, pProm);
    const pAct: unknown[] = [];
    const kA = mijozOrqaliSharti(qamrov, pAct);
    const pCol: unknown[] = [todayIso];
    const kC = mijozOrqaliSharti(qamrov, pCol);
    const [totals, convStates, convStages, msgToday, promises, activity, collected] =
      await Promise.all([
      query<Record<string, number>>(`
        -- Hamma joyda deleted_at IS NULL: o'chirilgan mijozning to'lovi
        -- panelda ko'rinmasligi kerak, aks holda raqamlar ro'yxat bilan
        -- mos kelmaydi (032-migratsiya).
        SELECT
          -- Noma'lum mijoz (130) qarzdor emas — «Mijozlar» ro'yxatiga ham
          -- kirmaydi; panel soni ro'yxat bilan mos kelsin.
          (SELECT COUNT(*)::int FROM clients WHERE deleted_at IS NULL AND NOT nomalum${kT('clients.id')}) AS clients_total,
          (SELECT COUNT(*)::int FROM clients WHERE phone IS NOT NULL AND deleted_at IS NULL${kT('clients.id')}) AS clients_with_phone,
          (SELECT COUNT(*)::int FROM clients WHERE telegram_status = 'found' AND deleted_at IS NULL AND NOT nomalum${kT('clients.id')}) AS clients_on_telegram,
          (SELECT COUNT(*)::int FROM contracts WHERE deleted_at IS NULL${kT('contracts.client_id')}) AS contracts_total,
          (SELECT COALESCE(SUM(debt_monthly),0)::numeric FROM contracts WHERE deleted_at IS NULL${kT('contracts.client_id')}) AS debt_monthly,
          (SELECT COALESCE(SUM(debt_total),0)::numeric FROM contracts WHERE deleted_at IS NULL${kT('contracts.client_id')}) AS debt_total,
          (SELECT COUNT(*)::int FROM conversations WHERE deleted_at IS NULL${kT('conversations.client_id')}) AS conversations_total,
          (SELECT COUNT(*)::int FROM conversations WHERE needs_human AND deleted_at IS NULL${kT('conversations.client_id')}) AS conversations_needing_human,
          (SELECT COALESCE(SUM(amount),0)::numeric FROM payment_promises
            WHERE status = 'pending' AND deleted_at IS NULL${kT('payment_promises.client_id')}) AS promised_amount
      `, pTotals),
      query<{ state: string; count: number }>(`SELECT state, COUNT(*)::int AS count FROM conversations WHERE deleted_at IS NULL${kS('conversations.client_id')} GROUP BY state`, pStates),
      query<{ stage: string; count: number }>(`SELECT stage, COUNT(*)::int AS count FROM conversations WHERE deleted_at IS NULL${kG('conversations.client_id')} GROUP BY stage`, pStages),
      query<{ direction: string; count: number }>(
        `SELECT direction, COUNT(*)::int AS count FROM messages
          WHERE created_at::date = $1::date AND status <> 'draft' AND deleted_at IS NULL
            AND direction <> 'note'${kM('(SELECT qcv.client_id FROM conversations qcv WHERE qcv.id = messages.conversation_id)')}
          GROUP BY direction`,
        pMsg,
      ),
      query<{ status: string; count: number }>(
        `SELECT status, COUNT(*)::int AS count FROM payment_promises
          WHERE deleted_at IS NULL${kP('payment_promises.client_id')} GROUP BY status`,
        pProm,
      ),
      query<{ day: string; direction: string; count: number }>(
        // COUNT(DISTINCT client_id) — kuniga nechta ODAM bilan yozishilgani.
        // Xabar soni bo'lsa bitta gapdon mijoz kunni "gavjum" ko'rsatardi.
        `SELECT to_char(m.created_at::date, 'YYYY-MM-DD') AS day, m.direction,
                COUNT(DISTINCT cv.client_id)::int AS count
           FROM messages m
           JOIN conversations cv ON cv.id = m.conversation_id AND cv.deleted_at IS NULL
          WHERE m.created_at >= now() - INTERVAL '14 days' AND m.status <> 'draft'
            AND m.deleted_at IS NULL
            -- Operator topshirig'i (note) sanalmaydi: pastdagi tsikl "out"
            -- bo'lmagan hamma narsani "javob berdi" deb qo'shadi.
            AND m.direction <> 'note'${kA('cv.client_id')}
          GROUP BY 1, 2 ORDER BY 1`,
        pAct,
      ),
      // Shu oyda undirilgan summa. O'lchov qoidasi hisobot sahifasidagidek:
      // mijozga BIRINCHI muvaffaqiyatli xabar ketgandan keyin kelgan to'lov.
      // `conversations.created_at` emas, aynan yuborilgan xabar — suhbat
      // qatori yaratilib, xabar ketmagan bo'lishi mumkin.
      //
      // Bahsli to'lovlar (`is_problematic`) hisobga olinmaydi: buxgalteriya
      // ularni tasdiqlamagan, panelda esa ular "undirdik" bo'lib ko'rinardi.
      query<{ amount: number; clients: number }>(
        `WITH anchors AS (
           SELECT cv.client_id, min(m.sent_at) AS anchor_at
             FROM messages m
             JOIN conversations cv ON cv.id = m.conversation_id
            WHERE m.direction = 'out' AND m.sent_at IS NOT NULL
              AND m.deleted_at IS NULL AND cv.deleted_at IS NULL
            GROUP BY cv.client_id
         )
         SELECT COALESCE(SUM(e.amount), 0)::numeric AS amount,
                COUNT(DISTINCT a.client_id)::int AS clients
           FROM anchors a
           JOIN clients cl ON cl.id = a.client_id AND cl.deleted_at IS NULL
           JOIN contracts c ON c.client_id = a.client_id AND c.deleted_at IS NULL
           JOIN contract_payment_events e
             ON e.contract_id = c.id AND e.is_problematic = FALSE
          WHERE e.date_paid >= GREATEST(a.anchor_at::date, date_trunc('month', $1::date)::date)
            AND e.date_paid <= $1::date${kC('cl.id')}`,
        pCol,
      ),
    ]);

    const t = totals.rows[0] ?? ({} as Record<string, number>);
    const msg = Object.fromEntries(msgToday.rows.map((r) => [r.direction, r.count]));
    const prom = Object.fromEntries(promises.rows.map((r) => [r.status, r.count]));

    const dayMap = new Map<string, { day: string; writtenTo: number; replied: number }>();
    for (const r of activity.rows) {
      const entry = dayMap.get(r.day) ?? { day: r.day, writtenTo: 0, replied: 0 };
      if (r.direction === 'out') entry.writtenTo += r.count;
      else entry.replied += r.count;
      dayMap.set(r.day, entry);
    }

    return {
      clientsTotal: Number(t.clients_total ?? 0),
      clientsWithPhone: Number(t.clients_with_phone ?? 0),
      clientsOnTelegram: Number(t.clients_on_telegram ?? 0),
      contractsTotal: Number(t.contracts_total ?? 0),
      debtMonthly: Number(t.debt_monthly ?? 0),
      debtTotal: Number(t.debt_total ?? 0),
      debtCollectedPromised: Number(t.promised_amount ?? 0),
      collectedThisMonth: Number(collected.rows[0]?.amount ?? 0),
      collectedClientsThisMonth: Number(collected.rows[0]?.clients ?? 0),
      conversationsTotal: Number(t.conversations_total ?? 0),
      conversationsNeedingHuman: Number(t.conversations_needing_human ?? 0),
      messagesSentToday: Number(msg.out ?? 0),
      messagesReceivedToday: Number(msg.in ?? 0),
      promisesPending: Number(prom.pending ?? 0),
      promisesKept: Number(prom.kept ?? 0),
      promisesBroken: Number(prom.broken ?? 0),
      byState: convStates.rows.map((r) => ({ state: r.state, count: r.count })),
      byStage: convStages.rows.map((r) => ({ stage: r.stage, count: r.count })),
      dailyActivity: [...dayMap.values()].sort((a, b) => a.day.localeCompare(b.day)),
    };
  }

  async period(fromIso: string, toIso: string, qamrov: MijozQamrovi = HAMMASI): Promise<PeriodStats> {
    const pPay: unknown[] = [fromIso, toIso];
    const kPay = mijozOrqaliSharti(qamrov, pPay);
    const pDebt: unknown[] = [];
    const kDebt = mijozOrqaliSharti(qamrov, pDebt);
    const pCnt: unknown[] = [fromIso, toIso];
    const kCnt = mijozOrqaliSharti(qamrov, pCnt);
    const [payments, debt] = await Promise.all([
      // Har bir to'lov "biz undirganmi" degan bayroq bilan keladi.
      //
      // Chegara — mijozga BIRINCHI muvaffaqiyatli chiquvchi xabar.
      // `conversations.created_at` emas: suhbat qatori xabar yuborilishidan
      // oldin yaratiladi va Telegram qidiruvi yiqilsa, xabar hech qachon
      // ketmagan bo'lishi mumkin. Bunday mijozni "biz gaplashdik" deb
      // sanash undiruv raqamini sun'iy oshirardi.
      query<{ day: string; by_us: boolean; amount: number; clients: number }>(
        `WITH anchors AS (
           SELECT cv.client_id, min(m.sent_at) AS anchor_at
             FROM messages m
             JOIN conversations cv ON cv.id = m.conversation_id
            WHERE m.direction = 'out' AND m.sent_at IS NOT NULL
              AND m.deleted_at IS NULL AND cv.deleted_at IS NULL
            GROUP BY cv.client_id
         ),
         tolovlar AS (
           SELECT to_char(e.date_paid, 'YYYY-MM-DD') AS day,
                  (a.anchor_at IS NOT NULL AND e.date_paid >= a.anchor_at::date) AS by_us,
                  e.amount,
                  c.client_id
             FROM contract_payment_events e
             JOIN contracts c ON c.id = e.contract_id AND c.deleted_at IS NULL
             JOIN clients cl ON cl.id = c.client_id AND cl.deleted_at IS NULL
             LEFT JOIN anchors a ON a.client_id = c.client_id
            -- Bahsli to'lovlar hisoblanmaydi: buxgalteriya ularni
            -- tasdiqlamagan, panelda esa ular "undirdik" bo'lib ko'rinardi.
            WHERE e.is_problematic = FALSE
              AND e.date_paid BETWEEN $1::date AND $2::date${kPay('c.client_id')}
         )
         SELECT day, by_us,
                COALESCE(SUM(amount), 0)::numeric AS amount,
                COUNT(DISTINCT client_id)::int AS clients
           FROM tolovlar
          GROUP BY day, by_us
          ORDER BY day`,
        pPay,
      ),
      query<{ debt_total: number; debt_monthly: number }>(
        `SELECT COALESCE(SUM(debt_total), 0)::numeric AS debt_total,
                COALESCE(SUM(debt_monthly), 0)::numeric AS debt_monthly
           FROM contracts WHERE deleted_at IS NULL${kDebt('contracts.client_id')}`,
        pDebt,
      ),
    ]);

    const dayMap = new Map<string, { day: string; byUs: number; withoutUs: number }>();
    let byUsAmount = 0;
    let withoutUsAmount = 0;

    for (const r of payments.rows) {
      const entry = dayMap.get(r.day) ?? { day: r.day, byUs: 0, withoutUs: 0 };
      const amount = Number(r.amount);
      if (r.by_us) {
        entry.byUs += amount;
        byUsAmount += amount;
      } else {
        entry.withoutUs += amount;
        withoutUsAmount += amount;
      }
      dayMap.set(r.day, entry);
    }

    // Mijozlar soni kunlar bo'yicha qo'shilmaydi — bitta mijoz bir necha
    // kun to'lagan bo'lishi mumkin. Butun davr bo'yicha alohida so'raladi.
    const { rows: counts } = await query<{ by_us: boolean; clients: number }>(
      `WITH anchors AS (
         SELECT cv.client_id, min(m.sent_at) AS anchor_at
           FROM messages m
           JOIN conversations cv ON cv.id = m.conversation_id
          WHERE m.direction = 'out' AND m.sent_at IS NOT NULL
            AND m.deleted_at IS NULL AND cv.deleted_at IS NULL
          GROUP BY cv.client_id
       )
       SELECT (a.anchor_at IS NOT NULL AND e.date_paid >= a.anchor_at::date) AS by_us,
              COUNT(DISTINCT c.client_id)::int AS clients
         FROM contract_payment_events e
         JOIN contracts c ON c.id = e.contract_id AND c.deleted_at IS NULL
         JOIN clients cl ON cl.id = c.client_id AND cl.deleted_at IS NULL
         LEFT JOIN anchors a ON a.client_id = c.client_id
        WHERE e.is_problematic = FALSE
          AND e.date_paid BETWEEN $1::date AND $2::date${kCnt('c.client_id')}
        GROUP BY 1`,
      pCnt,
    );
    const clientCount = (flag: boolean): number =>
      counts.find((c) => c.by_us === flag)?.clients ?? 0;

    const d = debt.rows[0] ?? { debt_total: 0, debt_monthly: 0 };

    return {
      from: fromIso,
      to: toIso,
      collectedByUs: { amount: byUsAmount, clients: clientCount(true) },
      collectedWithoutUs: { amount: withoutUsAmount, clients: clientCount(false) },
      daily: [...dayMap.values()].sort((a, b) => a.day.localeCompare(b.day)),
      debtNow: { total: Number(d.debt_total ?? 0), monthly: Number(d.debt_monthly ?? 0) },
    };
  }

  async writeDebtSnapshot(dayIso: string): Promise<void> {
    // Kun davomida qayta yoziladi — kun o'tgach qiymat muzlab qoladi.
    await query(
      `INSERT INTO debt_snapshots
         (day, debt_total, debt_monthly, debt_first, clients_with_debt, contracts_with_debt)
       SELECT $1::date,
              COALESCE(SUM(ct.debt_total), 0),
              COALESCE(SUM(ct.debt_monthly), 0),
              COALESCE(SUM(ct.debt_first), 0),
              COUNT(DISTINCT ct.client_id) FILTER (WHERE ct.debt_total > 0),
              COUNT(*) FILTER (WHERE ct.debt_total > 0)
         FROM contracts ct WHERE ct.deleted_at IS NULL
       ON CONFLICT (day) DO UPDATE SET
         debt_total = EXCLUDED.debt_total,
         debt_monthly = EXCLUDED.debt_monthly,
         debt_first = EXCLUDED.debt_first,
         clients_with_debt = EXCLUDED.clients_with_debt,
         contracts_with_debt = EXCLUDED.contracts_with_debt,
         updated_at = now()`,
      [dayIso],
    );
  }
}
