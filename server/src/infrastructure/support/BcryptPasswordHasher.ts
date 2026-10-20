import bcrypt from 'bcryptjs';
import type { IPasswordHasher } from '@/domain/services/support';

const ROUNDS = 12;

export class BcryptPasswordHasher implements IPasswordHasher {
  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, ROUNDS);
  }

  verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
