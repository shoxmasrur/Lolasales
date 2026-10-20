/** Barcha kutilgan (biznes) xatolarning bazasi. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly statusCode: number = 400,
    readonly code: string = 'APP_ERROR',
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id?: string) {
    super(id ? `${entity} topilmadi: ${id}` : `${entity} topilmadi`, 404, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, 'VALIDATION_ERROR', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Avtorizatsiya talab qilinadi') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Ruxsat yo\'q') {
    super(message, 403, 'FORBIDDEN');
  }
}

/**
 * `code` ixtiyoriy: marshrut yoki web ziddiyat TURINI ajratishi kerak
 * bo'lsa, matnni solishtirish o'rniga kodni o'qiydi.
 */
export class ConflictError extends AppError {
  constructor(message: string, code = 'CONFLICT') {
    super(message, 409, code);
  }
}

/** Telegram tomondan kelgan cheklov (FLOOD_WAIT, PEER_FLOOD, PRIVACY). */
export class TelegramError extends AppError {
  constructor(
    message: string,
    readonly telegramCode: string,
    readonly retryAfterSec?: number,
  ) {
    super(message, 503, 'TELEGRAM_ERROR', { telegramCode, retryAfterSec });
  }
}

/**
 * Amal operator to'xtatgani uchun uzildi.
 *
 * Bu NOSOZLIK emas, QAROR. Chaqiruvchi uni "xato" deb sanamasligi kerak:
 * ommaviy ishda to'xtatilgan mijoz "xato" ustuniga tushsa, operator o'zi
 * bosgan tugmaning natijasini nosozlik deb o'qirdi va sababini qidirib
 * vaqt yo'qotardi.
 *
 * Alohida sinf kerak, chunki uzilish bir necha qatlamdan o'tadi (model
 * chaqiruvi → agent → suhbat boshlash → ommaviy ish) va oraliqdagi
 * `catch` bloklari uni oddiy xatodan ajrata olishi shart.
 */
export class AbortedError extends AppError {
  constructor(message = 'Amal to\'xtatildi') {
    super(message, 499, 'ABORTED');
  }
}

export class KillSwitchError extends AppError {
  constructor() {
    super('Global to\'xtatish yoqilgan (KILL_SWITCH) — xabar yuborilmadi', 423, 'KILL_SWITCH');
  }
}

/**
 * Navbat ESKIRGANI uchun uzildi: model javob yozayotgan payt mijoz yangi
 * xabar yubordi va tayyor matn allaqachon o'tib ketgan savolga javob
 * bo'lib qoldi.
 *
 * `AbortedError` dan meros oladi — bu ataylab. Uzilishni biladigan, lekin
 * SABABINI bilmaydigan eski `catch` bloklari uni baribir "qaror" deb
 * qabul qiladi va suhbatni nosozlik sifatida operatorga chiqarmaydi.
 * Sababni ajratishi kerak bo'lgan joylar esa avval shu sinfni tekshiradi:
 * operatorga "agent o'chirilgan" deb yozib qo'yish yolg'on bo'lardi —
 * hech kim hech narsani o'chirmagan, mijoz shunchaki yozishda davom etgan.
 */
export class StaleTurnError extends AbortedError {
  constructor(message = 'Javob eskirdi — mijoz yangi xabar yubordi') {
    super(message);
  }
}

