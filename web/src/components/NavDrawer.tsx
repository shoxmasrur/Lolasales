import { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import type { NavItem } from '@/lib/nav';
import { useAuth } from '@/store/auth';
import { initials } from '@/lib/format';
import { Avatar } from '@/components/ui';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Logo } from '@/components/Logo';
import { IconLogout } from '@/components/icons';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])';

/**
 * Telefondagi chekka menyu.
 *
 * Yopiq holatda UMUMAN chizilmaydi (`hidden` emas): DOM'da qolsa
 * `Tab` bosilganda fokus ko'rinmaydigan havolalarga tushib ketardi.
 * Shu sabab chiqish animatsiyasi yo'q — kirish animatsiyasi yetarli.
 */
export function NavDrawer({
  open,
  onClose,
  items,
  needsHuman,
  killSwitch,
}: {
  open: boolean;
  onClose: () => void;
  items: NavItem[];
  needsHuman: number;
  killSwitch: boolean;
}) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const panelRef = useRef<HTMLDivElement>(null);

  // Bo'lim tanlanganda menyu o'zi yopiladi.
  useEffect(() => {
    onClose();
    // Faqat yo'l o'zgarganda ishlashi kerak — `onClose` bog'liqlikka
    // qo'shilsa, uni har chizishda qayta yaratilishi menyuni darhol
    // yopib qo'yardi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Ochiq turganda orqa fon surilmasin.
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
  // `onClose` ga bog'lanmaydi: `Layout` uni har chizishda yangi closure
  // qilib uzatadi (masalan react-query fon yangilanishlarida), va o'shanda
  // bu effekt qayta ishga tushib, fokusni foydalanuvchi tanlagan joydan
  // tortib olardi.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    // Bu yerda `autoFocus` yo'q, lekin tekshiruv baribir qo'yilgan — ikkala
    // komponent bir xil ishlasin va hech biri fokusni foydalanuvchi
    // tab qilib borgan joydan tortib olmasin.
    if (panel.contains(document.activeElement)) return;
    panel.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }, [open]);

  // Esc yopadi; Tab fokusni menyu ICHIDA aylantiradi.
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
    <div className="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true" aria-label="Menyu">
      <div
        ref={panelRef}
        className="slide-in-left flex w-[82%] max-w-[300px] flex-col border-r border-ink-800 bg-ink-950"
      >
        <div className="flex items-center justify-between px-4 py-4">
          <Logo width={110} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Menyuni yopish"
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md p-2.5 text-ink-500 hover:bg-ink-800 hover:text-ink-200"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {items.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  isActive ? 'bg-ink-800 text-ink-50' : 'text-ink-400 hover:bg-ink-800/50',
                )
              }
            >
              <Icon className="shrink-0" />
              <span className="flex-1">{label}</span>
              {to === '/chat' && needsHuman > 0 ? (
                <span className="rounded-full bg-orange-500/20 px-1.5 py-0.5 text-[11px] font-semibold text-orange-300">
                  {needsHuman}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>

        {killSwitch ? (
          <div className="mx-3 mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
            <p className="text-xs font-semibold text-red-300">Yuborish to'xtatilgan</p>
            <p className="mt-0.5 text-[11px] text-red-400/80">
              Sozlamalarda "To'xtatish" yoqilgan — hech qanday xabar ketmaydi.
            </p>
          </div>
        ) : null}

        <div className="border-t border-ink-800 px-3 pb-2 pt-3">
          <ThemeToggle />
        </div>

        {/* Pastki chiziqli telefonda foydalanuvchi bloki chiziq ostida
            qolmasin. `py-3` ning 0.75rem'i saqlanadi. */}
        <div
          className="flex items-center gap-2.5 border-t border-ink-800 px-4 py-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <Avatar text={initials(user?.fullName ?? '?')} size={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-ink-200">{user?.fullName}</p>
            <p className="truncate text-[11px] text-ink-500">{user?.role?.name}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            title="Chiqish"
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md p-2.5 text-ink-500 hover:bg-ink-800 hover:text-ink-200"
          >
            <IconLogout size={16} />
          </button>
        </div>
      </div>

      {/* Qolgan joy — bosilsa yopiladi. */}
      <button
        type="button"
        aria-label="Menyuni yopish"
        onClick={onClose}
        className="flex-1 bg-black/60"
      />
    </div>
  );
}
