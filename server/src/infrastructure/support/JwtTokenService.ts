import jwt from 'jsonwebtoken';
import type { PublicUser } from '@/domain/entities/User';
import type { ITokenService, TokenPayload } from '@/domain/services/support';
import { config } from '@/shared/config';
import { UnauthorizedError } from '@/shared/errors';

export class JwtTokenService implements ITokenService {
  sign(user: PublicUser): string {
    return jwt.sign({ sub: user.id, email: user.email }, config.JWT_SECRET, {
      expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
    });
  }

  verify(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(token, config.JWT_SECRET);
      if (typeof decoded === 'string') throw new UnauthorizedError('Token noto\'g\'ri');
      return { sub: String(decoded.sub), email: String(decoded.email ?? '') };
    } catch {
      throw new UnauthorizedError('Token yaroqsiz yoki muddati tugagan');
    }
  }
}
