import type { AgentRule, AgentRuleSection, NewAgentRule } from '@/domain/entities/AgentRule';
import type {
  AgentLesson,
  ClientProfile,
  ClientProfilePatch,
  LessonStatus,
  NewAgentLesson,
} from '@/domain/entities/AgentMemory';
import type {
  IAgentRuleRepository,
  IClientProfileRepository,
  ILessonRepository,
} from '@/domain/repositories/IAgentKnowledgeRepository';
import { query } from '@/infrastructure/db/pool';
import { toDate } from '@/infrastructure/db/mappers';
import { NotFoundError } from '@/shared/errors';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

function mapRule(r: Row): AgentRule {
  return {
    id: r.id,
    sectionId: r.section_id,
    body: r.body ?? null,
    situation: r.situation ?? null,
    badExample: r.bad_example ?? null,
    goodExample: r.good_example ?? null,
    why: r.why ?? null,
    isEnabled: Boolean(r.is_enabled),
    sortOrder: Number(r.sort_order ?? 0),
    updatedAt: toDate(r.updated_at) ?? new Date(0),
  };
}

function mapLesson(r: Row): AgentLesson {
  return {
    id: r.id,
    lesson: r.lesson,
    conversationId: r.conversation_id ?? null,
    evidence: r.evidence ?? null,
    status: r.status,
    timesSeen: Number(r.times_seen ?? 1),
    reviewedBy: r.reviewed_by ?? null,
    reviewedAt: toDate(r.reviewed_at),
    createdAt: toDate(r.created_at) ?? new Date(0),
  };
}

export class PgAgentRuleRepository implements IAgentRuleRepository {
  async listSections(): Promise<AgentRuleSection[]> {
    const [{ rows: sections }, { rows: rules }] = await Promise.all([
      query('SELECT * FROM agent_rule_sections ORDER BY sort_order ASC'),
      query('SELECT * FROM agent_rules WHERE deleted_at IS NULL ORDER BY sort_order ASC, created_at ASC'),
    ]);

    const bySection = new Map<string, AgentRule[]>();
    for (const row of rules) {
      const list = bySection.get(row.section_id) ?? [];
      list.push(mapRule(row));
      bySection.set(row.section_id, list);
    }

    return sections.map((s) => ({
      id: s.id,
      key: s.key,
      title: s.title,
      description: s.description ?? null,
      kind: s.kind,
      sortOrder: Number(s.sort_order ?? 0),
      styleVersion: s.style_version ?? null,
      rules: bySection.get(s.id) ?? [],
    }));
  }

  async countRules(): Promise<number> {
    const { rows } = await query<{ count: number }>('SELECT COUNT(*)::int AS count FROM agent_rules WHERE deleted_at IS NULL');
    return rows[0]?.count ?? 0;
  }

  async createSection(data: {
    key: string;
    title: string;
    description?: string | null;
    kind: 'bullets' | 'examples';
    sortOrder: number;
  }): Promise<AgentRuleSection> {
    const { rows } = await query(
      `INSERT INTO agent_rule_sections (key, title, description, kind, sort_order)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (key) DO UPDATE SET title = EXCLUDED.title,
                                       description = EXCLUDED.description,
                                       sort_order = EXCLUDED.sort_order
       RETURNING *`,
      [data.key, data.title, data.description ?? null, data.kind, data.sortOrder],
    );
    const s = rows[0]!;
    return {
      id: s.id,
      key: s.key,
      title: s.title,
      description: s.description ?? null,
      kind: s.kind,
      sortOrder: Number(s.sort_order ?? 0),
      styleVersion: s.style_version ?? null,
      rules: [],
    };
  }

  async addRule(data: NewAgentRule): Promise<AgentRule> {
    const { rows } = await query(
      `INSERT INTO agent_rules
         (section_id, body, situation, bad_example, good_example, why, sort_order, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,
               COALESCE($7, (SELECT COALESCE(MAX(sort_order),0)+1 FROM agent_rules WHERE section_id=$1 AND deleted_at IS NULL)),
               $8)
       RETURNING *`,
      [
        data.sectionId,
        data.body ?? null,
        data.situation ?? null,
        data.badExample ?? null,
        data.goodExample ?? null,
        data.why ?? null,
        data.sortOrder ?? null,
        data.updatedBy ?? null,
      ],
    );
    return mapRule(rows[0]!);
  }

