import type {
  IClientPhoneBlockRepository,
  PhoneBlockReportRow,
} from '@/domain/repositories/IClientPhoneBlockRepository';
import { query } from '@/infrastructure/db/pool';
import { HAMMASI, type MijozQamrovi } from '@/domain/entities/MijozQamrovi';
import { mijozQamroviSharti } from '@/infrastructure/db/qamrovSharti';

type Row = Record<string, any>;

export class PgClientPhoneBlockRepository implements IClientPhoneBlockRepository {
  /**
   * `DO NOTHING` ataylab: birinchi uzishning sababi va vaqti saqlanib
   * qolishi kerak. Operator tugmani ikki marta bossa, ikkinchi bosish
   * birinchisining izohini o'chirib yuborardi.
   */
  async block(entry: {
    clientId: string;
    phone: string;
    reason?: string | null;
    blockedBy?: string | null;
  }): Promise<void> {
    await query(
      `INSERT INTO client_phone_blocks (client_id, phone, reason, blocked_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (client_id, phone) DO NOTHING`,
      [entry.clientId, entry.phone, entry.reason ?? null, entry.blockedBy ?? null],
    );
  }

  async unblock(clientId: string, phone: string): Promise<void> {
    await query('DELETE FROM client_phone_blocks WHERE client_id = $1 AND phone = $2', [
      clientId,
      phone,
    ]);
  }

  async isPhoneBlocked(phone: string): Promise<boolean> {
    const { rows } = await query<Row>('SELECT 1 FROM client_phone_blocks WHERE phone = $1 LIMIT 1', [phone]);
    return rows.length > 0;
  }

  async listForClient(clientId: string): Promise<string[]> {
    const { rows } = await query<Row>(
      'SELECT phone FROM client_phone_blocks WHERE client_id = $1',
      [clientId],
    );
    return rows.map((r) => String(r.phone));
  }

  async listForClients(clientIds: readonly string[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (!clientIds.length) return out;

    const { rows } = await query<Row>(
      'SELECT client_id, phone FROM client_phone_blocks WHERE client_id = ANY($1::uuid[])',
      [[...clientIds]],
    );
    for (const r of rows) {
      const id = String(r.client_id);
      const list = out.get(id);
      if (list) list.push(String(r.phone));
      else out.set(id, [String(r.phone)]);
    }
    return out;
  }

  /**
   * Shartnoma raqamlari ham qaytadi: CRM jamoasi mijozni ism bilan emas,
   * shartnoma raqami bilan topadi.
   */
  async report(qamrov: MijozQamrovi = HAMMASI): Promise<PhoneBlockReportRow[]> {
    // Obyekt cheklovi: cheklanmaganda shart va parametr yo'q — SQL avvalgidek.
    const params: unknown[] = [];
    const qamrovSharti = qamrov.cheklangan ? ` AND ${mijozQamroviSharti(qamrov, 'c', params)}` : '';
    const { rows } = await query<Row>(
      `SELECT b.client_id, b.phone, b.reason, b.blocked_by, b.blocked_at,
              c.full_name,
              u.full_name AS blocked_by_name,
              COALESCE(
                ARRAY(
                  SELECT ct.contract_no FROM contracts ct
                  WHERE ct.client_id = b.client_id AND ct.deleted_at IS NULL
                  ORDER BY ct.contract_no
                ),
                '{}'
              ) AS contract_nos
         FROM client_phone_blocks b
         JOIN clients c ON c.id = b.client_id
         LEFT JOIN users u ON u.id = b.blocked_by
        WHERE c.deleted_at IS NULL${qamrovSharti}
        ORDER BY b.blocked_at DESC`,
      params,
    );

    return rows.map((r) => ({
      clientId: String(r.client_id),
      phone: String(r.phone),
      reason: r.reason ?? null,
      blockedBy: r.blocked_by ?? null,
      blockedAt: new Date(r.blocked_at),
      clientName: String(r.full_name),
      contractNos: (r.contract_nos ?? []) as string[],
      blockedByName: r.blocked_by_name ?? null,
    }));
  }

  async clientIdsWithBlocks(): Promise<string[]> {
    const { rows } = await query<Row>('SELECT DISTINCT client_id FROM client_phone_blocks');
    return rows.map((r) => String(r.client_id));
  }
}
