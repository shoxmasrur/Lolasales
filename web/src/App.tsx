import { useEffect, type ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/store/auth';
import type { Permission } from '@/lib/types';
import { getSocket, type ServerEvent } from '@/lib/socket';
import Layout from '@/components/Layout';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import ChatPage from '@/pages/ChatPage';
import ClientsPage from '@/pages/ClientsPage';
import CampaignsPage from '@/pages/CampaignsPage';
import ImportPage from '@/pages/ImportPage';
import TelegramPage from '@/pages/TelegramPage';
import TelegramInboxPage from '@/pages/TelegramInboxPage';
import SettingsPage from '@/pages/SettingsPage';
import UsersPage from '@/pages/UsersPage';
import AgentPage from '@/pages/AgentPage';
import KurslarPage from '@/pages/KurslarPage';
import { LogsPage } from '@/pages/LogsPage';

export default function App() {
  const { user, permissions, loading, restore } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    void restore();
  }, [restore]);

  // Serverdagi o'zgarishlar keshni yangilaydi — sahifani qayta yuklash shart emas.
  useEffect(() => {
    if (!user) return;
    const socket = getSocket();

    const onEvent = (event: ServerEvent): void => {
      switch (event.type) {
        case 'message.created':
        case 'message.updated':
          void queryClient.invalidateQueries({ queryKey: ['messages', event.conversationId] });
          void queryClient.invalidateQueries({ queryKey: ['conversations'] });
          break;
        case 'conversation.created':
        case 'conversation.updated':
          void queryClient.invalidateQueries({ queryKey: ['conversations'] });
          void queryClient.invalidateQueries({ queryKey: ['conversation', event.conversationId] });
          break;
        case 'client.updated':
          void queryClient.invalidateQueries({ queryKey: ['clients'] });
          void queryClient.invalidateQueries({ queryKey: ['client', event.clientId] });
          break;
        case 'campaign.updated':
          void queryClient.invalidateQueries({ queryKey: ['campaigns'] });
          break;
        case 'telegram.status':
          void queryClient.invalidateQueries({ queryKey: ['telegram-accounts'] });
          break;
        case 'stats.invalidate':
          void queryClient.invalidateQueries({ queryKey: ['stats'] });
          break;
        default:
          break;
      }
    };

    socket.on('event', onEvent);
    return () => {
      socket.off('event', onEvent);
    };
  }, [user, queryClient]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-ink-400">
        <div className="animate-pulse text-sm">Yuklanmoqda…</div>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  // Ruxsati yo'q sahifaga to'g'ridan-to'g'ri havola bilan kirilsa ham
  // to'sib qo'yiladi. Asosiy himoya baribir serverda.
  const guard = (permission: Permission, element: ReactElement): ReactElement =>
    permissions.includes(permission) ? element : <NoAccess />;

  // Ruxsatlarga qarab foydalanuvchi ko'ra oladigan birinchi sahifa.
  const home =
    permissions.includes('dashboard.view') ? '/'
    : permissions.includes('conversations.view') ? '/chat'
    : permissions.includes('clients.view') ? '/clients'
    : '/no-access';

  return (
    <Layout>
      <Routes>
        <Route
          path="/"
          element={
            permissions.includes('dashboard.view') ? <DashboardPage /> : <Navigate to={home} replace />
          }
        />
        <Route path="/chat" element={guard('conversations.view', <ChatPage />)} />
        <Route path="/chat/:conversationId" element={guard('conversations.view', <ChatPage />)} />
        <Route path="/clients" element={guard('clients.view', <ClientsPage />)} />
        <Route path="/kurslar" element={guard('courses.view', <KurslarPage />)} />
        <Route path="/campaigns" element={guard('campaigns.view', <CampaignsPage />)} />
        <Route path="/import" element={guard('import.view', <ImportPage />)} />
        <Route path="/telegram" element={guard('telegram.view', <TelegramPage />)} />
        <Route path="/telegram-inbox" element={guard('telegram.inbox', <TelegramInboxPage />)} />
        <Route path="/agent" element={guard('agent.view', <AgentPage />)} />
        <Route path="/users" element={guard('users.view', <UsersPage />)} />
        <Route path="/settings" element={guard('settings.view', <SettingsPage />)} />
        <Route path="/logs" element={guard('logs.view', <LogsPage />)} />
        <Route path="/no-access" element={<NoAccess />} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </Layout>
  );
}

function NoAccess() {
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="text-center">
        <p className="text-sm font-medium text-ink-300">Bu bo'limga ruxsatingiz yo'q</p>
        <p className="mt-1 text-xs text-ink-500">
          Kerak bo'lsa administratordan rolingizga ruxsat qo'shishni so'rang.
        </p>
      </div>
    </div>
  );
}
