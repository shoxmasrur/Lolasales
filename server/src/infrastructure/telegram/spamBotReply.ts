import type { SpamCheckResult } from '@/domain/services/ITelegramGateway';

/**
 * @SpamBot javobini tahlil qilish.
 *
 * Bot javobi tilga qarab o'zgaradi (akkaunt tiliga bog'liq), shuning uchun
 * ingliz va rus tilidagi iboralar ham tekshiriladi. Aniq matn Telegram
 * tomonidan o'zgartirilishi mumkin — shuning uchun mantiq "kalit iboralar"
 * asosida, qat'iy moslikka tayanmaydi.
 */

const CLEAN_MARKERS = [
  'no limits are currently applied',
  'good news',
  'free as a bird',
  'ограничения сняты',
  'никаких ограничений',
  'хорошие новости',
  // Real javob (telegram_oila, 2026-08-04): "Ваш аккаунт свободен от
  // каких-либо ограничений." — "никаких ограничений" bilan mos kelmaydi,
  // chunki bu yerda "каких-либо". Shuning uchun alohida belgi kerak.
  'свободен от каких-либо ограничений',
  'свободен от ограничений',
];

/**
 * Faqat ANIQ hukm iboralari. "Unfortunately", "к сожалению" kabi umumiy
 * so'zlar bu ro'yxatda YO'Q: SpamBot ularni sog'lom akkauntga ham
 * tushuntirish sifatida yozadi va akkaunt xato "cheklangan" deb
 * belgilanib, butun yuborish to'xtab qolardi.
 */
const LIMITED_MARKERS = [
  "i'm very sorry that you had to contact me",
  'i am very sorry that you had to contact me',
  'is now limited until',
  'will be limited until',
  'account was limited',
  'your account is limited',
  'мне очень жаль, что вам пришлось обратиться',
  'ваш аккаунт ограничен',
  'ограничен до',
  'ограничения будут сняты',
];

const BANNED_MARKERS = [
  'account has been banned',
  'permanently limited',
  'аккаунт заблокирован',
  'заблокирован навсегда',
];

/** "limited until 12 September 2026" / "ограничен до 12.09.2026" */
const DATE_PATTERNS: Array<RegExp> = [
  /until\s+(\d{1,2}\s+\w+\s+\d{4})/i,
  /until\s+(\d{4}-\d{2}-\d{2})/i,
  /до\s+(\d{1,2}\s+\S+\s+\d{4})/i,
  /до\s+(\d{2}\.\d{2}\.\d{4})/i,
];

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  января: 0, февраля: 1, марта: 2, апреля: 3, мая: 4, июня: 5,
  июля: 6, августа: 7, сентября: 8, октября: 9, ноября: 10, декабря: 11,
};

export function parseSpamBotReply(text: string): SpamCheckResult {
  const message = text.trim();
  if (!message) return { status: 'check_failed', message: null, until: null };

  const lower = message.toLowerCase();
  const has = (markers: string[]): boolean => markers.some((m) => lower.includes(m));

  if (has(BANNED_MARKERS)) {
    return { status: 'banned', message, until: null };
  }

  // "Toza" belgisi cheklov belgisidan ustun: bot ba'zan
  // "sorry ... but good news, no limits" deb boshlashi mumkin.
  if (has(CLEAN_MARKERS) && !lower.includes('limited until')) {
    return { status: 'clean', message, until: null };
  }

  if (has(LIMITED_MARKERS)) {
    return { status: 'limited', message, until: parseUntil(message) };
  }

  // Aniq hukm topilmadi — "cheklangan" deb taxmin qilmaymiz.
  // `check_failed` yuborishni to'xtatmaydi, faqat dashboardda belgi qo'yadi.
  return { status: 'check_failed', message, until: null };
}

function parseUntil(text: string): Date | null {
  for (const pattern of DATE_PATTERNS) {
    const match = pattern.exec(text);
    if (!match?.[1]) continue;

    const raw = match[1].trim();

    // 2026-09-12
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const d = new Date(`${raw}T00:00:00Z`);
      if (!Number.isNaN(d.getTime())) return d;
    }

    // 12.09.2026
    const dotted = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(raw);
    if (dotted) {
      const d = new Date(`${dotted[3]}-${dotted[2]}-${dotted[1]}T00:00:00Z`);
      if (!Number.isNaN(d.getTime())) return d;
    }

    // 12 September 2026 / 12 сентября 2026
    const worded = /^(\d{1,2})\s+(\S+)\s+(\d{4})$/.exec(raw);
    if (worded) {
      const month = MONTHS[worded[2]!.toLowerCase()];
      if (month !== undefined) {
        const d = new Date(Date.UTC(Number(worded[3]), month, Number(worded[1])));
        if (!Number.isNaN(d.getTime())) return d;
      }
    }
  }
  return null;
}
