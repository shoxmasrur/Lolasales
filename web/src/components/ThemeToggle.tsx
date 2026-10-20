import type { ReactNode } from 'react';
import clsx from 'clsx';
import { useTheme, type ThemeChoice } from '@/store/theme';

/**
 * Mavzu tanlagich: yorug' / qorong'i / tizim.
 *
 * "Tizim" — sukutdagi holat: operator kompyuterida kechqurun qorong'i
 * rejim yoqilsa, panel ham o'zi qorayadi. Aniq tanlov qilingan bo'lsa
 * tizim sozlamasi unga tegmaydi.
 *
 * Tanlov `localStorage` da saqlanadi va sahifa ochilishida
 * `index.html` dagi inline skript uni birinchi chizishdan OLDIN qo'yadi —
 * shu sabab qayta kirganda chaqnash bo'lmaydi.
 */
const OPTIONS: Array<{ key: ThemeChoice; label: string; icon: ReactNode }> = [
  {
    key: 'light',
    label: 'Yorug\'',
    icon: (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
  {
    key: 'dark',
    label: 'Qorong\'i',
    icon: (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    ),
  },
  {
    key: 'system',
    label: 'Tizim',
    icon: (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="4" width="20" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
  },
];

export function ThemeToggle({ vertical = false }: { vertical?: boolean } = {}) {
  const choice = useTheme((s) => s.choice);
  const setChoice = useTheme((s) => s.setChoice);

  return (
    <div
      className={clsx(
        'flex gap-0.5 rounded-lg border border-ink-800 bg-ink-900/60 p-0.5',
        vertical ? 'flex-col' : 'items-center',
      )}
      role="group"
      aria-label="Mavzu"
    >
      {OPTIONS.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => setChoice(o.key)}
          title={o.label}
          aria-pressed={choice === o.key}
          className={clsx(
            // Telefonda (<768px) tugmalar kamida 40×40px bo'lishi kerak —
            // ≥768px da (planshet tasmasi va kompyuter) hozirgi 22px
            // balandlik o'zgarmaydi.
            'flex flex-1 items-center justify-center rounded-md py-1 transition-colors max-md:min-h-10 max-md:min-w-10',
            choice === o.key
              ? 'bg-ink-800 text-ink-100'
              : 'text-ink-500 hover:bg-ink-800/50 hover:text-ink-300',
          )}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}
