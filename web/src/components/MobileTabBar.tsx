import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import { mobileTabs, type NavItem } from '@/lib/nav';
import { IconMore } from '@/components/icons';

/**
 * Telefondagi pastki panel.
 *
 * Uchta bo'lim + "Ko'proq". Pastda turadi, chunki 6 dyuymli telefonda
 * ekranning yuqori qismiga bosh barmoq yetmaydi.
 */
export function MobileTabBar({
  items,
  needsHuman,
  onMore,
}: {
  items: NavItem[];
  needsHuman: number;
  onMore: () => void;
}) {
  const tabs = mobileTabs(items);

  return (
    <nav
      className="flex shrink-0 border-t border-ink-800 bg-ink-900/90 backdrop-blur md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {tabs.map(({ to, short, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            clsx(
              'relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] transition-colors',
              isActive ? 'text-brand-400' : 'text-ink-500',
            )
          }
        >
          <Icon size={20} />
          <span className="truncate px-1">{short}</span>
          {to === '/chat' && needsHuman > 0 ? (
            <span className="absolute left-1/2 top-1 ml-2 rounded-full bg-orange-500 px-1.5 text-[10px] font-semibold leading-4 text-white">
              {needsHuman}
            </span>
          ) : null}
        </NavLink>
      ))}

      <button
        type="button"
        onClick={onMore}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] text-ink-500"
      >
        <IconMore size={20} />
        <span>Ko'proq</span>
      </button>
    </nav>
  );
}
