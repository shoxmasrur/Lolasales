import { CLIENT_SOURCE_LABEL } from '@/domain/entities/Client';
import { BOSQICH_YORLIGI, type Purchase } from '@/domain/entities/Purchase';
import type { ClientListItem } from '@/domain/repositories/IClientRepository';

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
  { nom: 'Akkaunt', kengligi: 18 },
  { nom: 'Izoh', kengligi: 40 },
  { nom: 'Manba', kengligi: 12 },
  { nom: 'Bosqich', kengligi: 18 },
  { nom: 'Kurs', kengligi: 28 },
  { nom: 'To\'langan', kengligi: 16 },
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

export type EksportKatagi = string | number;

/**
 * Bitta mijoz — bitta Excel qatori.
 *
 * DIQQAT: summalar RAQAM bo'lib qaytadi, formatlanmagan matn emas. Excel
 * matn katakni yig'indiga qo'shmaydi va operator buni sezmaydi — ustun
 * pastidagi son shunchaki kam chiqadi.
 */
export interface EksportXarid {
  readonly purchase: Purchase | null;
  readonly kursNomi: string | null;
}

export function eksportQatori(c: ClientListItem, xarid: EksportXarid | null = null): EksportKatagi[] {
  const p = xarid?.purchase ?? null;
  return [
    c.fullName,
    c.phone ?? '',
    c.extraPhones.join(' '),
    TELEGRAM_HOLATI_NOMI[c.telegramStatus] ?? c.telegramStatus,
    c.telegramUsername ?? '',
    c.accountName ?? '',
    c.notes ?? '',
    CLIENT_SOURCE_LABEL[c.source] ?? '',
    p ? BOSQICH_YORLIGI[p.stage] : '',
    xarid?.kursNomi ?? '',
    p?.paidAmount ?? 0,
  ];
}
