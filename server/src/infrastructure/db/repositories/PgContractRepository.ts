import type { Contract, ContractUpsert } from '@/domain/entities/Contract';
import type { ContractQuery, IContractRepository } from '@/domain/repositories/IContractRepository';
import type { Page } from '@/domain/repositories/types';
import { query } from '@/infrastructure/db/pool';
import { mapContract } from '@/infrastructure/db/mappers';
import { toIsoDate } from '@/shared/datetime';
import { CONTRACT_UPSERT_SQL } from '@/infrastructure/db/repositories/contractUpsertSql';

export class PgContractRepository implements IContractRepository {
  async findById(id: string): Promise<Contract | null> {
    const { rows } = await query('SELECT * FROM contracts WHERE id = $1 AND deleted_at IS NULL', [id]);
    return rows[0] ? mapContract(rows[0]) : null;
  }

  async findByContractNo(contractNo: string): Promise<Contract | null> {
    const { rows } = await query('SELECT * FROM contracts WHERE contract_no = $1 AND deleted_at IS NULL', [contractNo]);
    return rows[0] ? mapContract(rows[0]) : null;
  }

  /**
   * `includeDeleted` — savatdagi mijoz kartasi uchun: mijoz o'chirilganda
   * shartnomalari ham belgilangan, lekin kartada ular ko'rinishi kerak
   * (xodim nimani qaytarayotganini bilsin).
   */
  async findByClientId(clientId: string, options?: { includeDeleted?: boolean }): Promise<Contract[]> {
    const { rows } = await query(
      `SELECT * FROM contracts WHERE client_id = $1
         ${options?.includeDeleted ? '' : 'AND deleted_at IS NULL'}
        ORDER BY debt_total DESC, days_overdue DESC`,
      [clientId],
    );
    return rows.map(mapContract);
  }

  async findPrimaryForClient(clientId: string): Promise<Contract | null> {
    const { rows } = await query(
      `SELECT * FROM contracts WHERE client_id = $1 AND deleted_at IS NULL
       ORDER BY debt_total DESC NULLS LAST, days_overdue DESC LIMIT 1`,
      [clientId],
    );
    return rows[0] ? mapContract(rows[0]) : null;
  }

  async search(q: ContractQuery): Promise<Page<Contract>> {
    const where: string[] = ['deleted_at IS NULL'];
    const params: unknown[] = [];

    if (q.clientId) {
      params.push(q.clientId);
      where.push(`client_id = $${params.length}`);
    }
    if (q.search) {
      params.push(`%${q.search.trim()}%`);
      where.push(`(contract_no ILIKE $${params.length} OR object_name ILIKE $${params.length})`);
    }
    if (q.objectName) {
      params.push(q.objectName);
      where.push(`object_name = $${params.length}`);
    }
    if (q.minDebt !== undefined) {
      params.push(q.minDebt);
      where.push(`debt_total >= $${params.length}`);
    }
    if (q.minDaysOverdue !== undefined) {
      params.push(q.minDaysOverdue);
      where.push(`days_overdue >= $${params.length}`);
    }

    const order =
      q.sort === 'overdue' ? 'days_overdue DESC'
      : q.sort === 'recent' ? 'created_at DESC'
      : 'debt_total DESC';

    const limit = Math.min(q.limit ?? 50, 200);
    const offset = q.offset ?? 0;
    const base = `FROM contracts WHERE ${where.join(' AND ')}`;

    const [{ rows: countRows }, { rows }] = await Promise.all([
      query<{ count: number }>(`SELECT COUNT(*)::int AS count ${base}`, params),
      query(`SELECT * ${base} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, params),
    ]);

    return { items: rows.map(mapContract), total: countRows[0]?.count ?? 0, limit, offset };
  }

  async upsert(data: ContractUpsert): Promise<{ contract: Contract; created: boolean }> {
    const { rows } = await query(
      CONTRACT_UPSERT_SQL,
      [
        data.clientId, data.contractNo, data.externalId, data.objectName, data.status, data.virtualStatus,
        data.category, data.totalPrice, data.firstPayment, data.monthlyPayment, data.paidTotal,
        data.remainingTotal, toIsoDate(data.contractDate), data.months, toIsoDate(data.nextPaymentDate),
        data.daysOverdue, data.debtFirst, data.debtMonthly, data.debtTotal, data.warningCount,
        data.lastWarningType, data.lastWarningMethod, data.lastWarningManager, data.lastWarningAt,
        JSON.stringify(data.raw ?? {}), data.importBatchId ?? null,
        data.createdImportBatchId ?? null,
      ],
    );
    const row = rows[0]!;
    return { contract: mapContract(row), created: Boolean(row.inserted) };
  }

  async obyektNomlari(): Promise<string[]> {
    const { rows } = await query<{ nom: string }>(
      `SELECT DISTINCT trim(object_name) AS nom
         FROM contracts
        WHERE deleted_at IS NULL AND trim(coalesce(object_name, '')) <> ''
        ORDER BY 1`,
    );
    return rows.map((r) => r.nom);
  }
}
