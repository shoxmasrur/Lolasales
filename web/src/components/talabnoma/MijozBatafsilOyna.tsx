import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCan } from '@/store/auth';
import { useMediaQuery } from '@/lib/useBreakpoint';
import { dateUz } from '@/lib/format';
import type { ConversationFilterOptions, ConversationListItem, Page } from '@/lib/types';
import { EmptyState, ErrorNote, Spinner } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { ClientDetailBody, type ClientDetail } from '@/components/client/ClientDetailBody';
import { SuhbatOqishRoyxati } from '@/components/SuhbatOqishRoyxati';
import { etRaqam, HOLAT_COLOR, HOLAT_LABEL, talabnomaApi } from '@/lib/talabnoma';

/** Mijozning talabnomalari — bitta mijozda bundan ko'pi amalda bo'lmaydi. */
const TALABNOMA_LIMITI = 100;
/** Mijozning suhbatlari (har akkauntda bittadan) — almashtirgich uchun. */
const SUHBAT_LIMITI = 20;

type Panel = 'shartnoma' | 'suhbat';

export interface BatafsilMijoz {
  clientId: string;
  fullName: string;
}

/**
 * «Talabnomalar» → «Batafsil»: mijoz kartasi va suhbat tarixi SAHIFADAN
 * CHIQMASDAN (filtr va tanlov saqlanadi).
 *
 * Chapda — «Mijozlar» sahifasidagi kartaning aynan o'zi (`ClientDetailBody`),
 * faqat ko'rish rejimida, ustida shu mijozning talabnomalari. O'ngda —
 * oxirgi xabarlar (faqat o'qish). Tor ekranda ikkalasi tablar bilan.
 *
 * Huquq: sahifa `talabnoma.view` ostida, karta esa `clients.view`, xabarlar
 * `conversations.view` talab qiladi. Huquq bo'lmasa so'rov yuborilmaydi va
 * o'sha panelda xato o'rniga muloyim izoh turadi.
 */
