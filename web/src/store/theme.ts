import { create } from 'zustand';

export type ThemeChoice = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const KEY = 'debitor.theme';

/** Saqlangan tanlov. Buzuq qiymat bo'lsa tizim sozlamasiga qaytamiz. */
export function storedChoice(): ThemeChoice {
  const v = localStorage.getItem(KEY);
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}

const systemDark = (): boolean =>
  window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;

export function resolve(choice: ThemeChoice): ResolvedTheme {
  if (choice === 'system') return systemDark() ? 'dark' : 'light';
  return choice;
}

/**
 * Mavzuni hujjatga qo'llaydi.
 *
 * `data-theme` aynan `<html>` ga qo'yiladi: CSS o'zgaruvchilari `:root` da
 * e'lon qilingan, ya'ni butun sahifa — modal oynalar va portal orqali
 * chizilganlari ham — bir vaqtda almashadi.
 */
export function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme;
}

interface ThemeState {
  /** Foydalanuvchi tanlovi — shu saqlanadi. */
  choice: ThemeChoice;
  /** Haqiqatda qo'llangan mavzu ("system" hal qilingandan keyin). */
  theme: ResolvedTheme;
  setChoice: (choice: ThemeChoice) => void;
  /** Tizim sozlamasi o'zgarganda chaqiriladi. */
  syncSystem: () => void;
}

export const useTheme = create<ThemeState>((set, get) => ({
  choice: storedChoice(),
  theme: resolve(storedChoice()),

  setChoice: (choice) => {
    localStorage.setItem(KEY, choice);
    const theme = resolve(choice);
    applyTheme(theme);
    set({ choice, theme });
  },

  syncSystem: () => {
    // Faqat "tizim" rejimida ahamiyatli: foydalanuvchi aniq mavzu
    // tanlagan bo'lsa, tizim sozlamasi o'zgargani unga tegmasligi kerak.
    if (get().choice !== 'system') return;
    const theme = resolve('system');
    applyTheme(theme);
    set({ theme });
  },
}));

/**
 * Grafik ranglari.
 *
 * Recharts CSS sinflarini emas, aniq rang satrini talab qiladi — shuning
 * uchun `ink` shkalasidan foydalanib bo'lmaydi va ranglar shu yerda
 * mavzuga qarab tanlanadi.
 *
 * Faqat NEYTRAL elementlar almashadi (o'q, to'r, tooltip). Ma'noli
 * ranglar — ko'k "biz undirgan", yashil, qizil — ikkala fonda ham
 * o'qiladi va o'zgarmaydi.
 */
export interface ChartColors {
  readonly grid: string;
  readonly axis: string;
  readonly tooltipBg: string;
  readonly tooltipBorder: string;
  readonly legend: string;
}

export function chartColors(theme: ResolvedTheme): ChartColors {
  return theme === 'light'
    ? {
        grid: '#e5e9ef',
        axis: '#64748b',
        tooltipBg: '#ffffff',
        tooltipBorder: '#dfe3ea',
        legend: '#4b5768',
      }
    : {
        grid: '#242b38',
        axis: '#65748f',
        tooltipBg: '#141821',
        tooltipBorder: '#384050',
        legend: '#8593aa',
      };
}
