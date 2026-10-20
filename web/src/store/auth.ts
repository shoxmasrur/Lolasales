import { create } from 'zustand';
import { api, tokenStore } from '@/lib/api';
import { closeSocket } from '@/lib/socket';
import type { Permission, User } from '@/lib/types';

interface AuthState {
  user: User | null;
  permissions: Permission[];
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  restore: () => Promise<void>;
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  permissions: [],
  loading: true,
  error: null,

  login: async (email, password) => {
    set({ error: null });
    try {
      const { token, user } = await api.post<{ token: string; user: User }>('/auth/login', {
        email,
        password,
      });
      tokenStore.set(token);
      set({ user, permissions: user.role?.permissions ?? [], error: null });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Kirishda xato' });
      throw err;
    }
  },

  restore: async () => {
    if (!tokenStore.get()) {
      set({ user: null, permissions: [], loading: false });
      return;
    }
    try {
      const { user, permissions } = await api.get<{ user: User; permissions: Permission[] }>(
        '/auth/me',
      );
      set({ user, permissions, loading: false });
    } catch {
      tokenStore.clear();
      set({ user: null, permissions: [], loading: false });
    }
  },

  logout: () => {
    tokenStore.clear();
    closeSocket();
    set({ user: null, permissions: [] });
  },
}));

/**
 * Ruxsat tekshiruvi. Bu faqat interfeysni yashirish uchun —
 * haqiqiy himoya serverda, har bir so'rovda tekshiriladi.
 */
export function usePermission(): (permission: Permission) => boolean {
  const permissions = useAuth((s) => s.permissions);
  return (permission) => permissions.includes(permission);
}

export function useCan(permission: Permission): boolean {
  return useAuth((s) => s.permissions.includes(permission));
}
