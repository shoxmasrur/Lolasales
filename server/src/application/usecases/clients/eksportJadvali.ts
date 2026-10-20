import { SHARTNOMA_HOLATLARI } from '@/domain/entities/shartnomaHolati';
import type { ClientWithDebt } from '@/domain/repositories/IClientRepository';

export interface EksportUstuni {
  readonly nom: string;
  /** Excel ustun kengligi (belgilarda). */
  readonly kengligi: number;
}

/**
 * Fayldagi ustunlar — tartibi `eksportQatori` bilan QAT'IY bir xil.
 *
 * Ustun qo'shilganda ikkalasi birga o'zgaradi; testda uzunliklari
 * solishtiriladi, ya'ni bittasini unutish darhol ko'rinadi.
 */
export const EKSPORT_USTUNLARI: readonly EksportUstuni[] = [
  { nom: 'F.I.O.', kengligi: 32 },
  { nom: 'Telefon', kengligi: 16 },
  { nom: 'Qo\'shimcha raqamlar', kengligi: 24 },
  { nom: 'Telegram holati', kengligi: 18 },
  { nom: 'Telegram username', kengligi: 20 },
  { nom: 'Shartnomalar soni', kengligi: 10 },
  { nom: 'Shartnoma holatlari', kengligi: 22 },
  { nom: 'Akkaunt', kengligi: 18 },
  { nom: 'Oyma-oy kechikish', kengligi: 16 },
  { nom: 'Umumiy kechikish', kengligi: 16 },
  { nom: 'Kechikish (kun)', kengligi: 14 },
  { nom: 'Izoh', kengligi: 40 },
];

/**
 * Telegram holatlarining o'zbekcha nomi.
 *
 * NEGA NUSXA: aynan shu lug'at web tomonda ham bor
 * (`web/src/lib/format.ts` — `TELEGRAM_STATUS_LABEL`). Ikki paket kod
 * almashmaydi, shuning uchun nusxa muqarrar. Holat qo'shilganda
 * IKKALASIGA ham yoziladi; unutilsa fayl kalitning o'zini ko'rsatadi —
 * xunuk, lekin xato emas.
 */
const TELEGRAM_HOLATI_NOMI: Record<string, string> = {
  unknown: 'Tekshirilmagan',
  searching: 'Qidirilmoqda',
  found: 'Topildi',
  not_found: 'Telegramda yo\'q',
  privacy_restricted: 'Maxfiylik',
  name_mismatch: 'Ism mos kelmadi',
  blocked: 'Bloklagan',
  deactivated: 'Akkaunt o\'chirilgan',
};

/** Shartnoma holati kaliti → CRM'dagi nomi. Tanilmasa kalitning o'zi. */
function holatNomi(key: string): string {
  return SHARTNOMA_HOLATLARI.find((h) => h.key === key)?.label ?? key;
}

export type EksportKatagi = string | number;

/**
 * Bitta mijoz — bitta Excel qatori.
 *
 * DIQQAT: summalar RAQAM bo'lib qaytadi, formatlanmagan matn emas. Excel
 * matn katakni yig'indiga qo'shmaydi va operator buni sezmaydi — ustun
 * pastidagi son shunchaki kam chiqadi.
 */
export function eksportQatori(c: ClientWithDebt): EksportKatagi[] {
  return [
    c.fullName,
    c.phone ?? '',
    c.extraPhones.join(' '),
    TELEGRAM_HOLATI_NOMI[c.telegramStatus] ?? c.telegramStatus,
    c.telegramUsername ?? '',
    c.contractsCount,
    c.contractStatuses.map(holatNomi).join(', '),
    c.accountName ?? '',
    c.debtMonthly,
    c.debtTotal,
    c.daysOverdue,
    c.notes ?? '',
  ];
}
