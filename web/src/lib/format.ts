import type { ConversationState } from '@/lib/types';

const somFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });

export function som(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '—';
  return `${somFmt.format(Math.round(amount))} so'm`;
}

/** Katta summalarni qisqartirib ko'rsatish: 1.2 mlrd, 45 mln */
export function somShort(amount: number | null | undefined): string {
  if (!amount) return '0';
  const abs = Math.abs(amount);
  // Chegaralar yaxlitlashni hisobga oladi: 999 999,99 → "1.0 mln", "1000 ming" emas.
  if (abs >= 999_500_000) return `${(amount / 1e9).toFixed(1)} mlrd`;
  if (abs >= 999_500) return `${(amount / 1e6).toFixed(1)} mln`;
  if (abs >= 1e3) return `${Math.round(amount / 1e3)} ming`;
  return somFmt.format(amount);
}

const MONTHS = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
];

export function dateUz(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()}-${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function timeShort(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/** "5 daqiqa oldin", "2 kun oldin" */
export function relative(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'hozir';
  if (min < 60) return `${min} daq oldin`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} soat oldin`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} kun oldin`;
  return dateUz(d);
}

/**
 * Kelajakdagi vaqt: "25 daqiqadan keyin", "3 kundan keyin".
 *
 * `relative()` o'tmish uchun ("5 daq oldin"), bu esa cheklov qachon
 * ochilishini ko'rsatish uchun. Vaqt o'tib ketgan bo'lsa "muddati
 * tugagan" — "-5 daqiqadan keyin" degan bema'nilik chiqmasin.
 */
export function untilRelative(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';

  const diff = d.getTime() - Date.now();
  if (diff <= 0) return 'muddati tugagan';

  const min = Math.ceil(diff / 60000);
  if (min < 60) return `${min} daqiqadan keyin`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} soatdan keyin`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} kundan keyin`;
  return dateUz(d);
}

export const STATE_LABEL: Record<ConversationState, string> = {
  new: 'Yangi',
  contacted: 'Yozildi',
  active: 'Faol',
  closed: 'Yopilgan',
};

export const STATE_COLOR: Record<ConversationState, string> = {
  new: 'bg-ink-800 text-ink-300',
  contacted: 'bg-sky-500/15 text-sky-300',
  active: 'bg-emerald-500/15 text-emerald-300',
  closed: 'bg-ink-800 text-ink-500',
};

export const TELEGRAM_STATUS_LABEL: Record<string, string> = {
  unknown: 'Tekshirilmagan',
  searching: 'Qidirilmoqda',
  found: 'Topildi',
  not_found: 'Telegramda yo\'q',
  privacy_restricted: 'Maxfiylik',
  name_mismatch: 'Ism mos kelmadi',
  blocked: 'Bloklagan',
  deactivated: 'Akkaunt o\'chirilgan',
};

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}
