import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Permission } from '@/domain/entities/Permission';
import type { User } from '@/domain/entities/User';
import { can, isLocked } from '@/domain/entities/User';
import type { IUserRepository } from '@/domain/repositories/IUserRepository';
import type { IApiTokenRepository } from '@/domain/repositories/IApiTokenRepository';
import type { ITokenService } from '@/domain/services/support';
import { ForbiddenError, UnauthorizedError } from '@/shared/errors';

/**
 * So'rovdagi API kalit — `X-Api-Key` yoki `Authorization: Bearer dbt_…`.
 *
 * NEGA BEARER HAM: bulutdagi MCP mijozlari (ovozli qo'ng'iroq
 * platformalari) ko'pincha faqat `Authorization` sarlavhasini yubora
 * oladi. `dbt_` prefiksi JWT bilan adashib ketmasligini kafolatlaydi —
 * JWT hech qachon `dbt_` bilan boshlanmaydi.
 */
export function apiKalitiniOl(headers: {
  'x-api-key'?: string | string[];
  authorization?: string;
}): string | null {
  const x = headers['x-api-key'];
  if (typeof x === 'string' && x.trim()) return x.trim();
  const auth = headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    const v = auth.slice(7).trim();
    if (v.startsWith('dbt_')) return v;
  }
  return null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
      /** So'rov API kalit orqali kelganmi (auditda ajratish uchun). */
      viaApiKey?: boolean;
    }
  }
}

/**
 * Huquqlar tokenda emas, bazada. Shuning uchun har bir so'rovda
 * foydalanuvchi roli bilan o'qiladi — rol o'zgartirilsa darhol kuchga kiradi.
 * Ortiqcha so'rovlarni kamaytirish uchun qisqa muddatli kesh.
 */
const CACHE_TTL_MS = 15_000;

interface CacheEntry {
  user: User;
  expiresAt: number;
}

export class AuthContext {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly tokens: ITokenService,
    private readonly users: IUserRepository,
    private readonly apiTokens: IApiTokenRepository,
  ) {}

  /** Rol yoki foydalanuvchi o'zgarganda keshni tozalash. */
  invalidate(userId?: string): void {
    if (userId) this.cache.delete(userId);
    else this.cache.clear();
  }

  async loadUser(userId: string): Promise<User | null> {
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.user;

    const user = await this.users.findById(userId);
    if (user) this.cache.set(userId, { user, expiresAt: Date.now() + CACHE_TTL_MS });
    return user;
  }

  /**
   * Har bir himoyalangan so'rovda ishlaydi.
   *
   * Ikki xil avtorizatsiya:
   *   • `Authorization: Bearer <jwt>` — dashboard foydalanuvchisi
   *   • `X-Api-Key: dbt_…`           — mashina (MCP orqali boshqa agentlar)
   *   • `Authorization: Bearer dbt_…` — xuddi X-Api-Key (bulutdagi MCP mijozlari uchun)
   * Ikkalasi ham foydalanuvchiga, demak rolga bog'lanadi — huquqlar bir xil ishlaydi.
   */
  authenticate(): RequestHandler {
    return (req: Request, _res: Response, next: NextFunction) => {
      const apiKey = apiKalitiniOl(req.headers);
      if (apiKey) {
        void this.apiTokens
          .resolveUser(apiKey, new Date())
          .then((user) => {
            if (!user) {
              next(new UnauthorizedError('API kalit yaroqsiz, bekor qilingan yoki muddati tugagan'));
              return;
            }
            req.user = user;
            req.viaApiKey = true;
            next();
          })
          .catch(next);
        return;
      }

      const header = req.headers.authorization;
      if (!header?.startsWith('Bearer ')) {
        next(new UnauthorizedError());
        return;
      }

      let payload;
      try {
        payload = this.tokens.verify(header.slice(7));
      } catch (err) {
        next(err);
        return;
      }

      void this.loadUser(payload.sub)
        .then((user) => {
          if (!user) {
            next(new UnauthorizedError('Foydalanuvchi topilmadi'));
            return;
          }
          if (!user.isActive) {
            next(new ForbiddenError('Hisobingiz o\'chirilgan'));
            return;
          }
          // Blok kirish sahifasidagina emas, MAVJUD tokenga ham tegishli:
          // aks holda bloklangan hisob token muddati tugagunicha
          // ishlayverardi.
          if (isLocked(user)) {
            next(new ForbiddenError('Hisobingiz bloklangan — administratorga murojaat qiling'));
            return;
          }
          req.user = user;
          next();
        })
        .catch(next);
    };
  }

  /** Ruxsat talab qiluvchi yo'llar uchun. */
  static require(...permissions: Permission[]): RequestHandler {
    return (req: Request, _res: Response, next: NextFunction) => {
      const user = req.user;
      if (!user) {
        next(new UnauthorizedError());
        return;
      }
      const allowed = permissions.every((p) => can(user, p));
      if (!allowed) {
        next(new ForbiddenError(`Ruxsat yo'q: ${permissions.join(', ')}`));
        return;
      }
      next();
    };
  }
}

export const requirePermission = AuthContext.require;

export function currentUser(req: Request): User {
  if (!req.user) throw new UnauthorizedError();
  return req.user;
}