  async updateRule(
    id: string,
    patch: Partial<Omit<NewAgentRule, 'sectionId'>> & { isEnabled?: boolean },
  ): Promise<AgentRule> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (col: string, value: unknown): void => {
      params.push(value);
      sets.push(`${col} = $${params.length}`);
    };

    if (patch.body !== undefined) push('body', patch.body);
    if (patch.situation !== undefined) push('situation', patch.situation);
    if (patch.badExample !== undefined) push('bad_example', patch.badExample);
    if (patch.goodExample !== undefined) push('good_example', patch.goodExample);
    if (patch.why !== undefined) push('why', patch.why);
    if (patch.isEnabled !== undefined) push('is_enabled', patch.isEnabled);
    if (patch.sortOrder !== undefined) push('sort_order', patch.sortOrder);
    if (patch.updatedBy !== undefined) push('updated_by', patch.updatedBy);

    if (!sets.length) {
      const { rows } = await query('SELECT * FROM agent_rules WHERE id = $1 AND deleted_at IS NULL', [id]);
      if (!rows[0]) throw new NotFoundError('Qoida', id);
      return mapRule(rows[0]);
    }

    params.push(id);
    const { rows } = await query(
      `UPDATE agent_rules SET ${sets.join(', ')}
        WHERE id = $${params.length} AND deleted_at IS NULL RETURNING *`,
      params,
    );
    if (!rows[0]) throw new NotFoundError('Qoida', id);
    return mapRule(rows[0]);
  }

  /** Qoida bazadan yo'qolmaydi — faqat belgilanadi (032-migratsiya). */
  async removeRule(id: string): Promise<void> {
    await query('UPDATE agent_rules SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [id]);
  }

  async clearSection(sectionKey: string): Promise<void> {
    await query(
      `UPDATE agent_rules SET deleted_at = now()
        WHERE deleted_at IS NULL
          AND section_id = (SELECT id FROM agent_rule_sections WHERE key = $1)`,
      [sectionKey],
    );
  }
}

export class PgLessonRepository implements ILessonRepository {
  async list(status?: LessonStatus): Promise<AgentLesson[]> {
    const { rows } = status
      ? await query(
          `SELECT * FROM agent_lessons WHERE status = $1 AND deleted_at IS NULL
            ORDER BY times_seen DESC, created_at DESC`,
          [status],
        )
      : await query('SELECT * FROM agent_lessons WHERE deleted_at IS NULL ORDER BY created_at DESC');
    return rows.map(mapLesson);
  }

  async listApproved(limit: number): Promise<AgentLesson[]> {
    const { rows } = await query(
      `SELECT * FROM agent_lessons WHERE status = 'approved' AND deleted_at IS NULL
        ORDER BY times_seen DESC, created_at DESC LIMIT $1`,
      [limit],
    );
    return rows.map(mapLesson);
  }

  /**
   * Bir xil saboq qayta-qayta kelaveradi. Yangi yozuv o'rniga
   * hisoblagichni oshiramiz — takrorlanishi ishonchni bildiradi.
   */
  async recordProposal(data: NewAgentLesson): Promise<AgentLesson> {
    const normalized = data.lesson.trim();

    const { rows: existing } = await query(
      `SELECT * FROM agent_lessons
        WHERE lower(btrim(lesson)) = lower(btrim($1)) AND status <> 'rejected'
          AND deleted_at IS NULL
        LIMIT 1`,
      [normalized],
    );

    if (existing[0]) {
      const { rows } = await query(
        'UPDATE agent_lessons SET times_seen = times_seen + 1 WHERE id = $1 RETURNING *',
        [existing[0].id],
      );
      return mapLesson(rows[0]!);
    }

    const { rows } = await query(
      `INSERT INTO agent_lessons (lesson, conversation_id, evidence)
       VALUES ($1,$2,$3) RETURNING *`,
      [normalized, data.conversationId ?? null, data.evidence ?? null],
    );
    return mapLesson(rows[0]!);
  }

