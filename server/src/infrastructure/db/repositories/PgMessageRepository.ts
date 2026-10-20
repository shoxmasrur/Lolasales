import type { XonzodaTranscript, Message, MessageStatus, NewMessage, TranscriptStatus } from '@/domain/entities/Message';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { Page, Pagination } from '@/domain/repositories/types';
import { query } from '@/infrastructure/db/pool';
import { mapMessage } from '@/infrastructure/db/mappers';
import { NotFoundError } from '@/shared/errors';

export class PgMessageRepository implements IMessageRepository {
  async findById(id: string): Promise<Message | null> {
    const { rows } = await query('SELECT * FROM messages WHERE id = $1 AND deleted_at IS NULL', [id]);
    return rows[0] ? mapMessage(rows[0]) : null;
  }

  async listByConversation(conversationId: string, pagination: Pagination = {}): Promise<Page<Message>> {
    const limit = Math.min(pagination.limit ?? 100, 500);
    const offset = pagination.offset ?? 0;

    const [{ rows: countRows }, { rows }] = await Promise.all([
      query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM messages WHERE conversation_id = $1 AND deleted_at IS NULL',
        [conversationId],
      ),
      query(
        `SELECT * FROM messages WHERE conversation_id = $1 AND deleted_at IS NULL
         ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [conversationId, limit, offset],
      ),
    ]);

    // Chatda eskidan yangiga ko'rsatiladi.
    return {
      items: rows.map(mapMessage).reverse(),
      total: countRows[0]?.count ?? 0,
      limit,
      offset,
    };
  }

  async recentByConversation(conversationId: string, limit: number): Promise<Message[]> {
    const { rows } = await query(
      `SELECT * FROM messages
        WHERE conversation_id = $1 AND status <> 'draft' AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT $2`,
      [conversationId, limit],
    );
    return rows.map(mapMessage).reverse();
  }

  async create(data: NewMessage): Promise<Message> {
    const { rows } = await query(
      `INSERT INTO messages (conversation_id, direction, author, author_user_id, body,
                             telegram_msg_id, status, meta, sent_at,
                             media_kind, media_path, media_mime, media_size_bytes,
                             media_duration_sec, media_file_name,
                             transcript, transcript_status,
                             image_kind, image_status, image_note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [
        data.conversationId,
        data.direction,
        data.author,
        data.authorUserId ?? null,
        data.body,
        data.telegramMsgId ?? null,
        data.status ?? 'queued',
        JSON.stringify(data.meta ?? {}),
        data.sentAt ?? null,
        data.media?.kind ?? null,
        data.media?.path ?? null,
        data.media?.mimeType ?? null,
        data.media?.sizeBytes ?? null,
        data.media?.durationSec ?? null,
        data.media?.fileName ?? null,
        data.transcript ?? null,
        data.transcriptStatus ?? 'none',
        data.imageKind ?? null,
        data.imageStatus ?? 'none',
        data.imageNote ?? null,
      ],
    );
    return mapMessage(rows[0]!);
  }

  async setTranscript(
    id: string,
    status: TranscriptStatus,
    transcript?: string | null,
  ): Promise<Message> {
    const { rows } = await query(
      `UPDATE messages SET transcript_status = $2, transcript = COALESCE($3, transcript)
        WHERE id = $1 RETURNING *`,
      [id, status, transcript ?? null],
    );
    if (!rows[0]) throw new NotFoundError('Xabar', id);
    return mapMessage(rows[0]);
  }

  async setXonzodaTranscript(id: string, natija: XonzodaTranscript): Promise<void> {
    await query(
      `UPDATE messages
          SET transcript_xonzoda = $2, transcript_xonzoda_status = $3,
              transcript_xonzoda_error = $4, transcript_xonzoda_ms = $5
        WHERE id = $1`,
      [id, natija.text, natija.status, natija.error, natija.ms === null ? null : Math.round(natija.ms)],
    );
  }

  async markEdited(id: string, body: string, editedAt: Date): Promise<Message> {
    const { rows } = await query(
      `UPDATE messages
          SET body = $2,
              original_body = COALESCE(original_body, body),
              edited_at = $3
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING *`,
      [id, body, editedAt],
    );
    if (!rows[0]) throw new NotFoundError('Xabar', id);
    return mapMessage(rows[0]);
  }

  async markRevoked(id: string, revokedAt: Date): Promise<Message> {
    const { rows } = await query(
      `UPDATE messages SET revoked_at = $2
        WHERE id = $1 AND deleted_at IS NULL
        RETURNING *`,
      [id, revokedAt],
    );
    if (!rows[0]) throw new NotFoundError('Xabar', id);
    return mapMessage(rows[0]);
  }

  async updateStatus(
    id: string,
    status: MessageStatus,
    extra?: { telegramMsgId?: number | null; error?: string | null; sentAt?: Date | null },
  ): Promise<Message> {
    const { rows } = await query(
      `UPDATE messages
          SET status = $2,
              telegram_msg_id = COALESCE($3, telegram_msg_id),
              error = $4,
              sent_at = COALESCE($5, sent_at)
        WHERE id = $1
        RETURNING *`,
      [id, status, extra?.telegramMsgId ?? null, extra?.error ?? null, extra?.sentAt ?? null],
    );
    if (!rows[0]) throw new NotFoundError('Xabar', id);
    return mapMessage(rows[0]);
  }

  async markReadUpTo(conversationId: string, maxTelegramMsgId: number, readAt: Date): Promise<number> {
    const { rowCount } = await query(
      `UPDATE messages
          SET status = 'read', read_at = $3
        WHERE conversation_id = $1
          AND direction = 'out'
          AND telegram_msg_id IS NOT NULL
          AND telegram_msg_id <= $2
          AND read_at IS NULL
          AND deleted_at IS NULL`,
      [conversationId, maxTelegramMsgId, readAt],
    );
    return rowCount ?? 0;
  }

  async existsTelegramMessage(conversationId: string, telegramMsgId: number): Promise<boolean> {
    const { rows } = await query(
      `SELECT 1 FROM messages
        WHERE conversation_id = $1 AND telegram_msg_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [conversationId, telegramMsgId],
    );
    return rows.length > 0;
  }

  async countByStatus(status: MessageStatus): Promise<number> {
    const { rows } = await query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM messages WHERE status = $1 AND deleted_at IS NULL',
      [status],
    );
    return rows[0]?.count ?? 0;
  }

  async hasOutbound(conversationId: string): Promise<boolean> {
    const { rows } = await query<{ bor: boolean }>(
      `SELECT EXISTS (
                SELECT 1 FROM messages
                 WHERE conversation_id = $1
                   AND direction = 'out'
                   AND status <> 'draft'
              ) AS bor`,
      [conversationId],
    );
    return rows[0]?.bor === true;
  }

  async hasPossiblyDeliveredOutbound(conversationId: string): Promise<boolean> {
    // `idx_messages_conv (conversation_id, created_at)` bo'yicha — bitta
    // suhbatning xabarlari, EXISTS birinchi mos qatorda to'xtaydi.
    const { rows } = await query<{ bor: boolean }>(
      `SELECT EXISTS (
                SELECT 1 FROM messages
                 WHERE conversation_id = $1
                   AND direction = 'out'
                   AND status NOT IN ('draft', 'failed')
              ) AS bor`,
      [conversationId],
    );
    return rows[0]?.bor === true;
  }
}
