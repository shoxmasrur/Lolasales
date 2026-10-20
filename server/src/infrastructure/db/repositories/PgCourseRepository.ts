import type { Course, CourseKnowledge, NewCourse, NewKnowledge } from '@/domain/entities/Course';
import type { ICourseRepository } from '@/domain/repositories/ICourseRepository';
import { query } from '@/infrastructure/db/pool';
import { mapCourse, mapCourseKnowledge } from '@/infrastructure/db/mappers';
import { NotFoundError } from '@/shared/errors';

/** Maydon nomi (kodda) → ustun nomi (bazada). Faqat shu ro'yxatdagilar SQL'ga tushadi. */
const COURSE_COLS: Record<keyof NewCourse, string> = {
  name: 'name',
  description: 'description',
  salesStart: 'sales_start',
  salesEnd: 'sales_end',
  price: 'price',
  duration: 'duration',
  topics: 'topics',
  startsOn: 'starts_on',
  groupLink: 'group_link',
  isActive: 'is_active',
  installmentAllowed: 'installment_allowed',
  installmentParts: 'installment_parts',
  installmentFirstMin: 'installment_first_min',
  linkAfter: 'link_after',
};

const KNOWLEDGE_COLS: Record<keyof NewKnowledge, string> = {
  kind: 'kind',
  title: 'title',
  body: 'body',
  sortOrder: 'sort_order',
  isEnabled: 'is_enabled',
};

function sets<T extends object>(
  patch: Partial<T>,
  cols: Record<keyof T, string>,
  startAt = 1,
): { sql: string; values: unknown[] } {
  const parts: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(patch) as Array<[keyof T, unknown]>) {
    const col = cols[key];
    if (!col || value === undefined) continue;
    values.push(value);
    parts.push(`${col} = $${startAt + values.length - 1}`);
  }
  return { sql: parts.join(', '), values };
}

export class PgCourseRepository implements ICourseRepository {
  async list(): Promise<Course[]> {
    const { rows } = await query(
      `SELECT * FROM courses WHERE deleted_at IS NULL ORDER BY sales_start DESC, id`,
    );
    return rows.map(mapCourse);
  }

  async findById(id: string): Promise<Course | null> {
    const { rows } = await query(`SELECT * FROM courses WHERE id = $1 AND deleted_at IS NULL`, [id]);
    return rows[0] ? mapCourse(rows[0]) : null;
  }

  async create(d: NewCourse): Promise<Course> {
    const { rows } = await query(
      `INSERT INTO courses
         (name, description, sales_start, sales_end, price, duration, topics, starts_on, group_link,
          is_active, installment_allowed, installment_parts, installment_first_min, link_after)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        d.name, d.description, d.salesStart, d.salesEnd, d.price, d.duration, d.topics, d.startsOn,
        d.groupLink, d.isActive, d.installmentAllowed, d.installmentParts, d.installmentFirstMin, d.linkAfter,
      ],
    );
    return mapCourse(rows[0]!);
  }

  async update(id: string, patch: Partial<NewCourse>): Promise<Course> {
    const { sql, values } = sets(patch, COURSE_COLS, 2);
    if (!sql) {
      const current = await this.findById(id);
      if (!current) throw new NotFoundError('Kurs', id);
      return current;
    }
    const { rows } = await query(
      `UPDATE courses SET ${sql} WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id, ...values],
    );
    if (!rows[0]) throw new NotFoundError('Kurs', id);
    return mapCourse(rows[0]);
  }

  async remove(id: string): Promise<void> {
    await query(`UPDATE courses SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`, [id]);
  }

  async listKnowledge(courseId: string): Promise<CourseKnowledge[]> {
    const { rows } = await query(
      `SELECT * FROM course_knowledge WHERE course_id = $1 ORDER BY sort_order, updated_at, id`,
      [courseId],
    );
    return rows.map(mapCourseKnowledge);
  }

  async addKnowledge(courseId: string, d: NewKnowledge): Promise<CourseKnowledge> {
    const { rows } = await query(
      `INSERT INTO course_knowledge (course_id, kind, title, body, sort_order, is_enabled)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [courseId, d.kind, d.title, d.body, d.sortOrder, d.isEnabled],
    );
    return mapCourseKnowledge(rows[0]!);
  }

  async updateKnowledge(id: string, patch: Partial<NewKnowledge>): Promise<CourseKnowledge> {
    const { sql, values } = sets(patch, KNOWLEDGE_COLS, 2);
    const { rows } = sql
      ? await query(`UPDATE course_knowledge SET ${sql} WHERE id = $1 RETURNING *`, [id, ...values])
      : await query(`SELECT * FROM course_knowledge WHERE id = $1`, [id]);
    if (!rows[0]) throw new NotFoundError('Ma\'lumot yozuvi', id);
    return mapCourseKnowledge(rows[0]);
  }

  async removeKnowledge(id: string): Promise<void> {
    await query(`DELETE FROM course_knowledge WHERE id = $1`, [id]);
  }
}
