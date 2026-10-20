import type { ConversationState, EscalationStage } from '@/lib/types';

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
  negotiating: 'Muzokara',
  promised: 'Va\'da berdi',
  agreed: 'Kelishildi',
  refused: 'Rad etdi',
  unreachable: 'Javob yo\'q',
  escalated: 'Inson kerak',
  closed: 'Yopilgan',
};

export const STATE_COLOR: Record<ConversationState, string> = {
  new: 'bg-ink-800 text-ink-300',
  contacted: 'bg-sky-500/15 text-sky-300',
  negotiating: 'bg-amber-500/15 text-amber-300',
  promised: 'bg-violet-500/15 text-violet-300',
  agreed: 'bg-emerald-500/15 text-emerald-300',
  refused: 'bg-red-500/15 text-red-300',
  unreachable: 'bg-ink-800 text-ink-400',
  escalated: 'bg-orange-500/20 text-orange-300',
  closed: 'bg-ink-800 text-ink-500',
};

export const STAGE_LABEL: Record<EscalationStage, string> = {
  soft: 'Eslatma',
  hard: 'Qat\'iy',
  legal: 'Huquqiy',
};

export const STAGE_COLOR: Record<EscalationStage, string> = {
  soft: 'bg-emerald-500/15 text-emerald-300',
  hard: 'bg-amber-500/15 text-amber-300',
  legal: 'bg-red-500/15 text-red-300',
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

/**
 * Shartnoma holatining rangi.
 *
 * Faqat RANG shu yerda: nomlar serverdan keladi
 * (`/clients/contract-statuses`), aks holda ikkita lug'at vaqt o'tib
 * bir-biridan ajrab ketardi.
 *
 * Agent "Сотилди", "К оплате" va "Проц. отказ" bo'yicha yozadi
 * (2026-10-13 dan). "Проц. отказ" baribir ajralib turadi — bekor
 * qilinayotgan shartnoma; "К возврату" — agent yozmaydi.
 */
export const CONTRACT_STATUS_CLASS: Record<string, string> = {
  sold: 'chip bg-emerald-500/15 text-emerald-300',
  cancellation_process: 'chip bg-orange-500/15 text-orange-300',
  for_return: 'chip bg-red-500/15 text-red-300',
  for_payment: 'chip bg-amber-500/15 text-amber-300',
  waiting: 'chip bg-ink-800 text-ink-400',
};
