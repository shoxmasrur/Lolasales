import { useEffect, useId, useRef, useState } from 'react';
import clsx from 'clsx';

export interface MultiSelectOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  /** Filtr nomi — tugmada ko'rinadi: "Telegram: hammasi", "Telegram: 2 ta". */
  nom: string;
  options: ReadonlyArray<MultiSelectOption<T>>;
  value: readonly T[];
  onChange: (next: T[]) => void;
  className?: string;
}

/**
 * Bir nechta qiymat tanlanadigan filtr.
 *
 * Bitta filtr ichida tanlanganlar "yoki" bilan birlashadi; hech narsa
 * tanlanmagani — "hammasi". Ko'rinishi `select.input` bilan bir xil,
 * filtrlar qatorida ular yonma-yon turadi.
 *
 * NEGA `<select multiple>` EMAS: u ro'yxatni doim ochiq chizadi va
 * telefonda Ctrl bosib tanlash imkonsiz.
 */
export function MultiSelect<T extends string>({ nom, options, value, onChange, className }: Props<T>) {
  const [ochiq, setOchiq] = useState(false);
  const ildiz = useRef<HTMLDivElement>(null);
  const royxatId = useId();

  // Tashqariga bosish va Escape ro'yxatni yopadi.
  useEffect(() => {
    if (!ochiq) return undefined;
    const tashqari = (e: MouseEvent | TouchEvent): void => {
      if (!ildiz.current?.contains(e.target as Node)) setOchiq(false);
    };
    const tugma = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOchiq(false);
    };
    document.addEventListener('mousedown', tashqari);
    document.addEventListener('touchstart', tashqari);
    document.addEventListener('keydown', tugma);
    return () => {
      document.removeEventListener('mousedown', tashqari);
      document.removeEventListener('touchstart', tashqari);
      document.removeEventListener('keydown', tugma);
    };
  }, [ochiq]);

  const tanlangan = options.filter((o) => value.includes(o.value));
  const yorliq =
    tanlangan.length === 0
      ? `${nom}: hammasi`
      : tanlangan.length === 1
        ? tanlangan[0]!.label
        : `${nom}: ${tanlangan.length} ta`;

  const almashtir = (v: T): void => {
    // Tartib ro'yxatdagidek saqlanadi — so'rov kaliti bosish tartibiga bog'lanmasin.
    const keyingi = value.includes(v) ? value.filter((x) => x !== v) : [...value, v];
    onChange(options.map((o) => o.value).filter((x) => keyingi.includes(x)));
  };

  return (
    <div ref={ildiz} className={clsx('relative', className)}>
      <button
        type="button"
        className={clsx(
          'input flex items-center justify-between gap-2 text-left',
          tanlangan.length > 0 && 'border-brand-500/60',
        )}
        aria-haspopup="listbox"
        aria-expanded={ochiq}
        aria-controls={royxatId}
        title={tanlangan.length > 1 ? tanlangan.map((o) => o.label).join(', ') : undefined}
        onClick={() => setOchiq((o) => !o)}
      >
        <span className="truncate">{yorliq}</span>
        <svg
          className={clsx('h-4 w-4 shrink-0 text-ink-500 transition-transform', ochiq && 'rotate-180')}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {ochiq ? (
        <div
          id={royxatId}
          role="listbox"
          aria-multiselectable="true"
          aria-label={nom}
          className="absolute left-0 z-30 mt-1 max-h-72 w-full min-w-[220px] overflow-y-auto rounded-lg border border-ink-800 bg-ink-950 py-1 shadow-xl"
        >
          {options.map((o) => {
            const belgilangan = value.includes(o.value);
            return (
              <label
                key={o.value}
                role="option"
                aria-selected={belgilangan}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-ink-200 hover:bg-ink-900"
              >
                <input type="checkbox" checked={belgilangan} onChange={() => almashtir(o.value)} />
                <span className="min-w-0 flex-1">{o.label}</span>
              </label>
            );
          })}
          <div className="mt-1 border-t border-ink-800 px-3 py-1.5">
            <button
              type="button"
              className="text-xs text-ink-400 hover:text-ink-100 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={value.length === 0}
              onClick={() => onChange([])}
            >
              Tozalash
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