  async setStatus(id: string, status: LessonStatus, reviewedBy: string | null): Promise<AgentLesson> {
    const { rows } = await query(
      `UPDATE agent_lessons SET status = $2, reviewed_by = $3, reviewed_at = now()
        WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id, status, reviewedBy],
    );
    if (!rows[0]) throw new NotFoundError('Saboq', id);
    return mapLesson(rows[0]);
  }

  /** Saboq bazadan yo'qolmaydi — faqat belgilanadi (032-migratsiya). */
  async remove(id: string): Promise<void> {
    await query('UPDATE agent_lessons SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL', [id]);
  }
}

function mapProfile(r: Row): ClientProfile {
  return {
    clientId: r.client_id,
    clientType: r.client_type ?? null,
    summary: r.summary ?? null,
    whatWorks: r.what_works ?? null,
    bestContactTime: r.best_contact_time ?? null,
    interlocutor: r.interlocutor_name || r.interlocutor_relation
      ? {
          name: r.interlocutor_name,
          gender: r.interlocutor_gender ?? null,
          relation: r.interlocutor_relation ?? null,
        }
      : null,
    updatedAt: toDate(r.updated_at) ?? new Date(0),
  };
}

export class PgClientProfileRepository implements IClientProfileRepository {
  async find(clientId: string): Promise<ClientProfile | null> {
    const { rows } = await query(
      'SELECT * FROM client_profiles WHERE client_id = $1 AND deleted_at IS NULL',
      [clientId],
    );
    if (!rows[0]) return null;
    return mapProfile(rows[0]);
  }

  async upsert(clientId: string, patch: ClientProfilePatch): Promise<ClientProfile> {
    const { rows } = await query(
      `INSERT INTO client_profiles (client_id, client_type, summary, what_works, best_contact_time,
                                    interlocutor_name, interlocutor_gender, interlocutor_relation, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
       -- Profil tozalangan (yumshoq o'chirilgan) bo'lsa, eski qiymatlar
       -- QAYTA TIKLANMASLIGI kerak — tozalashning maqsadi shu edi. Shuning
       -- uchun o'chirilgan qatorda COALESCE ishlatilmaydi: yangi qiymat
       -- to'g'ridan-to'g'ri yoziladi va qator qayta "tirik" bo'ladi.
       ON CONFLICT (client_id) DO UPDATE SET
         client_type = CASE WHEN client_profiles.deleted_at IS NULL
                            THEN COALESCE(EXCLUDED.client_type, client_profiles.client_type)
                            ELSE EXCLUDED.client_type END,
         summary = CASE WHEN client_profiles.deleted_at IS NULL
                        THEN COALESCE(EXCLUDED.summary, client_profiles.summary)
                        ELSE EXCLUDED.summary END,
         what_works = CASE WHEN client_profiles.deleted_at IS NULL
                           THEN COALESCE(EXCLUDED.what_works, client_profiles.what_works)
                           ELSE EXCLUDED.what_works END,
         best_contact_time = CASE WHEN client_profiles.deleted_at IS NULL
                                  THEN COALESCE(EXCLUDED.best_contact_time, client_profiles.best_contact_time)
                                  ELSE EXCLUDED.best_contact_time END,
         -- Suhbatdosh uch maydoni BIRGA almashadi: yangi odam kelsa, eskisining
         -- jinsi yoki kimligi unga yopishib qolmasligi kerak. Ism ham, kimligi
         -- ham kelmasa — patch suhbatdoshga tegmaydi, eskisi qoladi.
         interlocutor_name = CASE WHEN client_profiles.deleted_at IS NULL
                   AND EXCLUDED.interlocutor_name IS NULL AND EXCLUDED.interlocutor_relation IS NULL
              THEN client_profiles.interlocutor_name
              ELSE EXCLUDED.interlocutor_name END,
         interlocutor_gender = CASE WHEN client_profiles.deleted_at IS NULL
                   AND EXCLUDED.interlocutor_name IS NULL AND EXCLUDED.interlocutor_relation IS NULL
              THEN client_profiles.interlocutor_gender
              ELSE EXCLUDED.interlocutor_gender END,
         interlocutor_relation = CASE WHEN client_profiles.deleted_at IS NULL
                   AND EXCLUDED.interlocutor_name IS NULL AND EXCLUDED.interlocutor_relation IS NULL
              THEN client_profiles.interlocutor_relation
              ELSE EXCLUDED.interlocutor_relation END,
         deleted_at = NULL,
         updated_at = now()
       RETURNING *`,
      [
        clientId,
        patch.clientType ?? null,
        patch.summary ?? null,
        patch.whatWorks ?? null,
        patch.bestContactTime ?? null,
        patch.interlocutor?.name ?? null,
        patch.interlocutor?.gender ?? null,
        patch.interlocutor?.relation ?? null,
      ],
    );
    return mapProfile(rows[0]!);
  }
}
