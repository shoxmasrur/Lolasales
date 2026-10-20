import type { Bayram } from '@/domain/entities/bayram';
import type { IHolidayRepository, NewBayram } from '@/domain/repositories/IHolidayRepository';
import { query } from '@/infrastructure/db/pool';
import { mapBayram } from '@/infrastructure/db/mappers';

const COLS = 'id, name, starts_on, ends_on, yillik';

export class PgHolidayRepository implements IHolidayRepository {
  async list(): Promise<Bayram[]> {
    // Yillik yozuvlar oldinda emas, sana bo'yicha aralash turadi —
    // ekranda ham shu tartib ko'rinadi.
    const { rows } = await query(`SELECT ${COLS} FROM holidays ORDER BY starts_on`);
    return rows.map(mapBayram);
  }

  async findById(id: string): Promise<Bayram | null> {
    const { rows } = await query(`SELECT ${COLS} FROM holidays WHERE id = $1`, [id]);
    return rows[0] ? mapBayram(rows[0]) : null;
  }

  async create(data: NewBayram): Promise<Bayram> {
    const { rows } = await query(
      `INSERT INTO holidays (name, starts_on, ends_on, yillik, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${COLS}`,
      [data.name, data.startsOn, data.endsOn, data.yillik, data.createdBy ?? null],
    );
    return mapBayram(rows[0]!);
  }

  async update(id: string, data: Omit<NewBayram, 'createdBy'>): Promise<Bayram | null> {
    const { rows } = await query(
      `UPDATE holidays
          SET name = $2, starts_on = $3, ends_on = $4, yillik = $5
        WHERE id = $1
      RETURNING ${COLS}`,
      [id, data.name, data.startsOn, data.endsOn, data.yillik],
    );
    return rows[0] ? mapBayram(rows[0]) : null;
  }

  async remove(id: string): Promise<void> {
    await query('DELETE FROM holidays WHERE id = $1', [id]);
  }
}
