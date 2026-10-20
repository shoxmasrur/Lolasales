import { useEffect, useRef, type ReactNode } from 'react';
import clsx from 'clsx';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])';

/**
 * Dialoglar va tafsilot panellari uchun umumiy idish.
 *
 * Telefonda pastdan ko'tariladi va balandligi `90dvh` bilan
 * cheklanadi — hozirgi dialoglarda cheklov yo'q edi va uzun forma
 * ekrandan chiqib ketardi, tugmalariga yetib bo'lmasdi.
 */
export function Sheet({
  open,
  onClose,
  title,
  variant = 'center',
  maxWidth = 'max-w-lg',
  rightWidth = 'md:w-96',
  fillHeight = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  variant?: 'center' | 'right';
  maxWidth?: string;
  /**
   * `right` variantining kengligi (kompyuterda). Tafsilot paneli uchun
   * 24rem yetadi, lekin suhbat ko'rinishida xabarlar siqilib qoladi.
   */
  rightWidth?: string;
  /**
   * `center` panel balandligi mazmunga qarab emas, eng ko'p balandlikda
   * (telefonda 90dvh, kattaroqda 85dvh) turadi: ichida o'zi aylanadigan
   * ustunlar bo'lsa (`h-full`), ularga aniq balandlik kerak.
   */
  fillHeight?: boolean;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Fokusni panelga ko'chirish — FAQAT ochilganda.
  //
  // `onClose` ga bog'lanmaydi: dialoglar uni har chizishda yangi closure
  // qilib uzatadi, va o'shanda bu effekt har bosilgan harfdan keyin qayta
  // ishga tushib, fokusni maydondan tortib olardi.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    // `autoFocus` allaqachon panel ichiga fokus qo'ygan bo'lsa tegmaymiz —
    // u odatda birinchi maydonga tushadi va ✕ tugmasidan foydaliroq.
    if (panel.contains(document.activeElement)) return;
    panel.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }, [open]);

  // Esc yopadi; Tab fokusni panel ICHIDA aylantiradi.
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={clsx(
        'fixed inset-0 z-50 flex bg-black/70',
        // Telefonda doim pastdan; kattaroq ekranda variantga qarab.
        'items-end justify-center',
        variant === 'center' ? 'md:items-center md:p-4' : 'md:items-stretch md:justify-end',
      )}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        // Faqat FONning o'ziga bosilganda yopiladi — panel ichidagi
        // matnni belgilab, sichqonchani fonda qo'yib yuborganda emas.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        // Kompyuterda `env(safe-area-inset-bottom)` 0 qaytaradi, ya'ni
        // bu style faqat pastki chizig'i bor telefonda ta'sir qiladi.
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        className={clsx(
          'slide-up flex max-h-[90dvh] w-full flex-col overflow-hidden border-ink-800 bg-ink-900',
          'rounded-t-2xl border-x border-t',
          fillHeight && variant === 'center' && 'h-[90dvh] md:h-[85dvh]',
          variant === 'center'
            ? clsx(
                'md:max-h-[85dvh] md:rounded-2xl md:border md:border-ink-700 md:shadow-2xl',
                maxWidth,
              )
            : clsx('md:max-h-none md:rounded-none md:border-l md:border-t-0', rightWidth),
        )}
      >
        {title ? (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-ink-800 px-4 py-3">
            <p className="truncate text-sm font-medium text-ink-100">{title}</p>
            <button
              type="button"
              onClick={onClose}
              aria-label="Yopish"
              className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md p-2.5 text-ink-500 hover:bg-ink-800 hover:text-ink-200"
            >
              ✕
            </button>
          </div>
        ) : null}

        <div className={clsx('min-h-0 flex-1 overflow-y-auto', fillHeight && 'flex flex-col')}>{children}</div>
      </div>
    </div>
  );
}
