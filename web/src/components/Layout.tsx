import { useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useChekBildirishnomasi } from '@/lib/chekBildirishnoma';
import { useAuth, usePermission } from '@/store/auth';
import type { DashboardStats, OutreachSettings } from '@/lib/types';
import { initials } from '@/lib/format';
import { Avatar } from '@/components/ui';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Logo } from '@/components/Logo';
import { IconLogout, IconMenu } from '@/components/icons';
import { NAV, currentNavItem } from '@/lib/nav';
import { NavDrawer } from '@/components/NavDrawer';
import { MobileTabBar } from '@/components/MobileTabBar';

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const can = usePermission();
  const visibleNav = NAV.filter((item) => can(item.permission));
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ['stats', 'dashboard'],
    queryFn: () => api.get<{ stats: DashboardStats }>('/stats/dashboard'),
    refetchInterval: 60_000,
    enabled: can('dashboard.view'),
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<{ settings: OutreachSettings }>('/settings'),
    refetchInterval: 30_000,
    enabled: can('settings.view'),
  });

  const needsHuman = stats?.stats.conversationsNeedingHuman ?? 0;
  // Yangi chek kelganda ovoz va brauzer bildirishnomasi; sarlavhada son ko'rinadi.
  useChekBildirishnomasi(stats?.stats.navbatdagiCheklar ?? 0);
  const killSwitch = settings?.settings.killSwitch ?? false;

  const location = useLocation();
  const current = currentNavItem(visibleNav, location.pathname);

  return (
    <div className="flex h-full">
      {/* ─── Kompyuter: 240px yon menyu (≥1024) ─────────────────── */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-ink-800 bg-ink-900/40 lg:flex">
        {/* Faqat logotip — kompaniya nomi uning o'zida bor. */}
        <div className="flex justify-center px-5 py-6">
          <Logo width={132} />
        </div>

        <nav className="flex-1 space-y-0.5 px-3">
          {visibleNav.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  isActive ? 'bg-ink-800 text-ink-50' : 'text-ink-400 hover:bg-ink-800/50 hover:text-ink-200',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* Faol bo'limning chap chekkasidagi belgi */}
                  <span
                    className={clsx(
                      'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-brand-500 transition-opacity',
                      isActive ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <Icon
                    className={clsx(
                      'shrink-0 transition-colors',
                      isActive ? 'text-brand-400' : 'text-ink-500 group-hover:text-ink-300',
                    )}
                  />
                  <span className="flex-1">{label}</span>
                  {to === '/chat' && needsHuman > 0 ? (
                    <span className="rounded-full bg-orange-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-orange-300">
                      {needsHuman}
                    </span>
                  ) : null}
                </>
              )}
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

        {/* Mavzu tanlagich foydalanuvchi blokidan yuqorida: u har sahifada
            ko'rinadi va sozlamalarni ochish shart emas. */}
        <div className="border-t border-ink-800 px-3 pb-2 pt-3">
          <ThemeToggle />
        </div>

        <div className="flex items-center gap-2.5 border-t border-ink-800 px-4 py-3">
          <Avatar text={initials(user?.fullName ?? '?')} size={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-ink-200">{user?.fullName}</p>
            <p className="truncate text-[11px] text-ink-500">{user?.role?.name}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            title="Chiqish"
            className="rounded-md p-1.5 text-ink-500 transition-colors hover:bg-ink-800 hover:text-ink-200"
          >
            <IconLogout size={16} />
          </button>
        </div>
      </aside>

      {/* ─── Planshet: 64px ikonkali tasma (768–1023) ───────────── */}
      <aside className="hidden w-16 shrink-0 flex-col border-r border-ink-800 bg-ink-900/40 md:flex lg:hidden">
        <div className="flex justify-center py-3">
          <Logo width={36} />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-1.5">
          {visibleNav.map(({ to, short, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={label}
              className={({ isActive }) =>
                clsx(
                  'relative flex flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-[9px] leading-tight transition-colors',
                  isActive ? 'bg-ink-800 text-ink-50' : 'text-ink-500 hover:bg-ink-800/50',
                )
              }
            >
              <Icon size={18} className="shrink-0" />
              <span className="w-full truncate text-center">{short}</span>
              {to === '/chat' && needsHuman > 0 ? (
                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-orange-400" />
              ) : null}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-ink-800 px-1.5 py-2">
          <ThemeToggle vertical />
        </div>

        <div className="flex flex-col items-center gap-1.5 border-t border-ink-800 py-2">
          <Avatar text={initials(user?.fullName ?? '?')} size={28} />
          <button
            type="button"
            onClick={logout}
            title="Chiqish"
            className="rounded-md p-2 text-ink-500 hover:bg-ink-800 hover:text-ink-200"
          >
            <IconLogout size={16} />
          </button>
        </div>
      </aside>

      {/* ─── Mazmun ustuni ──────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Telefon: yuqori panel */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-ink-800 px-3 md:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Menyu"
            className="rounded-md p-2.5 text-ink-300 hover:bg-ink-800"
          >
            <IconMenu size={20} />
          </button>
          {/* Mavzu tanlagich yuqori panelda YO'Q: u allaqachon bir bosishda
              chekka menyuda (☰) bor. 375px'da uni yana bu yerda takrorlash
              136px joy yer edi va uzun sarlavhalarni ("Foydalanuvchilar",
              "Telegram qutisi") siqib qo'yardi. */}
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {current?.label ?? 'LolaSales'}
          </span>
        </header>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">{children}</main>

        <MobileTabBar items={visibleNav} needsHuman={needsHuman} onMore={() => setDrawerOpen(true)} />
      </div>

      <NavDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        items={visibleNav}
        needsHuman={needsHuman}
        killSwitch={killSwitch}
      />
    </div>
  );
}
