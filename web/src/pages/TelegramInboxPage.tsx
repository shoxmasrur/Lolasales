import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { getSocket, type ServerEvent } from '@/lib/socket';
import type { TelegramAccount, TelegramDialog, TelegramHistoryMessage } from '@/lib/types';
import { relative } from '@/lib/format';
import { ErrorNote, Spinner } from '@/components/ui';
import { useIsMobile } from '@/lib/useBreakpoint';

const KIND_LABEL: Record<TelegramDialog['kind'], string> = {
  user: 'Shaxsiy',
  group: 'Guruh',
  channel: 'Kanal',
};

/** Ro'yxatdagi suhbat uchun qisqa oxirgi xabar matni. */
function preview(dialog: TelegramDialog): string {
  const last = dialog.lastMessage;
  if (!last) return 'Xabar yo\'q';
  const text = last.text.trim() || '(media)';
  return `${last.out ? 'Siz: ' : ''}${text}`;
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}

function dayOf(iso: string): string {
  return new Date(iso).toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function TelegramInboxPage() {
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [selected, setSelected] = useState<TelegramDialog | null>(null);
  const [search, setSearch] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const isMobile = useIsMobile();
  const showList = !isMobile || !selected;
  const showThread = !isMobile || Boolean(selected);

  const accountsQuery = useQuery({
    queryKey: ['telegram-accounts'],
    queryFn: () => api.get<{ items: TelegramAccount[] }>('/telegram/accounts'),
  });

  const accounts = useMemo(
    () => (accountsQuery.data?.items ?? []).filter((a) => a.connected),
    [accountsQuery.data],
  );

  // Birinchi ulangan akkauntni o'zi tanlab qo'yadi.
  useEffect(() => {
    if (!accountId && accounts.length) setAccountId(accounts[0]!.id);
  }, [accounts, accountId]);

  const dialogsQuery = useQuery({
    queryKey: ['tg-dialogs', accountId],
    queryFn: () => api.get<{ items: TelegramDialog[] }>(`/telegram/accounts/${accountId}/dialogs`),
    enabled: Boolean(accountId),
    // Telegramdan har safar yangi ma'lumot — lekin so'rovni ko'p yubormaymiz.
    refetchInterval: 60_000,
  });

  const historyQuery = useQuery({
    queryKey: ['tg-history', accountId, selected?.peerId],
    queryFn: () =>
      api.get<{ items: TelegramHistoryMessage[] }>(`/telegram/accounts/${accountId}/history`, {
        peerId: selected!.peerId,
        ...(selected!.accessHash ? { accessHash: selected!.accessHash } : {}),
        kind: selected!.kind,
        limit: 60,
      }),
    enabled: Boolean(accountId && selected),
  });

  // Jonli yangilanish: yangi xabar kelsa ro'yxat ham, ochiq suhbat ham yangilanadi.
  useEffect(() => {
    const socket = getSocket();
    const onEvent = (event: ServerEvent): void => {
      if (event.type !== 'telegram.raw_message') return;
      if (event.accountId !== accountId) return;

      void queryClient.invalidateQueries({ queryKey: ['tg-dialogs', accountId] });
      if (selected && event.peerId === selected.peerId) {
        void queryClient.invalidateQueries({ queryKey: ['tg-history', accountId, selected.peerId] });
      }
    };

    socket.on('event', onEvent);
    return () => {
      socket.off('event', onEvent);
    };
  }, [accountId, selected, queryClient]);

  const messages = historyQuery.data?.items ?? [];

  // Yangi xabar kelganda pastga tushamiz.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, selected?.peerId]);

  const dialogs = useMemo(() => {
    const items = dialogsQuery.data?.items ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        (d.username ?? '').toLowerCase().includes(q) ||
        (d.phone ?? '').includes(q),
    );
  }, [dialogsQuery.data, search]);

  if (accountsQuery.isPending) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!accounts.length) {
    return (
      <div className="flex flex-1 items-center justify-center px-8 text-center">
        <div>
          <p className="text-sm text-ink-300">Ulangan Telegram akkaunt yo'q</p>
          <p className="mt-1 text-xs text-ink-500">
            Telegram sahifasidan akkauntga kiring — shundan keyin yozishmalar shu yerda ko'rinadi.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-ink-800 px-4 py-3 md:px-6 md:py-4">
        <div className="hidden md:block">
          <h1 className="text-base font-semibold">Telegram qutisi</h1>
          <p className="mt-0.5 text-xs text-ink-500">
            Akkauntning Telegramdagi yozishmalari — jonli, to'g'ridan-to'g'ri Telegram API'sidan
          </p>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {accounts.map((account) => (
            <button
              key={account.id}
              type="button"
              onClick={() => {
                setAccountId(account.id);
                setSelected(null);
              }}
              className={clsx(
                'rounded-lg px-3 py-1.5 text-xs transition-colors',
                account.id === accountId
                  ? 'bg-brand-600 text-white'
                  : 'bg-ink-800/60 text-ink-300 hover:bg-ink-800',
              )}
            >
              {account.label}
              <span className="ml-1.5 opacity-60">{account.phone}</span>
            </button>
          ))}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Suhbatlar ro'yxati */}
        {showList ? (
          <aside
            className={clsx(
              'flex shrink-0 flex-col border-r border-ink-800',
              isMobile ? 'w-full' : 'w-80',
            )}
          >
            <div className="border-b border-ink-800 p-3">
              <input
                className="input w-full text-xs"
                placeholder="Ism, username yoki raqam"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {dialogsQuery.isPending ? (
                <div className="p-4 text-center">
                  <Spinner />
                </div>
              ) : dialogsQuery.error ? (
                <div className="p-3">
                  <ErrorNote error={dialogsQuery.error} />
                </div>
              ) : !dialogs.length ? (
                <p className="p-4 text-center text-xs text-ink-500">Suhbat topilmadi</p>
              ) : (
                dialogs.map((dialog) => (
                  <button
                    key={`${dialog.kind}:${dialog.peerId}`}
                    type="button"
                    onClick={() => setSelected(dialog)}
                    className={clsx(
                      'block w-full border-b border-ink-800/60 px-3 py-2.5 text-left transition-colors',
                      selected?.peerId === dialog.peerId ? 'bg-ink-800' : 'hover:bg-ink-800/50',
                    )}
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-ink-100">{dialog.title}</span>
                      {dialog.lastMessage ? (
                        <span className="shrink-0 text-[10px] text-ink-500">
                          {timeOf(dialog.lastMessage.date)}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs text-ink-500">{preview(dialog)}</span>
                      {dialog.unreadCount > 0 ? (
                        <span className="shrink-0 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          {dialog.unreadCount}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-ink-600">
                      {dialog.kind !== 'user' ? (
                        <span className="rounded bg-ink-800 px-1 py-px">{KIND_LABEL[dialog.kind]}</span>
                      ) : null}
                      {dialog.isBot ? <span className="rounded bg-ink-800 px-1 py-px">Bot</span> : null}
                      {dialog.username ? <span>@{dialog.username}</span> : null}
                      {dialog.phone ? <span>{dialog.phone}</span> : null}
                    </div>
                  </button>
                ))
              )}
            </div>
          </aside>
        ) : null}

        {/* Tanlangan suhbat */}
        {showThread ? (
        <section className="flex min-w-0 flex-1 flex-col">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-sm text-ink-500">
              Chapdan suhbatni tanlang
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-ink-800 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  aria-label="Yozishmalar ro'yxatiga qaytish"
                  className="-ml-1 inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-md p-2 text-ink-400 hover:bg-ink-800 md:hidden"
                >
                  ‹
                </button>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-100">{selected.title}</p>
                  <p className="truncate text-[11px] text-ink-500">
                    {KIND_LABEL[selected.kind]}
                    {selected.username ? ` · @${selected.username}` : ''}
                    {selected.phone ? ` · ${selected.phone}` : ''}
                  </p>
                </div>
                {historyQuery.isFetching ? <Spinner /> : null}
              </div>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4">
                {historyQuery.isPending ? (
                  <div className="pt-8 text-center">
                    <Spinner />
                  </div>
                ) : historyQuery.error ? (
                  <ErrorNote error={historyQuery.error} />
                ) : !messages.length ? (
                  <p className="pt-8 text-center text-xs text-ink-500">Bu suhbatda xabar yo'q</p>
                ) : (
                  messages.map((message, i) => {
                    const prev = messages[i - 1];
                    const newDay = !prev || dayOf(prev.date) !== dayOf(message.date);

                    return (
                      <div key={message.id}>
                        {newDay ? (
                          <p className="py-2 text-center text-[10px] uppercase tracking-wider text-ink-600">
                            {dayOf(message.date)}
                          </p>
                        ) : null}

                        <div className={clsx('flex', message.out ? 'justify-end' : 'justify-start')}>
                          <div
                            className={clsx(
                              'max-w-[70%] rounded-2xl px-3.5 py-2',
                              message.out
                                ? 'rounded-br-md bg-brand-600/20 text-ink-100'
                                : 'rounded-bl-md bg-ink-800 text-ink-200',
                            )}
                          >
                            {selected.kind !== 'user' && !message.out && message.senderName ? (
                              <p className="mb-0.5 text-[11px] font-medium text-brand-400">
                                {message.senderName}
                              </p>
                            ) : null}

                            {message.mediaLabel ? (
                              <p className="text-[11px] italic text-ink-400">[{message.mediaLabel}]</p>
                            ) : null}

                            {message.text ? (
                              <p className="whitespace-pre-wrap break-words text-sm">{message.text}</p>
                            ) : null}

                            <p className="mt-0.5 text-right text-[10px] text-ink-500">
                              {timeOf(message.date)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              <div className="border-t border-ink-800 px-5 py-2">
                <p className="text-[11px] text-ink-600">
                  Faqat o'qish uchun — bu ekrandan xabar yuborilmaydi.
                  {dialogsQuery.dataUpdatedAt
                    ? ` Ro'yxat yangilangan: ${relative(new Date(dialogsQuery.dataUpdatedAt).toISOString())}`
                    : ''}
                </p>
              </div>
            </>
          )}
        </section>
        ) : null}
      </div>
    </div>
  );
}
