/**
 * Kunlik xulosa boti: token shakli va `chat_id` ni topish qoidalari.
 *
 * Tarmoqqa chiqish bu yerda YO'Q — shuning uchun qoidalarni testlash oson.
 * Haqiqiy so'rovlar `infrastructure/telegram/BotApi.ts` da.
 */

/**
 * BotFather tokeni: `<bot id>:<sir>`.
 *
 * Shaklni OLDINDAN tekshiramiz, chunki noto'g'ri qiymat bilan Telegramga
 * chiqish ma'nosiz — foydalanuvchi ko'pincha yarim nusxalangan qatorni
 * kiritadi va aniq xato matni kerak.
 */
const TOKEN_SHAKLI = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;

export function tokenXatosi(token: string): string | null {
  const t = token.trim();
  if (!t) return 'Token kiritilmadi';
  return TOKEN_SHAKLI.test(t)
    ? null
    : "Token noto'g'ri ko'rinishda (BotFather bergan qiymatni to'liq nusxalang)";
}

/** `getUpdates` javobidagi bitta yangilanish (faqat kerakli maydonlar). */
export interface TelegramYangilanish {
  readonly update_id: number;
  readonly message?: {
    readonly chat: {
      readonly id: number;
      readonly type: string;
      readonly first_name?: string;
      readonly username?: string;
    };
    readonly text?: string;
  };
}

export interface ChatNomzodi {
  readonly chatId: string;
  readonly nomi: string | null;
  readonly username: string | null;
}

/**
 * Botga aynan tasdiqlash KODINI yozgan odamning shaxsiy suhbatini topish.
 *
 * "Oxirgi yozgan odam" qoidasi yetarli emas edi — bot username'i ochiq va
 * qidiriladi, botga birinchi bo'lib yozgan istalgan begona kishi nomzod
 * bo'lib qolardi. Shu sabab endi FAQAT admin ko'rgan bir martalik kodni
 * aynan (bo'shliqlarsiz) yozgan xabar hisobga olinadi.
 *
 * FAQAT `private`: bot guruhga qo'shilgan bo'lsa, kunlik xulosa
 * xodimlarning umumiy guruhiga tushib ketmasligi kerak — unda mijoz
 * ismlari bor.
 *
 * Bir nechta mos kelsa BIRINCHISI olinadi: kod bir marta beriladi va bir
 * marta ishlatiladi, keyingi mos matnlar tasodifiy takror bo'lishi mumkin.
 */
export function kodliChat(
  updates: readonly TelegramYangilanish[],
  kod: string,
): ChatNomzodi | null {
  for (const u of updates) {
    const chat = u.message?.chat;
    if (!chat || chat.type !== 'private') continue;
    if (u.message?.text?.trim() !== kod) continue;
    return {
      chatId: String(chat.id),
      nomi: chat.first_name ?? null,
      username: chat.username ?? null,
    };
  }
  return null;
}
