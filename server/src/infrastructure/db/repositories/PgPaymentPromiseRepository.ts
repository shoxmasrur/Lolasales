import type { NewPaymentPromise, PaymentPromise, PromiseStatus } from '@/domain/entities/PaymentPromise';
import { OCHIQ_VADA_HOLATLARI } from '@/domain/entities/PaymentPromise';
import type { IPaymentPromiseRepository, PromiseQuery } from '@/domain/repositories/IPaymentPromiseRepository';
import type { Page } from '@/domain/repositories/types';
import { HAMMASI, type MijozQamrovi } from '@/domain/entities/MijozQamrovi';
import { query } from '@/infrastructure/db/pool';
import { mijozOrqaliSharti } from '@/infrastructure/db/qamrovSharti';
import { mapPromise } from '@/infrastructure/db/mappers';
import { toIsoDate } from '@/shared/datetime';
import { NotFoundError } from '@/shared/errors';

/**
 * `status IN ('pending','partial')` — ochiq va'da sharti.
 *
 * Ikkala so'rov ham SHU qatordan quriladi: "faol va'da" bilan
 * "kuzatiladigan va'da" ta'rifi ayri yozilgani xatoga olib kelgan edi
 * (qarang: `OCHIQ_VADA_HOLATLARI`). Endi ular bir-biridan siljiy olmaydi.
 */
const OCHIQ = `status IN (${OCHIQ_VADA_HOLATLARI.map((h) => `'${h}'`).join(',')})`;

export class PgPaymentPromiseRepository implements IPaymentPromiseRepository {
  async create(data: NewPaymentPromise): Promise<PaymentPromise> {
    const { rows } = await query(
      // Kuzatuv oynasi: va'da sanasidan keyin 7 kun. Bank o'tkazmasi
      // ertasi kuni ko'rinishi odatiy hol, shuning uchun sana o'tishi
      // bilanoq "buzildi" deb belgilanmaydi.
      `INSERT INTO payment_promises
         (conversation_id, client_id, contract_id, amount, promised_date, quote, source_message_id,
          watch_until, source, call_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7, ($5)::date + INTERVAL '7 days', $8, $9) RETURNING *`,
      [
        data.conversationId,
        data.clientId,
        data.contractId ?? null,
        data.amount,
        toIsoDate(data.promisedDate),
        data.quote ?? null,
        data.sourceMessageId ?? null,
        data.source ?? 'telegram',
        data.callId ?? null,
      ],
    );
    return mapPromise(rows[0]!);
  }

  async findById(id: string): Promise<PaymentPromise | null> {
    const { rows } = await query('SELECT * FROM payment_promises WHERE id = $1 AND deleted_at IS NULL', [id]);
    return rows[0] ? mapPromise(rows[0]) : null;
  }

  /** Obyekt cheklovi: cheklanganga faqat qamrovdagi mijozlarning va'dalari (cheklanmaganda SQL o'zgarmaydi). */
  async list(q: PromiseQuery, qamrov: MijozQamrovi = HAMMASI): Promise<Page<PaymentPromise>> {
    const where: string[] = ['deleted_at IS NULL'];
    const params: unknown[] = [];

    if (q.status) {
      params.push(q.status);
      where.push(`status = $${params.length}`);
    }
    if (q.clientId) {
      params.push(q.clientId);
      where.push(`client_id = $${params.length}`);
    }
    if (q.dueBefore) {
      params.push(toIsoDate(q.dueBefore));
      where.push(`promised_date <= $${params.length}`);
    }
    if (q.dueAfter) {
      params.push(toIsoDate(q.dueAfter));
      where.push(`promised_date >= $${params.length}`);
    }

    const limit = Math.min(q.limit ?? 50, 200);
    const offset = q.offset ?? 0;
    const base = `FROM payment_promises WHERE ${where.join(' AND ')}${mijozOrqaliSharti(qamrov, params)('payment_promises.client_id')}`;

    const [{ rows: countRows }, { rows }] = await Promise.all([
      query<{ count: number }>(`SELECT COUNT(*)::int AS count ${base}`, params),
      query(`SELECT * ${base} ORDER BY promised_date ASC LIMIT ${limit} OFFSET ${offset}`, params),
    ]);

    return { items: rows.map(mapPromise), total: countRows[0]?.count ?? 0, limit, offset };
  }

