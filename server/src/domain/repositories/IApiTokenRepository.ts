import type { ApiToken, NewApiToken } from '@/domain/entities/ApiToken';
import type { User } from '@/domain/entities/User';

export interface CreatedApiToken {
  readonly token: ApiToken;
  /** Ochiq kalit — FAQAT yaratilganda bir marta qaytariladi. */
  readonly plainKey: string;
}

export interface IApiTokenRepository {
  list(): Promise<ApiToken[]>;
  create(data: NewApiToken): Promise<CreatedApiToken>;
  revoke(id: string): Promise<void>;
  /** Kalit bo'yicha egasini topadi va `last_used_at` ni yangilaydi. */
  resolveUser(plainKey: string, now: Date): Promise<User | null>;
}
