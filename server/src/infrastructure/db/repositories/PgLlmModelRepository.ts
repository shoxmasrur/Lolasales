import type { LlmModel, NewLlmModel } from '@/domain/entities/LlmModel';
import type {
  ILlmModelRepository,
  LlmModelPatch,
} from '@/domain/repositories/ILlmModelRepository';
import { query } from '@/infrastructure/db/pool';
import { mapLlmModel } from '@/infrastructure/db/mappers';
import { NotFoundError } from '@/shared/errors';

export class PgLlmModelRepository implements ILlmModelRepository {
  async list(o: { onlyEnabled?: boolean } = {}): Promise<LlmModel[]> {
    const { rows } = await query(
      `SELECT * FROM llm_models
        WHERE ($1::boolean IS NOT TRUE OR is_enabled)
        ORDER BY provider, label`,
      [Boolean(o.onlyEnabled)],
    );
    return rows.map(mapLlmModel);
  }

  async findById(id: string): Promise<LlmModel | null> {
    const { rows } = await query('SELECT * FROM llm_models WHERE id = $1', [id]);
    return rows[0] ? mapLlmModel(rows[0]) : null;
  }

  async create(input: NewLlmModel): Promise<LlmModel> {
    // Operator bir modelni ikki marta qo'shsa xato emas — mavjud qator
    // yangi nom/narx bilan yangilanadi, ikkilanma qator hosil bo'lmaydi.
    const { rows } = await query(
      `INSERT INTO llm_models (provider, model, label, input_price_per_mtok, output_price_per_mtok)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (provider, model) DO UPDATE SET
         label = EXCLUDED.label,
         input_price_per_mtok = EXCLUDED.input_price_per_mtok,
         output_price_per_mtok = EXCLUDED.output_price_per_mtok,
         updated_at = now()
       RETURNING *`,
      [
        input.provider,
        input.model,
        input.label,
        input.inputPricePerMtok ?? null,
        input.outputPricePerMtok ?? null,
      ],
    );
    return mapLlmModel(rows[0]!);
  }

  async update(id: string, patch: LlmModelPatch): Promise<LlmModel> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const push = (col: string, value: unknown) => {
      params.push(value);
      sets.push(`${col} = $${params.length}`);
    };
    if (patch.label !== undefined) push('label', patch.label);
    if (patch.inputPricePerMtok !== undefined) push('input_price_per_mtok', patch.inputPricePerMtok);
    if (patch.outputPricePerMtok !== undefined) push('output_price_per_mtok', patch.outputPricePerMtok);
    if (patch.isEnabled !== undefined) push('is_enabled', patch.isEnabled);
    push('updated_at', new Date());

    params.push(id);
    const { rows } = await query(
      `UPDATE llm_models SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params,
    );
    if (!rows[0]) throw new NotFoundError('LLM model', id);
    return mapLlmModel(rows[0]);
  }

  // Qattiq DELETE: akkauntlar `ON DELETE SET NULL` bilan himoyalangan,
  // ya'ni model o'chirilganda akkaunt standart yo'lga qaytadi, xato
  // bermaydi.
  async remove(id: string): Promise<void> {
    await query('DELETE FROM llm_models WHERE id = $1', [id]);
  }
}
