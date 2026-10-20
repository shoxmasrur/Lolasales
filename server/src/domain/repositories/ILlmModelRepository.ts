import type { LlmModel, NewLlmModel } from '@/domain/entities/LlmModel';

export interface LlmModelPatch {
  label?: string;
  inputPricePerMtok?: number | null;
  outputPricePerMtok?: number | null;
  isEnabled?: boolean;
}

export interface ILlmModelRepository {
  /** `onlyEnabled` — akkauntga biriktirish uchun ro'yxat. */
  list(o?: { onlyEnabled?: boolean }): Promise<LlmModel[]>;
  findById(id: string): Promise<LlmModel | null>;
  create(input: NewLlmModel): Promise<LlmModel>;
  update(id: string, patch: LlmModelPatch): Promise<LlmModel>;
  remove(id: string): Promise<void>;
}
