import type { PublicUser, User } from '@/domain/entities/User';
import { MAX_LOGIN_ATTEMPTS, isLocked, toPublicUser } from '@/domain/entities/User';
import type { IUserRepository } from '@/domain/repositories/IUserRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { IPasswordHasher, ITokenService } from '@/domain/services/support';
import { UnauthorizedError } from '@/shared/errors';
import { childLogger } from '@/shared/logger';

const log = childLogger('auth');

/** Bloklangan hisob ko'radigan yagona matn — nima qilish kerakligi aytiladi. */
const LOCKED_MESSAGE =
  'Hisobingiz ketma-ket xato urinishlar sababli bloklandi. '
  + 'Administratorga murojaat qiling — faqat u ochishi mumkin.';

export interface LoginResult {
  readonly token: string;
  readonly user: PublicUser;
}

export class LoginUseCase {
  constructor(
    private readonly users: IUserRepository,
    private readonly hasher: IPasswordHasher,
    private readonly tokens: ITokenService,
    private readonly audit: IAuditRepository,
  ) {}

  async execute(email: string, password: string): Promise<LoginResult> {
    const user = await this.users.findByEmail(email);
    // Vaqt hujumidan himoya: foydalanuvchi topilmasa ham hash tekshiriladi.
    const hash = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
    const ok = await this.hasher.verify(password, hash);

    // Blok parolni tekshirishdan QAT'IY NAZAR ishlaydi: to'g'ri parol ham
    // ochmaydi, aks holda parolni topgan hujumchi uchun blokning ma'nosi
    // qolmasdi.
    if (user && isLocked(user)) {
      log.warn({ email: user.email }, 'Bloklangan hisobga kirishga urinish');
      throw new UnauthorizedError(LOCKED_MESSAGE);
    }

    if (!user || !ok) {
      await this.registerFailure(user, email);
      throw new UnauthorizedError('Email yoki parol noto\'g\'ri');
    }

    if (!user.isActive) throw new UnauthorizedError('Hisob o\'chirilgan');

    // Muvaffaqiyatli kirish — hisoblagich nolga tushadi, ya'ni chegara
    // KETMA-KET urinishlarga tegishli, umriga emas.
    if (user.failedLoginAttempts > 0) await this.users.clearLoginFailures(user.id);

    const publicUser = toPublicUser(user);
    return { token: this.tokens.sign(publicUser), user: publicUser };
  }

  /**
   * Xato urinishni qayd qiladi.
   *
   * Email umuman ro'yxatda bo'lmasa sanaladigan narsa yo'q — bunday
   * emailni bloklab bo'lmaydi va bloklashning ma'nosi ham yo'q.
   * Foydalanuvchi ikkala holatda ham BIR XIL matnni ko'radi, shuning
   * uchun kimning emaili bazada borligi javobdan bilinmaydi.
   */
  private async registerFailure(user: User | null, email: string): Promise<void> {
    if (!user) {
      log.warn({ email }, 'Noma\'lum email bilan kirishga urinish');
      return;
    }

    const state = await this.users.registerFailedLogin(user.id, MAX_LOGIN_ATTEMPTS);
    log.warn({ email: user.email, attempts: state.attempts, locked: state.locked }, 'Parol xato');

    if (state.locked) {
      await this.audit.record({
        actor: 'system',
        action: 'user.locked_out',
        entity: 'user',
        entityId: user.id,
        payload: { email: user.email, attempts: state.attempts },
      });
      // Uchinchi xato urinishning o'zidayoq blok haqida aytamiz — aks holda
      // xodim navbatdagi urinishida sababi tushunarsiz xato ko'rardi.
      throw new UnauthorizedError(LOCKED_MESSAGE);
    }
  }
}