  async findActiveByConversation(conversationId: string): Promise<PaymentPromise | null> {
    const { rows } = await query(
      `SELECT * FROM payment_promises
        WHERE conversation_id = $1 AND ${OCHIQ} AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT 1`,
      [conversationId],
    );
    return rows[0] ? mapPromise(rows[0]) : null;
  }

  async listOpenByConversation(conversationId: string): Promise<PaymentPromise[]> {
    const { rows } = await query(
      `SELECT * FROM payment_promises
        WHERE conversation_id = $1 AND ${OCHIQ} AND deleted_at IS NULL
        ORDER BY created_at DESC`,
      [conversationId],
    );
    return rows.map(mapPromise);
  }

  async findLatestByConversation(conversationId: string): Promise<PaymentPromise | null> {
    const { rows } = await query(
      // Holat bo'yicha FILTRLANMAYDI — sabab interfeys izohida
      // (`IPaymentPromiseRepository.findLatestByConversation`): eng
      // oxirgi BUZILGANI emas, eng oxirgi va'daning O'ZI kerak, aks
      // holda undan keyin bajarilgan yangi va'da ko'rinmay qolib, eskirgan
      // buzilgan va'da adolatsiz ravishda qayta eslatib turilardi.
      `SELECT * FROM payment_promises
        WHERE conversation_id = $1 AND deleted_at IS NULL
        ORDER BY promised_date DESC, created_at DESC LIMIT 1`,
      [conversationId],
    );
    return rows[0] ? mapPromise(rows[0]) : null;
  }

  async updateStatus(id: string, status: PromiseStatus): Promise<PaymentPromise> {
    const { rows } = await query(
      `UPDATE payment_promises
          SET status = $2, resolved_at = CASE WHEN $2 = 'pending' THEN NULL ELSE now() END
        WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id, status],
    );
    if (!rows[0]) throw new NotFoundError('To\'lov va\'dasi', id);
    return mapPromise(rows[0]);
  }

  async findOverdue(now: Date, limit: number): Promise<PaymentPromise[]> {
    const { rows } = await query(
      `SELECT * FROM payment_promises
        WHERE status = 'pending' AND promised_date < $1 AND deleted_at IS NULL
        ORDER BY promised_date ASC LIMIT $2`,
      [toIsoDate(now), limit],
    );
    return rows.map(mapPromise);
  }

  async findDueToday(todayIso: string, limit: number): Promise<PaymentPromise[]> {
    const { rows } = await query(
      // ${OCHIQ} — `pending` bilan birga `partial` ham. Qisman to'lagan
      // mijoz kelishilgan kunda eslatmasiz qolmasligi kerak; yuborishga
      // yaroqliligini `eslatmaKerakmi` yakuniy tekshiradi.
      `SELECT * FROM payment_promises
        WHERE ${OCHIQ} AND promised_date = $1
          AND reminded_at IS NULL AND deleted_at IS NULL
        ORDER BY created_at ASC LIMIT $2`,
      [todayIso, limit],
    );
    return rows.map(mapPromise);
  }

  async markReminded(id: string, at: Date): Promise<void> {
    await query('UPDATE payment_promises SET reminded_at = $2 WHERE id = $1', [id, at]);
  }

  async findWatched(limit: number): Promise<PaymentPromise[]> {
    const { rows } = await query(
      `SELECT * FROM payment_promises
        WHERE ${OCHIQ} AND deleted_at IS NULL
        ORDER BY checked_at ASC NULLS FIRST, promised_date ASC
        LIMIT $1`,
      [limit],
    );
    return rows.map(mapPromise);
  }

  async recordCheck(id: string, paidAmount: number, at: Date | null): Promise<void> {
    await query('UPDATE payment_promises SET paid_amount = $2, checked_at = $3 WHERE id = $1', [
      id,
      paidAmount,
      at,
    ]);
  }

  async markThanked(id: string, thankedAmount: number, status: PromiseStatus): Promise<void> {
    await query(
      `UPDATE payment_promises
          SET thanked_amount = $2,
              status         = $3,
              resolved_at    = CASE WHEN $3 IN ('kept','broken','cancelled') THEN now() ELSE resolved_at END
        WHERE id = $1`,
      [id, thankedAmount, status],
    );
  }
}
