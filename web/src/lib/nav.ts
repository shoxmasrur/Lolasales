import type { ReactNode } from 'react';
import type { Permission } from '@/lib/types';
import {
  IconAgent,
  IconCampaign,
  IconChat,
  IconClients,
  IconDashboard,
  IconImport,
  IconInbox,
  IconSettings,
  IconTelegram,
  IconUsers,
} from '@/components/icons';

export type NavIcon = (props: { size?: number; className?: string }) => ReactNode;

export interface NavItem {
  to: string;
  /** To'liq nom — yon menyu, chekka menyu va yuqori panel sarlavhasi. */
  label: string;
  /** Pastki panel uchun qisqartma: u yerda ustunga ~85px joy tegadi. */
  short: string;
  Icon: NavIcon;
  end?: boolean;
  permission: Permission;
}

/** Har bir bo'lim o'z ruxsatini talab qiladi — yo'q bo'lsa menyuda ko'rinmaydi. */
export const NAV: NavItem[] = [
  { to: '/', label: 'Boshqaruv paneli', short: 'Panel', Icon: IconDashboard, end: true, permission: 'dashboard.view' },
  { to: '/chat', label: 'Suhbatlar', short: 'Suhbat', Icon: IconChat, permission: 'conversations.view' },
  { to: '/clients', label: 'Mijozlar', short: 'Mijoz', Icon: IconClients, permission: 'clients.view' },
  { to: '/kurslar', label: 'Kurslar', short: 'Kurs', Icon: IconImport, permission: 'courses.view' },
  { to: '/campaigns', label: 'Kampaniyalar', short: 'Kampan.', Icon: IconCampaign, permission: 'campaigns.view' },
  { to: '/import', label: 'Import', short: 'Import', Icon: IconImport, permission: 'import.view' },
  { to: '/telegram', label: 'Telegram', short: 'Telegram', Icon: IconTelegram, permission: 'telegram.view' },
  { to: '/telegram-inbox', label: 'Telegram qutisi', short: 'Quti', Icon: IconInbox, permission: 'telegram.inbox' },
  { to: '/agent', label: 'Agent', short: 'Agent', Icon: IconAgent, permission: 'agent.view' },
  { to: '/users', label: 'Foydalanuvchilar', short: 'Xodim', Icon: IconUsers, permission: 'users.view' },
  { to: '/logs', label: 'Tizim jurnali', short: 'Jurnal', Icon: IconDashboard, permission: 'logs.view' },
  { to: '/settings', label: 'Sozlamalar', short: 'Sozlama', Icon: IconSettings, permission: 'settings.view' },
];

/**
 * Pastki panelda 3 ta joy bor (4-chisi doim "Ko'proq").
 *
 * Tartib rolga qarab O'ZGARMAYDI: operator telefonini har ochganda
 * tugmalar bir joyda tursin. Ruxsati yo'q bo'lim tushib qoladi va
 * o'rnini keyingisi egallaydi.
 */
const MOBILE_PRIORITY = ['/', '/chat', '/clients', '/telegram-inbox', '/campaigns', '/telegram'];

export function mobileTabs(visible: NavItem[]): NavItem[] {
  const byPath = new Map(visible.map((item) => [item.to, item]));
  const picked: NavItem[] = [];
  for (const to of MOBILE_PRIORITY) {
    const item = byPath.get(to);
    if (item) picked.push(item);
    if (picked.length === 3) break;
  }
  return picked;
}

/**
 * Joriy yo'lga mos bo'lim — yuqori paneldagi sarlavha uchun.
 *
 * Eng UZUN mos keladigani tanlanadi: aks holda `/` prefiksi hamma
 * yo'lga mos kelib, har sahifada "Boshqaruv paneli" yozilardi.
 */
export function currentNavItem(items: NavItem[], pathname: string): NavItem | undefined {
  return [...items]
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => (item.end ? pathname === item.to : pathname.startsWith(item.to)));
}
