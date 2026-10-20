import type { User } from '@/domain/entities/User';

export interface NewUser {
  email: string;
  passwordHash: string;
  fullName: string;
  roleId: string;
  /** Obyekt cheklovi; berilmasa — bo'sh (cheklovsiz). */
  objects?: string[];
}

export interface UserPatch {
  fullName?: string;
  roleId?: string;
  passwordHash?: string;
  isActive?: boolean;
  /** Bo'sh ro'yxat — cheklovni olib tashlaydi. */
  objects?: string[];
}

/** Xato urinish qayd etilgandan keyingi holat. */
export interface FailedLoginState {
  readonly attempts: number;
  readonly locked: boolean;
}

export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  list(): Promise<User[]>;
  create(data: NewUser): Promise<User>;
  update(id: string, patch: UserPatch): Promise<User>;
  remove(id: string): Promise<void>;
  count(): Promise<number>;
  /** Tizimda hech kim qolmasligining oldini olish uchun. */
  countActiveWithPermission(permission: string): Promise<number>;

  // ─── Kirishni himoyalash ─────────────────────────────────────────────────

  /**
   * Xato urinishni qayd qiladi va chegaraga yetganda hisobni bloklaydi.
   *
   * Sanash va bloklash BITTA so'rovda bajariladi: ikkita parallel urinish
   * bir xil qiymatni o'qib, hisobni ortiqcha urinishdan keyin bloklashi
   * mumkin edi.
   */
  registerFailedLogin(id: string, maxAttempts: number): Promise<FailedLoginState>;
  /** Muvaffaqiyatli kirish yoki administrator blokdan chiqarganda. */
  clearLoginFailures(id: string): Promise<void>;
}
