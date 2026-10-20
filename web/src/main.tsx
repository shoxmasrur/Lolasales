import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '@/App';
import { applyTheme, resolve, storedChoice, useTheme } from '@/store/theme';
import '@/index.css';

// `index.html` dagi skript mavzuni allaqachon qo'ygan; bu yerda store bilan
// moslashtiramiz va tizim sozlamasi o'zgarishini kuzatamiz.
applyTheme(resolve(storedChoice()));

const sync = (): void => useTheme.getState().syncSystem();
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', sync);

// Zaxira: sahifa fonda turganda tizim mavzusi almashgan bo'lishi mumkin.
// Ba'zi muhitlarda `change` hodisasi umuman kelmaydi (masalan brauzer
// emulyatsiyasida), shuning uchun ko'zga tashlanganda ham tekshiramiz —
// bu hodisaga bog'liq emas va tekin.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) sync();
});
window.addEventListener('focus', sync);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