export function MijozBatafsilOyna({ mijoz, onClose }: { mijoz: BatafsilMijoz | null; onClose: () => void }) {
  return (
    <Sheet open={Boolean(mijoz)} onClose={onClose} title={mijoz?.fullName} maxWidth="max-w-6xl" fillHeight>
      {/* `key`: boshqa mijoz ochilganda tab «Shartnoma» ga qaytadi (yopilganda ham holat yo'qoladi). */}
      {mijoz ? <Mazmun key={mijoz.clientId} mijoz={mijoz} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Mazmun({ mijoz, onClose }: { mijoz: BatafsilMijoz; onClose: () => void }) {
  const [panel, setPanel] = useState<Panel>('shartnoma');
  // Tor ekranda «Suhbat» tabi yashirin bo'lsa, ro'yxat ko'ringanda pastga tushirilsin.
  const keng = useMediaQuery('(min-width: 1024px)');

  return (
    // Balandlik `Sheet` (fillHeight) dan: har ustun o'zi aylanadi, sarlavha va tablar joyida qoladi.
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 gap-1 border-b border-ink-800 px-3 py-2 lg:hidden">
        <PanelTugma active={panel === 'shartnoma'} onClick={() => setPanel('shartnoma')}>
          Shartnoma
        </PanelTugma>
        <PanelTugma active={panel === 'suhbat'} onClick={() => setPanel('suhbat')}>
          Suhbat
        </PanelTugma>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-1 lg:grid-cols-2">
        <section
          className={clsx(
            'min-h-0 flex-col lg:flex lg:border-r lg:border-ink-800',
            panel === 'shartnoma' ? 'flex' : 'hidden',
          )}
        >
          <PanelSarlavha>Shartnoma va mijoz</PanelSarlavha>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <MijozTalabnomalari clientId={mijoz.clientId} />
            <MijozKartasi clientId={mijoz.clientId} onClose={onClose} />
          </div>
        </section>
        <section className={clsx('min-h-0 flex-col lg:flex', panel === 'suhbat' ? 'flex' : 'hidden')}>
          <PanelSarlavha>Suhbat tarixi</PanelSarlavha>
          <SuhbatTarixi clientId={mijoz.clientId} visible={keng || panel === 'suhbat'} />
        </section>
      </div>
    </div>
  );
}

function PanelSarlavha({ children }: { children: string }) {
  return (
    <p className="shrink-0 border-b border-ink-800 px-4 py-2 text-[11px] uppercase tracking-wide text-ink-500">
      {children}
    </p>
  );
}

function PanelTugma({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex-1 rounded-lg px-3 py-1.5 text-sm font-medium',
        active ? 'bg-ink-800 text-ink-50' : 'text-ink-400 hover:bg-ink-900 hover:text-ink-200',
      )}
    >
      {children}
    </button>
  );
}

function HuquqYoq() {
  return <EmptyState title="Ko'rish uchun huquq yo'q" hint="Administratorga murojaat qiling." />;
}

/** Shu mijozning talabnomalari — `talabnoma.view` yetarli (sahifa shu huquq ostida). */
function MijozTalabnomalari({ clientId }: { clientId: string }) {
  const query = useQuery({
    // `['talabnoma']` ostida: yuborish/qayta/bekor dan keyin bu ham yangilanadi.
    queryKey: ['talabnoma', 'mijoz', clientId],
    queryFn: () => talabnomaApi.list({ clientId, page: 1, limit: TALABNOMA_LIMITI }),
  });
  const items = query.data?.items ?? [];

  return (
    <div className="border-b border-ink-800 p-4">
      <p className="mb-2 text-[11px] uppercase tracking-wide text-ink-500">
        Talabnomalar{query.data ? ` (${query.data.total})` : ''}
      </p>
      {query.isLoading ? (
        <Spinner />
      ) : query.isError ? (
        <ErrorNote error={query.error} />
      ) : items.length === 0 ? (
        <p className="text-xs text-ink-500">Talabnoma yuborilmagan</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="font-medium tabular-nums text-ink-100">{etRaqam(t.raqam)}</span>
              <span className="text-ink-400">{dateUz(t.sentAt ?? t.createdAt)}</span>
              <span className="text-ink-500">№{t.contractNo}</span>
              <span className={clsx('chip', HOLAT_COLOR[t.holat])}>{HOLAT_LABEL[t.holat]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** «Mijozlar» sahifasidagi karta — faqat ko'rish (tahrir, qidiruv, o'chirish yo'q). */
function MijozKartasi({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const canView = useCan('clients.view');
  const navigate = useNavigate();
  const detailQuery = useQuery({
    // Kalit «Mijozlar» sahifasi bilan bir xil — kesh va yangilanishlar umumiy.
    queryKey: ['client', clientId],
    queryFn: () => api.get<ClientDetail>(`/clients/${clientId}`),
    enabled: canView,
  });

  if (!canView) return <HuquqYoq />;
  if (detailQuery.isError) {
    return (
      <div className="p-4">
        <ErrorNote error={detailQuery.error} />
      </div>
    );
  }
  return (
    <ClientDetailBody
      detailQuery={detailQuery}
      navigate={navigate}
      writable={false}
      canLookup={false}
      canDelete={false}
      canEdit={false}
      onClosed={onClose}
    />
  );
}

/**
 * Mijozning suhbatlari (turli akkauntlarda bir nechta bo'lishi mumkin):
 * sukut — eng so'nggi faol (ro'yxat oxirgi xabar vaqti bo'yicha), bir nechta
 * bo'lsa ustida kichik almashtirgich.
 */
function SuhbatTarixi({ clientId, visible }: { clientId: string; visible: boolean }) {
  const canView = useCan('conversations.view');
  const navigate = useNavigate();
  const [tanlangan, setTanlangan] = useState<string | null>(null);

  const suhbatlarQuery = useQuery({
    queryKey: ['conversations', 'mijoz', clientId],
    queryFn: () =>
      api.get<Page<ConversationListItem>>('/conversations', { clientId, limit: SUHBAT_LIMITI }),
    enabled: canView,
  });
  // Chat sahifasi bilan bir xil kalit — akkaunt nomlari uchun.
  const filtrlarQuery = useQuery({
    queryKey: ['conversation-filters'],
    queryFn: () => api.get<ConversationFilterOptions>('/conversations/filters'),
    staleTime: 5 * 60_000,
    enabled: canView,
  });

  if (!canView) return <HuquqYoq />;
  if (suhbatlarQuery.isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  if (suhbatlarQuery.isError) {
    return (
      <div className="p-4">
        <ErrorNote error={suhbatlarQuery.error} />
      </div>
    );
  }

  const suhbatlar = suhbatlarQuery.data?.items.map((i) => i.conversation) ?? [];
  if (suhbatlar.length === 0) {
    return <EmptyState title="Suhbat yo'q" hint="Bu mijoz bilan hali yozishma bo'lmagan." />;
  }
  const joriy = suhbatlar.find((c) => c.id === tanlangan) ?? suhbatlar[0];
  const akkauntNomi = (id: string | null): string =>
    id === null ? 'Akkauntsiz' : (filtrlarQuery.data?.accounts.find((a) => a.id === id)?.label ?? 'Akkaunt');

  return (
    <>
      {suhbatlar.length > 1 ? (
        <div className="flex shrink-0 flex-wrap gap-1 border-b border-ink-800 px-4 py-2">
          {suhbatlar.map((c) => (
            <button
              key={c.id}
              type="button"
              className={clsx(
                'chip border',
                c.id === joriy.id
                  ? 'border-brand-500/50 bg-brand-500/15 text-brand-200'
                  : 'border-ink-800 bg-ink-900 text-ink-400 hover:text-ink-200',
              )}
              onClick={() => setTanlangan(c.id)}
            >
              {akkauntNomi(c.telegramAccountId)}
              {c.lastMessageAt ? ` · ${dateUz(c.lastMessageAt)}` : ''}
            </button>
          ))}
        </div>
      ) : null}
      <SuhbatOqishRoyxati conversationId={joriy.id} visible={visible} />
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-ink-800 px-4 py-3">
        <span className="truncate text-xs text-ink-500">{akkauntNomi(joriy.telegramAccountId)}</span>
        <button type="button" className="btn-ghost text-sm" onClick={() => navigate(`/chat/${joriy.id}`)}>
          Chatda ochish →
        </button>
      </div>
    </>
  );
}
