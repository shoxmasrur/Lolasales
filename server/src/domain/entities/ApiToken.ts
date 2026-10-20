export interface ApiToken {
  readonly id: string;
  readonly name: string;
  /** Ro'yxatda tanib olish uchun — to'liq kalit emas. */
  readonly tokenPrefix: string;
  readonly userId: string;
  readonly userEmail: string;
  readonly roleName: string;
  readonly expiresAt: Date | null;
  readonly lastUsedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;
}

export interface NewApiToken {
  name: string;
  userId: string;
  expiresAt?: Date | null;
  createdBy?: string | null;
}

export function isTokenUsable(token: Pick<ApiToken, 'revokedAt' | 'expiresAt'>, now: Date): boolean {
  if (token.revokedAt) return false;
  if (token.expiresAt && token.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}
