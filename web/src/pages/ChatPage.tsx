import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '@/lib/api';
import { getSocket, type ServerEvent } from '@/lib/socket';
import { useCan } from '@/store/auth';
import type {
  Client,
  Conversation,
  ConversationFilterOptions,
  ConversationListItem,
  Message,
  Page,
  Purchase,
} from '@/lib/types';
import { dateUz, initials, relative, STATE_COLOR, STATE_LABEL } from '@/lib/format';
import { BOSQICH_CLASS, BOSQICH_YORLIGI } from '@/lib/xarid';
import { PurchaseStageCard } from '@/components/client/ClientDetailBody';
import { Avatar, EmptyState, ErrorNote, Spinner, Toggle } from '@/components/ui';
import MessageBubble from '@/components/MessageBubble';
import { ReceiptConfirmButton, SendLinkButton, type ReceiptReview } from '@/components/ReceiptConfirmButton';
import { Sheet } from '@/components/Sheet';
import { useIsDesktopWide, useIsMobile } from '@/lib/useBreakpoint';

interface AccountOption {
  id: string;
  label: string;
  phone: string;
}

interface ConversationDetail {
  conversation: Conversation;
  client: Client | null;
  /** Joriy xarid (faol, bo'lmasa oxirgisi). */
  purchase: Purchase | null;
  /** Suhbatni davom ettirish mumkin bo'lgan akkauntlar (yoza oladiganlari). */
  accountOptions: AccountOption[];
  /** Ochiq chek tekshiruvi — "Tasdiqlash"/"Rad etish" tugmalari uchun. */
  receiptReview: ReceiptReview | null;
  /** Kurs qoidasi bajarilgan, guruh havolasi bor, lekin hali yuborilmagan. */
  linkPending: boolean;
}

/** `POST /conversations/:id/agent-retry` javobi. */
interface AgentTurnResult {
  sent: boolean;
  reply: string | null;
  escalated: boolean;
  cardSent: boolean;
}

type Filter = 'all' | 'needsHuman' | 'unread' | 'blocked' | 'receipt';

/** Suhbatlar ro'yxatining bitta sahifasi — pastga aylantirilganda keyingisi yuklanadi. */
const LIST_PAGE_SIZE = 50;

