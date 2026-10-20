import type { RecontactTopic } from '@/domain/entities/RecontactTopic';
import type {
  IRecontactTopicRepository,
  NewRecontactTopic,
  RecontactTopicPatch,
} from '@/domain/repositories/IRecontactTopicRepository';
import { query } from '@/infrastructure/db/pool';

type Row = Record<string, any>;

const COLS = 'id, title, instruction, sort_order, is_enabled';

function mapRecontactTopic(r: Row): RecontactTopic {
  return {
    id: r.id,
    title: r.title,
    instruction: r.instruction,
    sortOrder: Number(r.sort_order),
    isEnabled: Boolean(r.is_enabled),
  };
}

export class PgRecontactTopicRepository implements IRecontactTopicRepository {
  async list(options: { includeDisabled?: boolean } = {}): Promise<RecontactTopic[]> {
    // Ro'yxat kichik (o'nlab mavzu) va keshlanmaydi: admin o'zgartirgan
    // mavzu operator oynasida darhol ko'rinishi kerak.
    const { rows } = await query(
      `SELECT ${COLS} FROM recontact_topics
        WHERE deleted_at IS NULL
          AND ($1::boolean OR is_enabled)
        ORDER BY sort_order, title`,
      [Boolean(options.includeDisabled)],
    );
    return rows.map(mapRecontactTopic);
  }

  async findById(id: string): Promise<RecontactTopic | null> {
    const { rows } = await query(
      `SELECT ${COLS} FROM recontact_topics WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    return rows[0] ? mapRecontactTopic(rows[0]) : null;
  }

  async create(data: NewRecontactTopic): Promise<RecontactTopic> {
    // `sort_order` berilmasa — oxiriga. O'chirilganlar ham hisobga
    // olinadi: bu shunchaki tartib raqami, bo'shliq qolishi zarar emas.
    const { rows } = await query(
      `INSERT INTO recontact_topics (title, instruction, sort_order, is_enabled, created_by)
       VALUES ($1, $2,
               COALESCE($3::int, (SELECT COALESCE(MAX(sort_order), 0) + 10 FROM recontact_topics)),
               $4, $5)
       RETURNING ${COLS}`,
      [data.title, data.instruction, data.sortOrder ?? null, data.isEnabled ?? true, data.createdBy ?? null],
    );
    return mapRecontactTopic(rows[0]!);
  }

  async update(id: string, patch: RecontactTopicPatch): Promise<RecontactTopic | null> {
    // COALESCE — berilmagan maydon o'zgarmaydi. Hamma ustun NOT NULL,
    // ya'ni `null` "o'zgartirma" degani bilan to'qnashmaydi.
    // `deleted_at IS NULL` — o'chirilgan mavzu tahrir orqali tirilmaydi.
    const { rows } = await query(
      `UPDATE recontact_topics
          SET title       = COALESCE($2, title),
              instruction = COALESCE($3, instruction),
              sort_order  = COALESCE($4::int, sort_order),
              is_enabled  = COALESCE($5::boolean, is_enabled)
        WHERE id = $1 AND deleted_at IS NULL
      RETURNING ${COLS}`,
      [id, patch.title ?? null, patch.instruction ?? null, patch.sortOrder ?? null, patch.isEnabled ?? null],
    );
    return rows[0] ? mapRecontactTopic(rows[0]) : null;
  }

  async softDelete(id: string): Promise<boolean> {
    // `deleted_at IS NULL` sharti: qayta chaqiruv birinchi o'chirish
    // vaqtini surib yubormaydi.
    const { rowCount } = await query(
      'UPDATE recontact_topics SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL',
      [id],
    );
    return (rowCount ?? 0) > 0;
  }
}
