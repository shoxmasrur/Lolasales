import type { RecontactTopic } from '@/domain/entities/RecontactTopic';

export interface NewRecontactTopic {
  readonly title: string;
  readonly instruction: string;
  /** Berilmasa — ro'yxat oxiriga (mavjud eng kattasidan keyin). */
  readonly sortOrder?: number;
  readonly isEnabled?: boolean;
  /** Foydalanuvchi id'si. */
  readonly createdBy?: string | null;
}

export interface RecontactTopicPatch {
  readonly title?: string;
  readonly instruction?: string;
  readonly sortOrder?: number;
  readonly isEnabled?: boolean;
}

export interface IRecontactTopicRepository {
  /**
   * O'chirilmagan mavzular — `sort_order`, keyin `title` bo'yicha.
   * `includeDisabled` bo'lmasa faqat yoqilganlar (operator tanlovi uchun);
   * admin sozlamalar sahifasi hammasini oladi.
   */
  list(options?: { includeDisabled?: boolean }): Promise<RecontactTopic[]>;
  /** O'chirilgan (`deleted_at`) mavzu `null` qaytadi — u yo'q deb hisoblanadi. */
  findById(id: string): Promise<RecontactTopic | null>;
  create(data: NewRecontactTopic): Promise<RecontactTopic>;
  /**
   * Faqat berilgan maydonlar o'zgaradi. O'chirilgan yoki topilmagan
   * mavzuda `null` — o'chirilgan mavzu tahrir orqali tirilmaydi.
   */
  update(id: string, patch: RecontactTopicPatch): Promise<RecontactTopic | null>;
  /**
   * Yumshoq o'chirish. `true` — hozir o'chirildi; `false` — topilmadi
   * yoki allaqachon o'chirilgan (qayta chaqiruv `deleted_at` ni surmaydi).
   */
  softDelete(id: string): Promise<boolean>;
}