export default function ChatPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const writable = useCan('conversations.send');
  const canManage = useCan('conversations.manage');
  const canToggleAgent = useCan('conversations.agent_toggle');
  const canEditSent = useCan('conversations.edit_message');
  const canDeleteMessage = useCan('conversations.delete_message');

  const [search, setSearch] = useState('');
  // Dashboarddagi "Navbatdagi cheklar" havolasi `?filter=receipt` bilan ochadi.
  const [filter, setFilter] = useState<Filter>(() =>
    new URLSearchParams(window.location.search).get('filter') === 'receipt' ? 'receipt' : 'all',
  );
  const [accountId, setAccountId] = useState('');
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [thinking, setThinking] = useState(false);
  const [instructionOpen, setInstructionOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  const isMobile = useIsMobile();
  const isWide = useIsDesktopWide();
  const [clientSheetOpen, setClientSheetOpen] = useState(false);
  // Suhbat almashganda eski mijozning kartasi ochiq qolib ketmasin —
  // ⓘ ni bosib ochgan, orqaga qaytib boshqa suhbatni tanlagan operator
  // yangi mijozni emas, eskisini ko'rib qolmasligi kerak.
  useEffect(() => {
    setClientSheetOpen(false);
    // Boshqa mijozga yozilgan topshiriq yangi suhbatga o'tib ketmasin.
    setInstructionOpen(false);
    setInstruction('');
  }, [conversationId]);

  // Telefonda bir vaqtda BITTA panel. Yozishma paneli `hidden` bilan
  // yashirilmaydi, balki umuman chizilmaydi: aks holda ro'yxat
  // ko'rinib turganda ham `conversation:open` yuborilib, suhbat
  // o'qilgan deb belgilanardi.
  const showList = !isMobile || !conversationId;
  const showThread = !isMobile || Boolean(conversationId);

  // Cheksiz aylantirish: 50 tadan, ro'yxat oxiri ko'ringanda keyingisi o'zi
  // yuklanadi. Ilgari faqat birinchi 100 ta suhbat ko'rinardi, qolgani
  // uchun operator qidiruvdan boshqa yo'l topa olmasdi.
  const listQuery = useInfiniteQuery({
    queryKey: ['conversations', search, filter, accountId],
    queryFn: ({ pageParam }) =>
      api.get<Page<ConversationListItem>>('/conversations', {
        search: search || undefined,
        needsHuman: filter === 'needsHuman' ? 'true' : undefined,
        unreadOnly: filter === 'unread' ? 'true' : undefined,
        blocked: filter === 'blocked' ? 'true' : undefined,
        // "Chek keldi" — menejer tasdig'ini kutayotgan ochiq chek tekshiruvi bor suhbatlar.
        receiptPending: filter === 'receipt' ? 'true' : undefined,
        telegramAccountId: accountId || undefined,
        limit: LIST_PAGE_SIZE,
        offset: pageParam,
      }),
    initialPageParam: 0,
    // Keyingi offset — shu paytgacha KELGAN qatorlar soni (takrorlanganlar
    // ham): server ham aynan shuncha qatorni o'tkazib yuborishi kerak.
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((sum, page) => sum + page.items.length, 0);
      return last.items.length > 0 && loaded < last.total ? loaded : undefined;
    },
    refetchInterval: 20_000,
  });

  // Ro'yxat kamdan-kam o'zgaradi (yangi akkaunt qo'shilganda),
  // shuning uchun suhbatlar bilan birga har 20 soniyada qayta so'ralmaydi.
  const filtersQuery = useQuery({
    queryKey: ['conversation-filters'],
    queryFn: () => api.get<ConversationFilterOptions>('/conversations/filters'),
    staleTime: 5 * 60_000,
  });

  const detailQuery = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => api.get<ConversationDetail>(`/conversations/${conversationId}`),
    enabled: Boolean(conversationId),
  });

  const messagesQuery = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => api.get<Page<Message>>(`/conversations/${conversationId}/messages`, { limit: 200 }),
    enabled: Boolean(conversationId),
  });

  // Ochilgan suhbatni "o'qildi" deb belgilaymiz va socket xonasiga qo'shilamiz.
  useEffect(() => {
    if (!conversationId) return;
    const socket = getSocket();
    socket.emit('conversation:open', conversationId);
    void api.post(`/conversations/${conversationId}/read`).catch(() => undefined);

    const onEvent = (event: ServerEvent): void => {
      if (event.type === 'agent.thinking' && event.conversationId === conversationId) {
        setThinking(event.on);
      }
      // Mijoz o'qidi — xabarlar ro'yxatini qayta olamiz, "o'qildi" vaqti
      // shu yerdan keladi.
      if (event.type === 'conversation.messages_read' && event.conversationId === conversationId) {
        void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      }
    };
    socket.on('event', onEvent);

    return () => {
      socket.emit('conversation:close', conversationId);
      socket.off('event', onEvent);
      setThinking(false);
    };
  }, [conversationId, queryClient]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messagesQuery.data?.items.length, thinking]);

  const sendMutation = useMutation({
    mutationFn: (payload: { body: string; draftMessageId?: string | null }) =>
      api.post<{ message: Message }>(`/conversations/${conversationId}/messages`, payload),
    onSuccess: () => {
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const sendFileMutation = useMutation({
    mutationFn: (payload: { file: File; caption: string }) =>
      api.upload<{ message: Message }>(`/conversations/${conversationId}/media`, payload.file, {
        caption: payload.caption,
      }),
    onSuccess: () => {
      setAttachment(null);
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const agentToggle = useMutation({
    mutationFn: (enabled: boolean) =>
      api.patch(`/conversations/${conversationId}`, { agentEnabled: enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] }),
  });

  const resolveHuman = useMutation({
    // Operator masalani hal qilgach, boshqaruvni agentga qaytaradi.
    mutationFn: () =>
      api.patch(`/conversations/${conversationId}`, {
        needsHuman: false,
        humanReason: null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const retryAgent = useMutation({
    // Agent texnik xatodan keyin O'ZI uyg'onmaydi — mijozdan yangi xabar
    // kelmasa suhbat muzlab qoladi. Bu tugma uni qo'lda turtadi.
    mutationFn: () => api.post<AgentTurnResult>(`/conversations/${conversationId}/agent-retry`),
    // `onSuccess` EMAS, `onSettled`: urinish yiqilsa ham server YANGI
    // `human_reason` yozadi (`RetryAgentTurnUseCase` catch bloki). Faqat
    // `onSuccess`da invalidatsiya qilinsa, operator ESKI sababni ko'rib
    // qolardi — butun tugmaning maqsadi rost sababni ko'rsatish, aynan shu
    // yerda buzilardi. Xabarlar ham shu yerda: yarim bajarilgan navbat
    // xabar yozib ulgurgan bo'lishi mumkin.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
  });

  const instructAgent = useMutation({
    // Operator mavzuni yozadi, xabarni agent tuzib yuboradi va suhbatni
    // davom ettiradi (`InstructAgentUseCase`).
    mutationFn: (text: string) =>
      api.post<AgentTurnResult>(`/conversations/${conversationId}/agent-instruction`, {
        instruction: text,
      }),
    // Panel faqat xabar HAQIQATAN ketganda yopiladi: agent yozmaslikka
    // qaror qilsa operator buni ko'rishi va topshiriqni tuzatishi kerak.
    onSuccess: (result) => {
      if (result.sent) {
        setInstruction('');
        setInstructionOpen(false);
      }
    },
    // `retryAgent` dagi sabab bilan `onSettled`: yiqilganda ham server qaydni
    // yozgan va suhbat holatini o'zgartirgan bo'ladi.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
  });

  const editSentMutation = useMutation({
    mutationFn: (payload: { messageId: string; body: string }) =>
      api.patch<{ message: Message }>(
        `/conversations/${conversationId}/messages/${payload.messageId}`,
        { body: payload.body },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['messages', conversationId] }),
  });

  const deleteMessageMutation = useMutation({
    mutationFn: (messageId: string) =>
      api.delete<{ message: Message }>(
        `/conversations/${conversationId}/messages/${messageId}`,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  // Sahifalar orasida bitta suhbat ikki marta kelishi mumkin: aylantirish
  // paytida yangi xabar kelsa, suhbat tepaga ko'chadi va keyingi sahifaning
  // offseti bittaga suriladi. Birinchi uchragani qoladi.
  const items = useMemo(() => {
    const seen = new Set<string>();
    return (listQuery.data?.pages ?? [])
      .flatMap((page) => page.items)
      .filter((item) => {
        if (seen.has(item.conversation.id)) return false;
        seen.add(item.conversation.id);
        return true;
      });
  }, [listQuery.data]);
  const listTotal = listQuery.data?.pages[0]?.total ?? 0;

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = listQuery;
  useEffect(() => {
    const end = listEndRef.current;
    if (!end || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
      },
      // Oxirga yetmasdan biroz oldin yuklanadi — operator bo'sh joyni ko'rmasin.
      { root: listScrollRef.current, rootMargin: '300px' },
    );
    observer.observe(end);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, items.length, showList]);
  const detail = detailQuery.data;
  const messages = messagesQuery.data?.items ?? [];

  const grouped = useMemo(() => groupByDay(messages), [messages]);

  const busy = sendMutation.isPending || sendFileMutation.isPending;

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (!conversationId || busy) return;

    // Fayl biriktirilgan bo'lsa — matn uning izohi bo'ladi.
    if (attachment) {
      sendFileMutation.mutate({ file: attachment, caption: draft.trim() });
      return;
    }

    const text = draft.trim();
    if (!text) return;
    sendMutation.mutate({ body: text });
  };

  const pickFile = (file: File | null | undefined): void => {
    if (file) setAttachment(file);
  };

  return (
    <div className="flex h-full min-h-0">
      {/* ─── Suhbatlar ro'yxati ─────────────────────────────────── */}
      {showList ? (
        <div
          className={clsx(
            'flex shrink-0 flex-col border-r border-ink-800',
            isMobile ? 'w-full' : 'w-80',
          )}
        >
        <div className="space-y-2.5 border-b border-ink-800 px-3 py-3">
          <input
            className="input"
            placeholder="Mijoz ismi yoki raqami…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {/* To'rtta tugma bitta qatorga sig'maydi (yon panel 320px) — ikki
              ustunga bo'lindi, aks holda yozuvlar kesilib qolardi. */}
          <div className="grid grid-cols-2 gap-1">
            {(
              [
                ['all', 'Hammasi'],
                ['needsHuman', 'Inson kerak'],
                ['unread', 'O\'qilmagan'],
                ['blocked', 'Bloklaganlar'],
                ['receipt', 'Chek keldi'],
              ] as Array<[Filter, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={clsx(
                  'rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors',
                  filter === key ? 'bg-ink-800 text-ink-100' : 'text-ink-500 hover:bg-ink-800/50',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/*
            Akkauntlar ro'yxati serverdan keladi va faqat
            suhbatlarda HAQIQATAN uchraydiganlarini o'z ichiga oladi —
            operator tanlab, bo'sh natija olmaydi.

            Ro'yxat bo'sh bo'lsa select umuman ko'rsatilmaydi: bitta ham
            akkaunt biriktirilmagan bo'lsa, tanlash tugmasi faqat joyni
            egallardi.
          */}
          {(filtersQuery.data?.accounts.length ?? 0) > 0 ? (
            <select
              className="input text-xs"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">Barcha akkauntlar</option>
              {filtersQuery.data?.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          ) : null}

          {/* Filtr yoqilganda buni ko'rsatib turish kerak: aks holda bo'sh
              ro'yxatni "suhbat yo'q" deb tushunish oson. */}
          {accountId ? (
            <button
              type="button"
              onClick={() => setAccountId('')}
              className="w-full rounded-md border border-ink-800 px-2 py-1 text-[11px] text-ink-400 hover:bg-ink-800/50"
            >
              Filtrni tozalash ({listTotal} ta topildi)
            </button>
          ) : null}
        </div>

        <div ref={listScrollRef} className="min-h-0 flex-1 overflow-y-auto">
          {listQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : items.length === 0 ? (
            // Filtr yoqilganda sabab boshqacha: suhbatlar bor, shunchaki
            // shu tanlovga tushmadi. Eski matn "hali hech narsa yo'q" deb
            // adashtirardi.
            accountId || search || filter !== 'all' ? (
              <EmptyState
                title="Mos suhbat topilmadi"
                hint="Tanlangan filtrga tushadigan suhbat yo'q — filtrni kengaytirib ko'ring."
              />
            ) : (
              <EmptyState
                title="Suhbat yo'q"
                hint="Kampaniya ishga tushganda yoki mijoz javob berganda suhbatlar shu yerda paydo bo'ladi."
              />
            )
          ) : (
            items.map((item) => {
              const active = item.conversation.id === conversationId;
              return (
                <button
                  key={item.conversation.id}
                  type="button"
                  onClick={() => navigate(`/chat/${item.conversation.id}`)}
                  className={clsx(
                    'flex w-full gap-3 border-b border-ink-800/60 px-3 py-3 text-left transition-colors',
                    active ? 'bg-ink-800/70' : 'hover:bg-ink-900',
                  )}
                >
                  <Avatar text={initials(item.clientName)} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-medium text-ink-100">{item.clientName}</p>
                      <span className="shrink-0 text-[10px] text-ink-600">
                        {item.conversation.lastMessageAt ? relative(item.conversation.lastMessageAt) : ''}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-500">
                      {item.lastMessageDirection === 'out' ? 'Siz: ' : ''}
                      {item.lastMessageBody?.trim() || 'Xabar yo\'q'}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <span className={`chip ${STATE_COLOR[item.conversation.state]}`}>
                        {STATE_LABEL[item.conversation.state]}
                      </span>
                      {item.conversation.needsHuman ? (
                        <span className="chip bg-orange-500/20 text-orange-300">!</span>
                      ) : null}
                      {item.conversation.unreadCount > 0 ? (
                        <span className="ml-auto rounded-full bg-brand-500 px-1.5 text-[10px] font-semibold text-white">
                          {item.conversation.unreadCount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })
          )}
          {/* Ro'yxat oxiri: ko'rinishi bilan keyingi sahifa yuklanadi. */}
          {items.length > 0 ? (
            <div ref={listEndRef} className="flex justify-center py-3 text-[11px] text-ink-600">
              {isFetchingNextPage ? (
                <Spinner className="h-3 w-3" />
              ) : hasNextPage ? null : (
                `Hammasi yuklandi · ${listTotal} ta`
              )}
            </div>
          ) : null}
        </div>
        </div>
      ) : null}

      {/* ─── Chat ─────────────────────────────────────────────────── */}
      {showThread ? (
        !conversationId ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState title="Suhbatni tanlang" hint="Chapdagi ro'yxatdan mijozni tanlang." />
          </div>
        ) : (
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b border-ink-800 px-4 py-3">
            <button
              type="button"
              onClick={() => navigate('/chat')}
              aria-label="Suhbatlar ro'yxatiga qaytish"
              className="-ml-1 inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-md p-2 text-ink-400 hover:bg-ink-800 md:hidden"
            >
              ‹
            </button>
            <Avatar text={initials(detail?.client?.fullName ?? '?')} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{detail?.client?.fullName ?? '…'}</p>
              <p className="truncate text-[11px] text-ink-500">
                {detail?.client?.phone ?? 'raqam yo\'q'}
                {detail?.client?.telegramUsername ? ` · @${detail.client.telegramUsername}` : ''}
              </p>
            </div>
            {detail ? (
              <div className="flex items-center gap-2">
                {detail.purchase ? (
                  <span className={BOSQICH_CLASS[detail.purchase.stage]}>
                    {BOSQICH_YORLIGI[detail.purchase.stage]}
                  </span>
                ) : null}
                <span className={`chip ${STATE_COLOR[detail.conversation.state]}`}>
                  {STATE_LABEL[detail.conversation.state]}
                </span>
                <Toggle
                  checked={detail.conversation.agentEnabled}
                  onChange={(v) => agentToggle.mutate(v)}
                  label="Agent"
                  disabled={!canToggleAgent}
                />
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => setClientSheetOpen(true)}
              aria-label="Mijoz ma'lumoti"
              className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-md p-2 text-ink-400 hover:bg-ink-800 xl:hidden"
            >
              ⓘ
            </button>
          </header>

          {detail?.conversation.needsHuman ? (
            <div className="border-b border-orange-500/30 bg-orange-500/10 px-4 py-2">
              {/* Telefonda ikki tugma bitta qatorga sig'maydi — pastga tushadi. */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <p className="min-w-0 flex-1 text-xs text-orange-200">
                  <strong>
                    {detail.conversation.humanKind === 'agent_error'
                      ? 'Agent to\'xtab qoldi:'
                      : 'Inson aralashuvi kerak:'}
                  </strong>{' '}
                  {detail.conversation.humanReason ?? 'sabab ko\'rsatilmagan'}
                </p>
                {canManage || canToggleAgent ? (
                  <div className="flex items-center gap-2">
                    {/* Endpoint `conversations.agent_toggle` talab qiladi
                        (`manage` emas) — tugma shu ruxsat ostida bo'lishi
                        kerak, aks holda `manage`ga ega, lekin
                        `agent_toggle`i yo'q rolь tugmani bosib 403 olardi. */}
                    {detail.conversation.humanKind === 'agent_error' && canToggleAgent ? (
                      <button
                        type="button"
                        className="btn-primary !py-1 text-xs"
                        disabled={retryAgent.isPending}
                        onClick={() => retryAgent.mutate()}
                      >
                        {retryAgent.isPending ? <Spinner className="h-3 w-3" /> : null}
                        Qayta urinish
                      </button>
                    ) : null}
                    {canManage ? (
                      <button
                        type="button"
                        className="btn-ghost !py-1 text-xs"
                        onClick={() => resolveHuman.mutate()}
                      >
                        Hal qilindi — agentga qaytarish
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {retryAgent.isError ? (
                <div className="mt-2">
                  <ErrorNote error={retryAgent.error} />
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
            {messagesQuery.isLoading ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : messages.length === 0 ? (
              <EmptyState title="Yozishma yo'q" hint="Birinchi xabarni yozing yoki agentni ishga tushiring." />
            ) : (
              grouped.map(([day, dayMessages]) => (
                <div key={day} className="space-y-2">
                  <div className="sticky top-0 z-10 flex justify-center">
                    <span className="rounded-full bg-ink-900 px-2.5 py-0.5 text-[10px] text-ink-500">
                      {dateUz(day)}
                    </span>
                  </div>
                  {dayMessages.map((m) => (
                    <MessageBubble
                      key={m.id}
                      message={m}
                      canApprove={writable}
                      onApprove={(body) => sendMutation.mutate({ body, draftMessageId: m.id })}
                      onEdit={(body) => setDraft(body)}
                      canEditSent={canEditSent}
                      canDelete={canDeleteMessage}
                      onEditSent={(body) => editSentMutation.mutate({ messageId: m.id, body })}
                      onDelete={() => deleteMessageMutation.mutate(m.id)}
                      busy={editSentMutation.isPending || deleteMessageMutation.isPending}
                    />
                  ))}
                </div>
              ))
            )}
            {thinking ? (
              <div className="flex items-center gap-2 text-xs text-ink-500">
                <Spinner className="h-3 w-3" />
                Agent javob tayyorlamoqda…
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <form
            onSubmit={submit}
            className="border-t border-ink-800 px-4 py-3"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (writable) pickFile(e.dataTransfer.files[0]);
            }}
          >
            {sendMutation.error || sendFileMutation.error ? (
              <div className="mb-2">
                <ErrorNote error={sendMutation.error ?? sendFileMutation.error} />
              </div>
            ) : null}

            {editSentMutation.error || deleteMessageMutation.error ? (
              <div className="mb-2">
                <ErrorNote error={editSentMutation.error ?? deleteMessageMutation.error} />
              </div>
            ) : null}

            {attachment ? (
              <div className="mb-2 flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900/60 px-3 py-2">
                <span className="text-base">📎</span>
                <span className="min-w-0 flex-1 truncate text-xs text-ink-200">
                  {attachment.name}
                  <span className="ml-2 text-ink-500">
                    {(attachment.size / 1024).toFixed(0)} KB
                  </span>
                </span>
                <button
                  type="button"
                  className="text-ink-500 hover:text-ink-200"
                  onClick={() => setAttachment(null)}
                  title="Bekor qilish"
                >
                  ✕
                </button>
              </div>
            ) : null}

            {instructionOpen ? (
              <div className="mb-2 rounded-lg border border-brand-500/40 bg-brand-500/5 p-2">
                <p className="mb-1.5 text-[11px] text-ink-400">
                  Agent nima haqida yozsin? Mijoz bu matnni ko'rmaydi — agent kerak bo'lsa
                  salomlashib, o'zi yozadi va suhbatni davom ettiradi.
                </p>
                <div className="flex items-end gap-2">
                  <textarea
                    className="input min-h-[42px] resize-none"
                    rows={2}
                    maxLength={1000}
                    placeholder="Masalan: karta oldi, lekin to'lamadi — qulay vaqtini so'ra"
                    value={instruction}
                    disabled={instructAgent.isPending}
                    onChange={(e) => setInstruction(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (instruction.trim() && !instructAgent.isPending) {
                          instructAgent.mutate(instruction.trim());
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn-primary shrink-0"
                    disabled={instructAgent.isPending || !instruction.trim()}
                    onClick={() => instructAgent.mutate(instruction.trim())}
                  >
                    {instructAgent.isPending ? <Spinner /> : null}
                    Agent yozsin
                  </button>
                  <button
                    type="button"
                    className="btn-ghost shrink-0"
                    disabled={instructAgent.isPending}
                    onClick={() => setInstructionOpen(false)}
                  >
                    Bekor
                  </button>
                </div>
                {instructAgent.isError ? (
                  <div className="mt-2">
                    <ErrorNote error={instructAgent.error} />
                  </div>
                ) : null}
                {instructAgent.data && !instructAgent.data.sent ? (
                  <p className="mt-2 text-[11px] text-orange-300">
                    Agent xabar yozmadi — topshiriqni aniqroq yozing yoki suhbat holatini tekshiring.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  pickFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              {canToggleAgent ? (
                <button
                  type="button"
                  className={clsx('btn-ghost shrink-0 !px-3', instructionOpen && 'bg-ink-800')}
                  disabled={!writable}
                  title="Agentga topshiriq: mavzuni yozing, xabarni agent o'zi tuzadi"
                  aria-expanded={instructionOpen}
                  onClick={() => setInstructionOpen((v) => !v)}
                >
                  🤖
                </button>
              ) : null}
              <button
                type="button"
                className="btn-ghost shrink-0 !px-3"
                disabled={!writable || busy}
                title="Rasm yoki fayl biriktirish"
                onClick={() => fileInputRef.current?.click()}
              >
                📎
              </button>

              <textarea
                className="input min-h-[42px] resize-none"
                rows={1}
                placeholder={
                  !writable
                    ? 'Sizda yozish huquqi yo\'q'
                    : attachment
                      ? 'Izoh (ixtiyoriy)…'
                      : 'Xabar yozing yoki faylni shu yerga tashlang…'
                }
                value={draft}
                disabled={!writable}
                onChange={(e) => setDraft(e.target.value)}
                onPaste={(e) => {
                  // Skrinshotni Cmd+V bilan qo'yish.
                  const file = e.clipboardData.files[0];
                  if (file && writable) {
                    e.preventDefault();
                    pickFile(file);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submit(e);
                  }
                }}
              />
              <button
                type="submit"
                className="btn-primary shrink-0"
                disabled={!writable || busy || (!draft.trim() && !attachment)}
              >
                {busy ? <Spinner /> : null}
                Yuborish
              </button>
            </div>
          </form>
        </div>
        )
      ) : null}

      {/* ─── Mijoz kartasi ────────────────────────────────────────── */}
      {conversationId && detail ? <ClientPanel detail={detail} /> : null}

      {!isWide && detail ? (
        <Sheet
          open={clientSheetOpen}
          onClose={() => setClientSheetOpen(false)}
          title={detail.client?.fullName ?? 'Mijoz'}
          variant="right"
        >
          <div className="p-4">
            <ClientPanelBody detail={detail} />
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}

/**
 * Suhbat qaysi Telegram akkauntdan davom etayotgani va uni almashtirish.
 *
 * NEGA KERAK: akkaunt tizimdan o'chirilganda uning suhbatlaridagi
 * `telegram_account_id` bo'shatiladi. Shundan keyin na agent, na operator
 * yoza olardi ("Telegram akkaunt tanlanmagan") va buni dashboarddan
 * tuzatishning iloji yo'q edi.
 *
 * Almashtirish — ONGLI qaror: mijoz boshqa raqamdan xabar oladi, shuning
 * uchun ogohlantirish ko'rsatiladi.
 */
function AccountPicker({ detail }: { detail: ConversationDetail }) {
  const queryClient = useQueryClient();
  const canManage = useCan('conversations.manage');
  const [open, setOpen] = useState(false);

  const current = detail.accountOptions.find((a) => a.id === detail.conversation.telegramAccountId);
  const missing = !detail.conversation.telegramAccountId;

  const change = useMutation({
    mutationFn: (telegramAccountId: string) =>
      api.patch(`/conversations/${detail.conversation.id}`, { telegramAccountId }),
    onSuccess: () => {
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['conversation', detail.conversation.id] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  return (
    <div className={clsx('card mb-3', missing && 'border-amber-500/40 bg-amber-500/5')}>
      <p className="text-[11px] uppercase tracking-wide text-ink-500">Telegram akkaunt</p>

      {missing ? (
        <p className="mt-1 text-xs text-amber-300">
          Tanlanmagan — xabar yuborib bo'lmaydi. Akkaunt o'chirilgan bo'lsa shunday
          bo'ladi; quyidan tanlang.
        </p>
      ) : (
        <p className="mt-1 text-sm text-ink-200">
          {current?.label ?? 'Akkaunt yoza olmayapti'}
          {current ? <span className="ml-1 text-[11px] text-ink-500">{current.phone}</span> : null}
        </p>
      )}

      {canManage ? (
        open ? (
          <div className="mt-2 space-y-1">
            {detail.accountOptions.length ? (
              detail.accountOptions.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  disabled={change.isPending || a.id === detail.conversation.telegramAccountId}
                  onClick={() => change.mutate(a.id)}
                  className="flex w-full items-baseline justify-between gap-2 rounded-md border border-ink-800 px-2 py-1 text-left text-[11px] hover:border-ink-600 disabled:opacity-40"
                >
                  <span className="text-ink-200">{a.label}</span>
                  <span className="text-ink-500">{a.phone}</span>
                </button>
              ))
            ) : (
              <p className="text-[11px] text-ink-500">
                Yoza oladigan akkaunt yo'q — `Telegram` sahifasidan akkaunt ulang.
              </p>
            )}
            {!missing ? (
              <p className="pt-1 text-[10px] leading-relaxed text-amber-400/80">
                Diqqat: akkaunt almashsa mijoz BOSHQA raqamdan va BOSHQA ism
                bilan xabar oladi, yozishma uzilib qolgandek ko'rinadi.
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[10px] text-ink-500 hover:text-ink-300 max-md:inline-flex max-md:min-h-10 max-md:min-w-10 max-md:items-center max-md:justify-center"
            >
              Bekor
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-1.5 text-[11px] text-ink-400 hover:text-ink-200"
          >
            {missing ? 'Akkaunt tanlash' : 'Almashtirish'}
          </button>
        )
      ) : null}

      {change.error ? (
        <div className="mt-1.5">
          <ErrorNote error={change.error} />
        </div>
      ) : null}
    </div>
  );
}

function ClientPanel({ detail }: { detail: ConversationDetail }) {
  return (
    <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-ink-800 p-4 xl:block">
      <ClientPanelBody detail={detail} />
    </aside>
  );
}

/** Panelning mazmuni — keng ekrandagi ustunda ham, `Sheet` ichida ham shu. */
function ClientPanelBody({ detail }: { detail: ConversationDetail }) {
  const { client } = detail;
  const canEditClient = useCan('clients.edit');

  return (
    <>
      <div className="mb-4 flex flex-col items-center text-center">
        <Avatar text={initials(client?.fullName ?? '?')} size={56} />
        <p className="mt-2 text-sm font-medium">{client?.fullName}</p>
        <p className="text-[11px] text-ink-500">{client?.phone ?? 'raqam yo\'q'}</p>
      </div>

      <AccountPicker detail={detail} />

      {/* Xarid kartasidan YUQORIDA: mijoz chek yuborganda operator birinchi
          shu tugmani qidiradi. */}
      <ReceiptConfirmButton
        key={detail.conversation.id}
        conversationId={detail.conversation.id}
        receiptReview={detail.receiptReview}
      />
      <SendLinkButton
        key={`havola-${detail.conversation.id}`}
        conversationId={detail.conversation.id}
        visible={
          detail.linkPending ||
          (detail.conversation.needsHuman && detail.conversation.humanReason === "Guruh havolasini yuborib bo'lmadi")
        }
      />

      {client ? (
        <div className="mb-3">
          <PurchaseStageCard client={client} purchase={detail.purchase} canEdit={canEditClient} />
        </div>
      ) : null}

      {client?.notes ? (
        <div className="card mb-3">
          <p className="text-[11px] uppercase tracking-wide text-ink-500">Izoh</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-ink-300">{client.notes}</p>
        </div>
      ) : null}

      {detail.conversation.summary ? (
        <div className="card mt-3">
          <p className="text-[11px] uppercase tracking-wide text-ink-500">Agent eslatmasi</p>
          <p className="mt-1 text-xs text-ink-300">{detail.conversation.summary}</p>
        </div>
      ) : null}
    </>
  );
}

function groupByDay(messages: Message[]): Array<[string, Message[]]> {
  const map = new Map<string, Message[]>();
  for (const m of messages) {
    const day = (m.sentAt ?? m.createdAt).slice(0, 10);
    const list = map.get(day) ?? [];
    list.push(m);
    map.set(day, list);
  }
  return [...map.entries()];
}
