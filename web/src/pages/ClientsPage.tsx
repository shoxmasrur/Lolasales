import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import clsx from 'clsx';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  getSocket,
  type BulkLookupJob,
  type BulkStartJob,
  type ServerEvent,
} from '@/lib/socket';
import { useCan } from '@/store/auth';
import type {
  AloqaHolati, ClientWithDebt, ContractStatusOption, Conversation, Page, TelegramLookupStatus,
} from '@/lib/types';
import { MultiSelect, type MultiSelectOption } from '@/components/MultiSelect';
import {
  CONTRACT_STATUS_CLASS,
  initials,
  somShort,
  TELEGRAM_STATUS_LABEL,
} from '@/lib/format';
import { Avatar, EmptyState, ErrorNote, Spinner } from '@/components/ui';
import { StartConversationsDialog } from '@/components/StartConversationsDialog';
import { LookupAccountsDialog } from '@/components/LookupAccountsDialog';
import { AddClientDialog } from '@/components/AddClientDialog';
import { PhoneBlocksExport } from '@/components/PhoneBlocksExport';
import { ClientsExportButton } from '@/components/ClientsExportButton';
import { RecontactPanel } from '@/components/recontact/RecontactPanel';
import { Sheet } from '@/components/Sheet';
import { useIsMobile } from '@/lib/useBreakpoint';
import { ClientDetailBody, type ClientDetail } from '@/components/client/ClientDetailBody';

/**
 * Sahifadagi mijozlar soni — operator o'zi tanlaydi.
 *
 * Sukut 20 ta: ro'yxat bir ekranga sig'adi va sahifa tez ochiladi.
 * Ko'proq kerak bo'lsa (masalan ko'zdan kechirib chiqish uchun) pastdagi
 * tanlagichdan oshiriladi. Yuqori chegara 200 — server ham shundan
 * ortig'ini qaytarmaydi.
 */
const PAGE_SIZES = [20, 50, 100, 200] as const;
const DEFAULT_PAGE_SIZE = 20;

/** Agent shu mijoz haqida eslab qolgan narsalar — suhbatlar orasida saqlanadi. */
type ClientTab = 'all' | 'new' | 'in_conversation' | 'no_telegram' | 'needs_review' | 'deleted';

/** Telegram holati filtri variantlari — tartib ro'yxatda shunday ko'rinadi. */
const TG_STATUS_OPTIONS: ReadonlyArray<MultiSelectOption<TelegramLookupStatus>> = [
  { value: 'found', label: 'Telegram topilgan' },
  { value: 'unknown', label: 'Hali tekshirilmagan' },
  { value: 'name_mismatch', label: 'Ism mos kelmadi' },
  { value: 'not_found', label: "Telegramda yo'q" },
  { value: 'privacy_restricted', label: 'Maxfiylik yopiq' },
  { value: 'blocked', label: 'Bloklangan' },
];

/** URL'dagi `?tab=` qiymati — "Qayta aloqa" bo'limi. */
const RECONTACT_TAB = 'qayta-aloqa';

/** Operatorning ish oqimi bo'yicha tablar. */
const TABS: Array<{ key: ClientTab; label: string; hint: string }> = [
  { key: 'all', label: 'Hammasi', hint: 'Barcha mijozlar' },
  { key: 'new', label: 'Yangi', hint: 'Hali suhbat boshlanmagan' },
  { key: 'in_conversation', label: 'Suhbatda', hint: 'Suhbat boshlangan mijozlar' },
  { key: 'no_telegram', label: 'Telegram topilmadi', hint: 'Raqam Telegramda yo\'q yoki yopiq' },
  { key: 'needs_review', label: 'Tekshirish kerak', hint: 'Ism mos kelmadi — tasdiq kutilyapti' },
  // Savat: faqat o'chirish ruxsati bo'lganlarga ko'rinadi.
  { key: 'deleted', label: 'O\'chirilgan', hint: 'Ro\'yxatdan olib tashlanganlar — qaytarish mumkin' },
];

export default function ClientsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canEdit = useCan('clients.edit');
  const canCreate = useCan('clients.create');
  const canLookup = useCan('clients.telegram_lookup');
  const canStart = useCan('clients.start_conversation');
  const canDelete = useCan('clients.delete');
  const writable = canEdit || canLookup || canStart;
  const isMobile = useIsMobile();

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'debt' | 'overdue' | 'name'>('debt');
  const [onlyNoPhone, setOnlyNoPhone] = useState(false);
  // Telegram holati bo'yicha filtr — tab bilan BIRGA ishlaydi, ya'ni
  // "Yangi + Telegram topilgan" kombinatsiyasi mumkin. Aynan shu kerak:
  // hali suhbat boshlanmagan, lekin bog'lansa bo'ladigan mijozlar.
  // Bir nechta holat tanlanadi ("yoki"); bo'sh ro'yxat — hammasi.
  const [tgStatus, setTgStatus] = useState<TelegramLookupStatus[]>([]);
  // Shartnoma holati (`virtual_status`) bo'yicha filtr. Agent faqat
  // "Сотилди" bo'yicha yozadi, ya'ni operator "nega bu mijozga xabar
  // ketmadi?" degan savolga shu filtr orqali javob topadi.
  const [contractStatus, setContractStatus] = useState<string[]>([]);
  const [aloqa, setAloqa] = useState<'' | AloqaHolati>('');
  /**
   * Faqat kechikkan to'lovi borlar.
   *
   * `debt_total` — boshlang'ich va oylik kechikishning YIG'INDISI, ya'ni
   * `StartConversationUseCase` tekshiradigan summaning aynan o'zi. Shu
   * sabab bu filtr "xabar ketadiganlar" bilan bir xil ma'noda ishlaydi.
   */
  const [onlyWithDebt, setOnlyWithDebt] = useState(false);
  // Tab va "Qayta aloqa" bo'limi URL'da (`?tab=`) turadi, holatda emas.
  // Holatda turganda chatga o'tib "Orqaga" bosilsa yoki F5 qilinsa sahifa
  // "Hammasi" ga qaytib ketardi va operator bo'limni qaytadan topishi kerak
  // edi. `replace` — tab almashtirish brauzer tarixini to'ldirmasin:
  // "Orqaga" chatdan to'g'ri shu ro'yxatga qaytishi kerak.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const recontactOpen = tabParam === RECONTACT_TAB;
  const tab: ClientTab = TABS.some((t) => t.key === tabParam) ? (tabParam as ClientTab) : 'all';
  const setTab = (next: ClientTab): void => {
    setSearchParams(next === 'all' ? {} : { tab: next }, { replace: true });
  };
  const openRecontact = (): void => {
    if (!recontactOpen) setSearchParams({ tab: RECONTACT_TAB }, { replace: true });
  };
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [selected, setSelected] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // Checkbox ustuni: ommaviy amallardan bittasi mavjud bo'lsa ko'rinadi.
  // Savatda esa ular mantiqsiz — o'chirilgan mijozga xabar yozilmaydi.
  const canSelect = (canLookup || canStart) && tab !== 'deleted';

  /**
   * Ekrandagi filtr — ro'yxat, "hammasini belgilash" va eksport UCHALASI
   * shu obyektdan yuradi.
   *
   * NEGA BITTA JOYDA: uchta nusxa bo'lganda biri yangilanib, ikkinchisi
   * unutiladi — operator ekranda ko'rmagan mijozlarni belgilab qo'yadi
   * yoki faylda boshqa to'plamni oladi.
   */
  const filtrlar = useMemo(
    () => ({
      search: search || undefined,
      tab: tab === 'all' ? undefined : tab,
      telegramStatus: tgStatus.length ? tgStatus : undefined,
      virtualStatus: contractStatus.length ? contractStatus : undefined,
      aloqa: aloqa || undefined,
      hasPhone: onlyNoPhone ? 'false' : undefined,
      hasDebt: onlyWithDebt ? 'true' : undefined,
    }),
    [search, tab, tgStatus, contractStatus, aloqa, onlyNoPhone, onlyWithDebt],
  );

  const listQuery = useQuery({
    // Kalit `filtrlar` ning O'ZIDAN quriladi — TanStack obyektni barqaror
    // hash qiladi. Filtrlarni qo'lda sanash yangi filtr qo'shilganda uni
    // kalitga qo'shishni unutishga olib kelardi: ro'yxat eskirgan
    // natijani ko'rsatib turardi.
    queryKey: ['clients', filtrlar, sort, page, pageSize],
    queryFn: () =>
      api.get<Page<ClientWithDebt>>('/clients', {
        ...filtrlar,
        sort,
        limit: pageSize,
        offset: page * pageSize,
      }),
  });

  // Ro'yxat kamdan-kam o'zgaradi (CRM yangi holat qo'shganda), shuning
  // uchun mijozlar bilan birga qayta so'ralmaydi.
  const statusesQuery = useQuery({
    queryKey: ['contract-statuses'],
    queryFn: () => api.get<{ items: ContractStatusOption[] }>('/clients/contract-statuses'),
    staleTime: 5 * 60_000,
  });

  /**
   * Holat kaliti → ko'rinadigan nom.
   *
   * Serverdan kelgan ro'yxatdan quriladi — nomlar u yerda bitta joyda
   * turadi. Tanilmagan kalit o'zi ko'rsatiladi: CRM yangi holat qo'shsa,
   * jadvalda bo'sh katak emas, xom nom chiqadi.
   */
  const statusLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of statusesQuery.data?.items ?? []) m.set(h.key, h.label);
    return m;
  }, [statusesQuery.data]);

  const countsQuery = useQuery({
    queryKey: ['client-tab-counts'],
    queryFn: () => api.get<{ counts: Record<ClientTab, number> }>('/clients/tab-counts'),
    refetchInterval: 60_000,
  });

  // ─── Ommaviy Telegram tekshiruvi ──────────────────────────────────────
  const [checked, setChecked] = useState<Set<string>>(new Set());

  /**
   * Filtr o'zgarganda belgilanganlar bekor qilinadi.
   *
   * NEGA KERAK: ilgari tanlov filtrdan QAT'IY NAZAR saqlanardi va ekranda
   * faqat "N ta mijoz belgilandi" degan son turardi — KIMLAR ekani hech
   * qayerda ko'rinmasdi. Operator filtrsiz ro'yxatda mijozlarni belgilab,
   * keyin "Сотилди + Telegram topilgan" filtrini qo'ysa, ekranda butunlay
   * boshqa odamlar turardi, tanlov esa hamon eskilari edi. "Suhbat
   * boshlash" bosilganda xabarlar aynan o'sha ko'rinmayotgan eski
   * ro'yxatga ketardi. Bir marta shunday bo'lgan.
   *
   * Endi qoida sodda: nimani ko'rsang, shuni tanlagansan.
   *
   * Sahifalash va saralash ATAYLAB bu ro'yxatda yo'q — ular to'plamning
   * o'zini o'zgartirmaydi, faqat ko'rinishini. Sahifalar orasida yurish
   * tanlovni buzmasligi kerak.
   */
  useEffect(() => {
    setChecked((s) => (s.size ? new Set() : s));
  }, [search, tab, tgStatus, contractStatus, onlyNoPhone, onlyWithDebt]);
  const [job, setJob] = useState<BulkLookupJob | null>(null);
  const [dismissed, setDismissed] = useState(false);

  /**
   * Vazifa holati ikki yo'l bilan keladi:
   *   • socket — darhol, har qadamda;
   *   • shu so'rov — zaxira: socket uzilsa yoki hodisa yo'qolsa ham
   *     progress qotib qolmasin.
   *
   * Vazifa ketayotganda har 3 soniyada, aks holda faqat sahifa ochilganda.
   */
  useQuery({
    queryKey: ['bulk-lookup'],
    queryFn: async () => {
      const data = await api.get<{ job: BulkLookupJob | null }>('/clients/telegram-lookup-bulk');
      if (data.job) {
        setJob(data.job);
        // Socket ishlamayotgan bo'lsa ham ro'yxat tugagach yangilansin.
        if (data.job.status !== 'running') {
          void queryClient.invalidateQueries({ queryKey: ['clients'] });
          void queryClient.invalidateQueries({ queryKey: ['client-tab-counts'] });
        }
      }
      return data;
    },
    refetchInterval: job?.status === 'running' ? 3_000 : false,
    // Fon vazifasi — sahifa boshqa tabda bo'lsa ham kuzatib turamiz.
    refetchIntervalInBackground: true,
  });

  // Progress socket orqali keladi — so'rov yubormasdan jonli yangilanadi.
  useEffect(() => {
    const socket = getSocket();
    const onEvent = (event: ServerEvent): void => {
      if (event.type !== 'telegram.lookup_progress') return;
      setJob(event.job);
      setDismissed(false);

      if (event.job.status !== 'running') {
        void queryClient.invalidateQueries({ queryKey: ['clients'] });
        void queryClient.invalidateQueries({ queryKey: ['client-tab-counts'] });
      }
    };
    socket.on('event', onEvent);
    return () => {
      socket.off('event', onEvent);
    };
  }, [queryClient]);

  /**
   * Filtrga tushgan mijozlarni belgilaydi.
   *
   * Faqat id'lar so'raladi va sahifalash YO'Q: ro'yxat so'rovi 200 ta
   * bilan cheklangan (u ekran uchun), bu esa filtrga tushgan hammani
   * qaytaradi. Aks holda operator "hammasini belgiladim" deb o'ylab,
   * aslida faqat birinchi 200 tasi bilan ishlardi.
   */
  const selectAll = useMutation({
    mutationFn: () => api.get<{ ids: string[]; total: number }>('/clients/ids', filtrlar),
    onSuccess: (data) => setChecked(new Set(data.ids)),
  });

  // Akkaunt tanlash oynasi. Ilgari tugma darhol ishga tushirardi va
  // qidiruvni qaysi akkaunt bajarishini operator boshqara olmasdi.
  const [lookupDialog, setLookupDialog] = useState(false);

  const startBulk = useMutation({
    mutationFn: (accountIds: string[]) =>
      api.post<{ job: BulkLookupJob }>('/clients/telegram-lookup-bulk', {
        clientIds: [...checked],
        accountIds,
      }),
    onSuccess: (data) => {
      setJob(data.job);
      setDismissed(false);
      setChecked(new Set());
      setLookupDialog(false);
    },
  });

  const stopBulk = useMutation({
    mutationFn: () => api.post('/clients/telegram-lookup-bulk/stop'),
  });

  // ─── Ommaviy suhbat boshlash ──────────────────────────────────────────
  const [startJob, setStartJob] = useState<BulkStartJob | null>(null);
  /** Qaysi sabab ochib ko'rilyapti — bir vaqtda bittasi. */
  const [ochiqSabab, setOchiqSabab] = useState<string | null>(null);
  const [startDismissed, setStartDismissed] = useState(false);

  useQuery({
    queryKey: ['bulk-start'],
    queryFn: async () => {
      const data = await api.get<{ job: BulkStartJob | null }>('/clients/start-conversation-bulk');
      if (data.job) {
        setStartJob(data.job);
        if (data.job.status !== 'running') {
          void queryClient.invalidateQueries({ queryKey: ['clients'] });
          void queryClient.invalidateQueries({ queryKey: ['client-tab-counts'] });
        }
      }
      return data;
    },
    // Oraliq 60-180 soniya — tez-tez so'rashning ma'nosi yo'q.
    refetchInterval: startJob?.status === 'running' ? 10_000 : false,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    const socket = getSocket();
    const onEvent = (event: ServerEvent): void => {
      if (event.type !== 'conversation.bulk_progress') return;
      setStartJob(event.job);
      setStartDismissed(false);

      if (event.job.status !== 'running') {
        void queryClient.invalidateQueries({ queryKey: ['clients'] });
        void queryClient.invalidateQueries({ queryKey: ['client-tab-counts'] });
      }
    };
    socket.on('event', onEvent);
    return () => {
      socket.off('event', onEvent);
    };
  }, [queryClient]);

  // Tasdiqlash oynasi: boshlashdan oldin nima bo'lishini ko'rsatadi.
  const [startDialog, setStartDialog] = useState(false);

  const startConversations = useMutation({
    mutationFn: (vars: {
      allowNameMismatch: boolean;
      accountIds: string[];
      perAccount: Record<string, number>;
      spreadUntil: string;
    }) =>
      api.post<{ job: BulkStartJob }>('/clients/start-conversation-bulk', {
        clientIds: [...checked],
        allowNameMismatch: vars.allowNameMismatch,
        accountIds: vars.accountIds,
        perAccount: vars.perAccount,
        spreadUntil: vars.spreadUntil,
      }),
    onSuccess: (data) => {
      setStartJob(data.job);
      setStartDismissed(false);
      setStartDialog(false);
      setChecked(new Set());
    },
  });

  const stopStart = useMutation({
    mutationFn: () => api.post('/clients/start-conversation-bulk/stop'),
  });

  const detailQuery = useQuery({
    queryKey: ['client', selected],
    queryFn: () => api.get<ClientDetail>(`/clients/${selected}`),
    enabled: Boolean(selected),
  });

  const lookup = useMutation({
    mutationFn: (id: string) => api.post<{ outcome: string }>(`/clients/${id}/telegram-lookup`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
      void queryClient.invalidateQueries({ queryKey: ['client', selected] });
      void queryClient.invalidateQueries({ queryKey: ['client-tab-counts'] });
    },
  });

  /**
   * "Ism mos kelmasa ham yuborilsin" — bitta mijoz uchun.
   *
   * Ommaviy oqimdagi belgining aynan o'zi. Mijoz almashganda tozalanadi:
   * bir mijoz uchun berilgan ruxsat keyingisiga o'tib ketmasligi kerak.
   */
  const [mismatchOverride, setMismatchOverride] = useState(false);
  useEffect(() => {
    setMismatchOverride(false);
  }, [selected]);

  const startConversation = useMutation({
    mutationFn: (vars: { id: string; allowNameMismatch?: boolean }) =>
      api.post<{ status: string; reason?: string; conversation?: Conversation }>(
        `/clients/${vars.id}/start-conversation`,
        vars.allowNameMismatch ? { allowNameMismatch: true } : undefined,
      ),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      // Mijoz "Yangi" dan "Suhbatda" ga o'tdi.
      void queryClient.invalidateQueries({ queryKey: ['client-tab-counts'] });
      // Urinish paytida Telegram holati o'zgargan bo'lishi mumkin: hali
      // qidirilmagan mijoz shu yerda `name_mismatch` bo'lib qoladi.
      // Kartani yangilamasak, "baribir yuborilsin" belgisi paydo bo'lmaydi
      // va operator sababni ko'rib turib hech narsa qila olmaydi.
      void queryClient.invalidateQueries({ queryKey: ['client', selected] });
      if (result.status === 'started' && result.conversation) {
        navigate(`/chat/${result.conversation.id}`);
      }
    },
  });

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-ink-800 px-4 py-3 md:px-6 md:py-4">
          <div className="flex items-center justify-between gap-4 max-md:justify-end">
            <div className="hidden md:block">
              <h1 className="text-base font-semibold">Mijozlar</h1>
              <p className="mt-0.5 text-xs text-ink-500">{total} ta yozuv</p>
            </div>
            {canCreate ? (
              <button
                type="button"
                className="btn-ghost shrink-0 !py-1 text-xs"
                onClick={() => setAddOpen(true)}
              >
                + Mijoz qo'shish
              </button>
            ) : null}
          </div>

          {/* Ish oqimi bo'yicha tablar — xodim qaysi guruh ustida
              ishlayotganini bir qarashda ko'rsin. */}
          <div className="mt-3 flex flex-wrap gap-1">
            {TABS.filter((t) => t.key !== 'deleted' || canDelete).map((t) => {
              const count = countsQuery.data?.counts[t.key];
              const active = tab === t.key && !recontactOpen;
              return (
                <button
                  key={t.key}
                  type="button"
                  title={t.hint}
                  onClick={() => {
                    setTab(t.key);
                    setPage(0);
                  }}
                  className={clsx(
                    'rounded-lg px-3 py-1.5 text-xs transition-colors',
                    active
                      ? 'bg-brand-600 text-white'
                      : 'bg-ink-800/60 text-ink-300 hover:bg-ink-800',
                  )}
                >
                  {t.label}
                  {count !== undefined ? (
                    <span
                      className={clsx(
                        'ml-1.5 tabular-nums',
                        active ? 'text-white/70' : 'text-ink-500',
                      )}
                    >
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
            <button
              type="button"
              title="Avtomatika yozishni tugatgan, 3 ish kunidan beri jim suhbatlar"
              onClick={openRecontact}
              className={clsx(
                'rounded-lg px-3 py-1.5 text-xs transition-colors',
                recontactOpen
                  ? 'bg-brand-600 text-white'
                  : 'bg-ink-800/60 text-ink-300 hover:bg-ink-800',
              )}
            >
              Qayta aloqa
            </button>
          </div>

          {!recontactOpen ? (<>
          {/* Ketayotgan yoki endigina tugagan tekshiruv. */}
          {job && !dismissed ? (
            <div
              className={clsx(
                'mt-3 rounded-xl border px-4 py-3',
                job.status === 'running'
                  ? 'border-brand-500/40 bg-brand-500/5'
                  : job.status === 'failed'
                    ? 'border-red-500/40 bg-red-500/5'
                    : 'border-emerald-500/40 bg-emerald-500/5',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  {job.status === 'running' ? <Spinner /> : null}
                  <p className="truncate text-sm">
                    {job.status === 'running' ? (
                      <>
                        Telegram tekshirilmoqda —{' '}
                        <span className="tabular-nums">
                          {job.done}/{job.total}
                        </span>
                        {job.currentName ? (
                          <span className="text-ink-500"> · {job.currentName}</span>
                        ) : null}
                      </>
                    ) : job.status === 'failed' ? (
                      <span className="text-red-300">Tekshiruv to'xtadi</span>
                    ) : job.status === 'stopped' ? (
                      'Tekshiruv to\'xtatildi'
                    ) : (
                      <span className="text-emerald-300">Tekshiruv tugadi</span>
                    )}
                  </p>
                </div>

                {job.status === 'running' ? (
                  <button
                    type="button"
                    className="btn-ghost !py-1 text-xs"
                    disabled={stopBulk.isPending}
                    onClick={() => stopBulk.mutate()}
                  >
                    To'xtatish
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-ghost !py-1 text-xs"
                    onClick={() => setDismissed(true)}
                  >
                    Yopish
                  </button>
                )}
              </div>

              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-800">
                <div
                  className={clsx(
                    'h-full rounded-full transition-all',
                    job.status === 'failed' ? 'bg-red-400' : 'bg-brand-500',
                  )}
                  style={{ width: `${job.total ? (job.done / job.total) * 100 : 0}%` }}
                />
              </div>

              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                <span className="text-emerald-300">Topildi: {job.found}</span>
                <span className="text-amber-200">Tekshirish kerak: {job.needsReview}</span>
                <span className="text-ink-400">Topilmadi: {job.notFound}</span>
                {job.failed > 0 ? <span className="text-red-300">Xato: {job.failed}</span> : null}
              </div>

              {job.resumedCount ? (
                <p className="mt-1.5 text-[11px] text-ink-500">
                  Server yangilandi — vazifa to'xtagan joyidan davom etdi
                  {job.resumedCount > 1 ? ` (${job.resumedCount} marta)` : ''}.
                </p>
              ) : null}

              {job.error ? <p className="mt-1.5 text-[11px] text-red-300">{job.error}</p> : null}
            </div>
          ) : null}

          {/* Ketayotgan yoki endigina tugagan ommaviy suhbat boshlash. */}
          {startJob && !startDismissed ? (
            <div
              className={clsx(
                'mt-3 rounded-xl border px-4 py-3',
                startJob.status === 'running'
                  ? 'border-brand-500/40 bg-brand-500/5'
                  : startJob.status === 'failed'
                    ? 'border-red-500/40 bg-red-500/5'
                    : 'border-emerald-500/40 bg-emerald-500/5',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  {startJob.status === 'running' ? <Spinner /> : null}
                  <p className="truncate text-sm">
                    {startJob.status === 'running' ? (
                      <>
                        Suhbatlar boshlanmoqda —{' '}
                        <span className="tabular-nums">
                          {startJob.done}/{startJob.total}
                        </span>
                        {startJob.nextAt ? (
                          <span className="text-ink-500">
                            {' '}· keyingisi {new Date(startJob.nextAt).toLocaleTimeString('uz-UZ', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </span>
                        ) : null}
                        {startJob.paceMinutes !== null ? (
                          <span className="text-ink-500">
                            {' '}· ≈{startJob.paceMinutes} daqiqada bitta
                          </span>
                        ) : null}
                      </>
                    ) : startJob.status === 'failed' ? (
                      <span className="text-red-300">Yuborish to'xtadi</span>
                    ) : startJob.status === 'stopped' ? (
                      'Yuborish to\'xtatildi'
                    ) : (
                      <span className="text-emerald-300">Hammasi tugadi</span>
                    )}
                  </p>
                </div>

                {startJob.status === 'running' ? (
                  <button
                    type="button"
                    className="btn-ghost !py-1 text-xs"
                    disabled={stopStart.isPending}
                    onClick={() => stopStart.mutate()}
                  >
                    To'xtatish
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-ghost !py-1 text-xs"
                    onClick={() => setStartDismissed(true)}
                  >
                    Yopish
                  </button>
                )}
              </div>

              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-800">
                <div
                  className={clsx(
                    'h-full rounded-full transition-all',
                    startJob.status === 'failed' ? 'bg-red-400' : 'bg-brand-500',
                  )}
                  style={{ width: `${startJob.total ? (startJob.done / startJob.total) * 100 : 0}%` }}
                />
              </div>

              {/* Uch oqim bir vaqtda ishlaganda bitta umumiy "keyingi xabar"
                  vaqti ma'nosini yo'qotadi: operator qaysi akkaunt orqada
                  qolgani yoki cheklovga tushib to'xtaganini ko'ra olishi
                  kerak. Akkaunt tanlanmagan ishda ro'yxat bo'sh keladi va
                  jadval umuman chizilmaydi. */}
              {(startJob.accounts ?? []).length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {startJob.accounts.map((a) => (
                    <li
                      key={a.accountId ?? 'qoldiq'}
                      className={clsx(
                        'flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-md px-2 py-1 text-[11px]',
                        a.status === 'flood' ? 'bg-red-500/10' : 'bg-ink-900/40',
                      )}
                    >
                      <span className="min-w-24 shrink-0 font-medium text-ink-300">{a.label}</span>
                      <span className="tabular-nums text-ink-400">
                        {a.done}/{a.total}
                      </span>
                      {a.status === 'flood' ? (
                        <span className="text-red-300">{a.error ?? 'Cheklovga tushdi'}</span>
                      ) : a.status === 'done' ? (
                        <span className="text-emerald-300">tugadi</span>
                      ) : a.status === 'stopped' ? (
                        <span className="text-amber-300">to'xtatildi</span>
                      ) : a.nextAt ? (
                        <span className="text-ink-500">
                          keyingisi{' '}
                          {new Date(a.nextAt).toLocaleTimeString('uz-UZ', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      ) : null}
                      {a.status !== 'flood' && a.paceMinutes !== null ? (
                        <span className="text-ink-600">≈{a.paceMinutes} daq</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                <span className="text-emerald-300">Boshlandi: {startJob.started}</span>
                <span className="text-ink-400">O'tkazib yuborildi: {startJob.skipped}</span>
                {startJob.allowNameMismatch ? (
                  <span className="text-amber-300">Ism mos kelmaganlarga ham yuborilyapti</span>
                ) : null}
                {startJob.failed > 0 ? (
                  <span className="text-red-300">Xato: {startJob.failed}</span>
                ) : null}
              </div>
              {startJob.resumedCount ? (
                <p className="mt-1.5 text-[11px] text-ink-500">
                  Server yangilandi — vazifa to'xtagan joyidan davom etdi
                  {startJob.resumedCount > 1 ? ` (${startJob.resumedCount} marta)` : ''}.
                </p>
              ) : null}

              {/* Nega o'tkazib yuborilgani — xodim sababni bilishi kerak.
                  Sababning o'zi yetarli emas: "9 tasi Сотилди emas" degan
                  qatorni ko'rgan operator QAYSI shartnomalar ekanini
                  bilishi va CRM bilan solishtira olishi kerak. */}
              {Object.keys(startJob.skipReasons).length ? (
                <ul className="mt-1.5 space-y-0.5 text-[11px] text-ink-500">
                  {Object.entries(startJob.skipReasons).map(([reason, count]) => {
                    const items = (startJob.skippedItems ?? []).filter((x) => x.reason === reason);
                    const ochiq = ochiqSabab === reason;
                    return (
                      <li key={reason}>
                        <button
                          type="button"
                          onClick={() => setOchiqSabab(ochiq ? null : reason)}
                          disabled={items.length === 0}
                          className="text-left hover:text-ink-300 disabled:cursor-default disabled:hover:text-ink-500"
                        >
                          {reason} — <span className="tabular-nums">{count}</span>
                          {items.length > 0 ? (
                            <span className="ml-1 text-ink-600">{ochiq ? '▾' : '▸'}</span>
                          ) : null}
                        </button>

                        {ochiq ? (
                          <ul className="mt-1 max-h-52 space-y-0.5 overflow-y-auto rounded-md border border-ink-800 bg-ink-950/60 p-2">
                            {items.map((x) => (
                              <li key={x.clientId} className="flex items-baseline gap-2">
                                {/* Shartnoma raqami birinchi: operator CRM'da
                                    aynan shuni qidiradi. */}
                                <span className="shrink-0 font-mono text-ink-300">
                                  {x.contractNo ?? '—'}
                                </span>
                                <span className="truncate text-ink-400">{x.fullName}</span>
                              </li>
                            ))}
                            {startJob.skippedItemsTruncated > 0 ? (
                              <li className="pt-1 text-ink-600">
                                …va yana {startJob.skippedItemsTruncated} ta (ro'yxat cheklangan)
                              </li>
                            ) : null}
                          </ul>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {startJob.error ? (
                <p className="mt-1.5 text-[11px] text-red-300">{startJob.error}</p>
              ) : null}
            </div>
          ) : null}

          {/* Belgilangan mijozlar — amal paneli. */}
          {checked.size > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-ink-700 bg-ink-900/60 px-4 py-2.5">
              <span className="text-sm">
                <span className="font-semibold tabular-nums">{checked.size}</span> ta mijoz belgilandi
              </span>

              {canLookup ? (
                <button
                  type="button"
                  className="btn-ghost !py-1 text-xs"
                  disabled={startBulk.isPending || job?.status === 'running'}
                  onClick={() => setLookupDialog(true)}
                  title="Qaysi akkauntlar qidirishini tanlab, ketma-ket tekshiradi"
                >
                  {startBulk.isPending ? <Spinner /> : null}
                  Telegramni tekshirish
                </button>
              ) : null}

              {canStart ? (
                <button
                  type="button"
                  className="btn-primary !py-1 text-xs"
                  disabled={startConversations.isPending || startJob?.status === 'running'}
                  onClick={() => {
                    startConversations.reset();
                    setStartDialog(true);
                  }}
                  title="Ketma-ket, pauza bilan birinchi xabarni yuboradi"
                >
                  {startConversations.isPending ? <Spinner /> : null}
                  Suhbat boshlash
                </button>
              ) : null}

              <button
                type="button"
                className="btn-ghost !py-1 text-xs"
                onClick={() => setChecked(new Set())}
              >
                Bekor qilish
              </button>
              {startBulk.error ? <ErrorNote error={startBulk.error} /> : null}
              {/* Suhbat boshlash xatosi tasdiqlash oynasida ko'rsatiladi. */}
            </div>
          ) : null}

          {/* Filtrga tushgan HAMMA mijozni belgilash.
              Sahifada 50 ta ko'rinadi, ommaviy amallar esa 200 tagacha
              qabul qiladi — shuning uchun sahifama-sahifa yurish o'rniga
              bitta tugma. */}
          {canSelect && total > items.length ? (
            <div className="mt-3">
              <button
                type="button"
                className="btn-ghost !py-1 text-xs"
                disabled={selectAll.isPending}
                onClick={() => selectAll.mutate()}
                title="Filtrga tushgan hamma mijozni belgilaydi"
              >
                {selectAll.isPending ? <Spinner /> : null}
                Filtrdagi hammasini belgilash ({total} ta)
              </button>
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              className="input w-full md:max-w-xs"
              placeholder="Ism, telefon yoki shartnoma raqami…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
            <select
              className="input w-full md:max-w-[180px]"
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
            >
              <option value="debt">Oyma-oy kechikish bo'yicha</option>
              <option value="overdue">Kechikish bo'yicha</option>
              <option value="name">Ism bo'yicha</option>
            </select>
            <MultiSelect
              nom="Telegram"
              className="w-full md:max-w-[210px]"
              options={TG_STATUS_OPTIONS}
              value={tgStatus}
              onChange={(next) => {
                setTgStatus(next);
                setPage(0);
              }}
            />
            {/* Shartnoma holati. Ro'yxat serverdan keladi va faqat bazada
                UCHRAYDIGANLARINI o'z ichiga oladi — operator tanlab, bo'sh
                natija olmaydi. Bir xil holatning ikki xil yozilishi
                (`sold` va "Сотилди") bitta variant bo'lib birlashtirilgan. */}
            {(statusesQuery.data?.items.length ?? 0) > 0 ? (
              <MultiSelect
                nom="Shartnoma"
                className="w-full md:max-w-[210px]"
                options={(statusesQuery.data?.items ?? []).map((h) => ({
                  value: h.key,
                  label: `${h.label} (${h.clients})`,
                }))}
                value={contractStatus}
                onChange={(next) => {
                  setContractStatus(next);
                  setPage(0);
                }}
              />
            ) : null}
            {/* "O'qigani tasdiqlanmagan" ATAYLAB uzun: Telegram "o'qildi"
                xabarnomasi server uzilgan paytda yoki mijoz "oxirgi
                kirish" maxfiyligini yopganda umuman kelmaydi. Ya'ni
                ro'yxatda o'qigan odam ham bo'lishi mumkin — "O'qimagan"
                degan qisqa nom operatorni yo'ldan ozdirardi. Sabab
                `title`da ham, va (`<select>` ustida hover ishlamaydigan
                teginishli ekranlar uchun) pastdagi doim ko'rinadigan
                matnda ham takrorlanadi. */}
            <select
              className="input w-full md:max-w-[210px]"
              value={aloqa}
              onChange={(e) => {
                setAloqa(e.target.value as '' | AloqaHolati);
                setPage(0);
              }}
              title="Xabar ketganidan 3 kun o'tgan mijozlar bo'yicha. «O'qildi» belgisi akkaunt uzilganda yoki maxfiylik yopilganda kelmasligi mumkin."
            >
              <option value="">Aloqa: hammasi</option>
              <option value="javobsiz">Javob bermagan</option>
              <option value="oqilmagan">O'qigani tasdiqlanmagan</option>
            </select>
            <label className="flex items-center gap-2 text-xs text-ink-400">
              <input
                type="checkbox"
                checked={onlyNoPhone}
                onChange={(e) => {
                  setOnlyNoPhone(e.target.checked);
                  setPage(0);
                }}
              />
              Faqat raqamsizlar
            </label>
            {/* Uzilgan raqamlar CRM'da tuzatilishi kerak — u yerga yozish
                huquqimiz yo'q, shuning uchun ro'yxat eksport qilinadi. */}
            <PhoneBlocksExport />
            <ClientsExportButton filtrlar={{ ...filtrlar, sort }} soni={total} />
            <label className="flex items-center gap-2 text-xs text-ink-400">
              <input
                type="checkbox"
                checked={onlyWithDebt}
                onChange={(e) => {
                  setOnlyWithDebt(e.target.checked);
                  setPage(0);
                }}
              />
              Faqat kechikkan to'lovi borlar
            </label>
          </div>

          {/* `title` faqat hover'da ko'rinadi, bu sahifa esa teginish
              bilan ham ishlaydi (`useIsMobile`) — o'sha ekranda hover
              umuman yo'q. Operator qo'ng'iroq qilib "men o'qidim-ku"
              deb eshitib qolmasligi uchun sabab doim ko'rinadigan
              matnda ham beriladi. */}
          {aloqa === 'oqilmagan' ? (
            <p className="mt-2 text-[11px] text-ink-600">
              «O'qildi» belgisi akkaunt uzilgan yoki mijoz maxfiylikni yopgan bo'lsa
              umuman kelmaydi — ro'yxatda o'qigan mijoz ham bo'lishi mumkin.
            </p>
          ) : null}
          </>) : null}
        </header>

        {recontactOpen ? <RecontactPanel /> : (<>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {listQuery.isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : items.length === 0 ? (
            <EmptyState title="Mijoz topilmadi" hint="Import sahifasidan debitor faylini yuklang." />
          ) : isMobile ? (
            <>
              {canSelect ? (
                <label className="flex items-center gap-2 border-b border-ink-800 px-4 py-2.5 text-xs text-ink-400">
                  <input
                    type="checkbox"
                    checked={items.length > 0 && items.every((c) => checked.has(c.id))}
                    onChange={(e) => {
                      const next = new Set(checked);
                      for (const c of items) {
                        if (e.target.checked) next.add(c.id);
                        else next.delete(c.id);
                      }
                      setChecked(next);
                    }}
                  />
                  Sahifadagi hammasini belgilash
                </label>
              ) : null}
              <ul className="divide-y divide-ink-800/60">
                {items.map((client) => (
                  <li key={client.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelected(client.id)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelected(client.id);
                        }
                      }}
                      className="flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left active:bg-ink-900/60"
                    >
                      {canSelect ? (
                        // Katakka bosish kartochkani ochib yubormasligi kerak.
                        <label onClick={(e) => e.stopPropagation()} className="-m-2.5 p-2.5">
                          <input
                            type="checkbox"
                            checked={checked.has(client.id)}
                            onChange={(e) => {
                              const next = new Set(checked);
                              if (e.target.checked) next.add(client.id);
                              else next.delete(client.id);
                              setChecked(next);
                            }}
                          />
                        </label>
                      ) : null}

                      <Avatar text={initials(client.fullName)} size={34} />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-sm font-medium text-ink-100">
                            {client.fullName}
                          </p>
                          <span className="shrink-0 text-sm font-medium tabular-nums text-red-300">
                            {somShort(client.debtMonthly)}
                          </span>
                        </div>

                        <div className="mt-0.5 flex items-baseline justify-between gap-2">
                          <p className="truncate font-mono text-[11px] text-ink-500">
                            {client.phone ?? 'raqam yo\'q'}
                          </p>
                          <span className="shrink-0 text-[11px] text-ink-500">
                            {client.daysOverdue > 0 ? `${client.daysOverdue} kun` : '—'}
                          </span>
                        </div>

                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {client.doNotContact ? (
                            <span className="chip bg-red-500/15 text-red-300">Yozilmasin</span>
                          ) : null}
                          {/* Telegram holati — jadvaldagi Telegram ustunidagi shart
                              daraxti va yozuvi aynan shu. */}
                          <span
                            className={
                              client.telegramStatus === 'found'
                                ? 'chip bg-emerald-500/15 text-emerald-300'
                                : client.telegramStatus === 'name_mismatch'
                                  ? 'chip bg-amber-500/20 text-amber-200'
                                  : client.telegramStatus === 'unknown'
                                    ? 'chip bg-ink-800 text-ink-400'
                                    : 'chip bg-amber-500/15 text-amber-300'
                            }
                            title={
                              client.telegramName ? `Telegramda: ${client.telegramName}` : undefined
                            }
                          >
                            {client.telegramStatus === 'name_mismatch' ? '⚠ ' : ''}
                            {TELEGRAM_STATUS_LABEL[client.telegramStatus] ?? client.telegramStatus}
                          </span>
                          {client.accountName ? (
                            <span className="chip bg-ink-800 text-ink-400">{client.accountName}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-ink-950 text-[11px] uppercase tracking-wide text-ink-500">
                <tr className="border-b border-ink-800">
                  {canSelect ? (
                    <th className="w-9 px-3 py-2.5">
                      <input
                        type="checkbox"
                        title="Sahifadagi hammasini belgilash"
                        checked={items.length > 0 && items.every((c) => checked.has(c.id))}
                        onChange={(e) => {
                          const next = new Set(checked);
                          for (const c of items) {
                            if (e.target.checked) next.add(c.id);
                            else next.delete(c.id);
                          }
                          setChecked(next);
                        }}
                      />
                    </th>
                  ) : null}
                  <th className="px-6 py-2.5 text-left font-medium">Mijoz</th>
                  <th className="px-3 py-2.5 text-left font-medium">Telefon</th>
                  <th className="px-3 py-2.5 text-left font-medium">Telegram</th>
                  <th
                    className="px-3 py-2.5 text-left font-medium"
                    title="CRM'dagi shartnoma holati — agent &quot;Сотилди&quot;, &quot;К оплате&quot; va &quot;Проц. отказ&quot; bo'yicha yozadi"
                  >
                    Shartnoma
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium">Akkaunt</th>
                  <th className="px-3 py-2.5 text-right font-medium" title="Долг (мес.) — agent mijozga shu summani aytadi">Oyma-oy kechikish</th>
                  <th className="px-3 py-2.5 text-right font-medium" title="Долг (Общ) — boshlang'ich to'lovdagi kechikish bilan birga">Umumiy kechikish</th>
                  <th className="px-6 py-2.5 text-right font-medium">Kechikish</th>
                </tr>
              </thead>
              <tbody>
                {items.map((client) => (
                  <tr
                    key={client.id}
                    onClick={() => setSelected(client.id)}
                    className="cursor-pointer border-b border-ink-800/50 hover:bg-ink-900/60"
                  >
                    {canSelect ? (
                      // Katakka bosish qatorni ochib yubormasligi kerak.
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked.has(client.id)}
                          onChange={(e) => {
                            const next = new Set(checked);
                            if (e.target.checked) next.add(client.id);
                            else next.delete(client.id);
                            setChecked(next);
                          }}
                        />
                      </td>
                    ) : null}
                    <td className="px-6 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar text={initials(client.fullName)} size={30} />
                        <span className="font-medium text-ink-100">{client.fullName}</span>
                        {client.doNotContact ? (
                          <span className="chip bg-red-500/15 text-red-300">Yozilmasin</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-ink-400">{client.phone ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      <span
                        className={
                          client.telegramStatus === 'found'
                            ? 'chip bg-emerald-500/15 text-emerald-300'
                            : client.telegramStatus === 'name_mismatch'
                              ? 'chip bg-amber-500/20 text-amber-200'
                              : client.telegramStatus === 'unknown'
                                ? 'chip bg-ink-800 text-ink-400'
                                : 'chip bg-amber-500/15 text-amber-300'
                        }
                        title={
                          client.telegramName
                            ? `Telegramda: ${client.telegramName}`
                            : undefined
                        }
                      >
                        {client.telegramStatus === 'name_mismatch' ? '⚠ ' : ''}
                        {TELEGRAM_STATUS_LABEL[client.telegramStatus] ?? client.telegramStatus}
                      </span>
                      {/* Telegramdagi ism — xodim bir qarashda taqqoslay olsin. */}
                      {client.telegramName ? (
                        <p
                          className={`mt-0.5 truncate text-[10px] ${
                            client.telegramStatus === 'name_mismatch' ? 'text-amber-200' : 'text-ink-500'
                          }`}
                        >
                          {client.telegramName}
                        </p>
                      ) : null}
                    </td>
                    {/* Shartnoma holati. Mijozda bir nechta shartnoma bo'lsa
                        hammasi ko'rsatiladi — aralash holat aynan "nega
                        bunga xabar ketmadi?" degan savolni tug'diradi. */}
                    <td className="px-3 py-2.5">
                      {client.contractStatuses.length === 0 ? (
                        <span className="text-ink-600">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {client.contractStatuses.map((k) => (
                            <span
                              key={k}
                              className={CONTRACT_STATUS_CLASS[k] ?? 'chip bg-ink-800 text-ink-400'}
                            >
                              {statusLabel.get(k) ?? k}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-ink-400">
                      {client.accountName ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums text-red-300">
                      {somShort(client.debtMonthly)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-400">
                      {somShort(client.debtTotal)}
                    </td>
                    <td className="px-6 py-2.5 text-right text-xs text-ink-500">
                      {client.daysOverdue > 0 ? `${client.daysOverdue} kun` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Tanlagich ro'yxat bitta sahifaga sig'ganda ham kerak: operator
            uni oshirib, ko'proq mijozni birdan ko'rmoqchi bo'lishi mumkin. */}
        {total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-800 px-6 py-2.5 text-xs text-ink-500">
            <div className="flex items-center gap-2">
              <span>
                {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} / {total}
              </span>
              <label className="flex items-center gap-1.5">
                <span className="text-ink-600">·</span>
                <select
                  className="rounded-md border border-ink-700 bg-ink-900 px-1.5 py-0.5 text-xs text-ink-300 max-md:min-h-[40px]"
                  value={pageSize}
                  onChange={(e) => {
                    // Sahifa hajmi o'zgarganda boshiga qaytamiz — aks holda
                    // hozirgi surilish yangi hajmda umuman mavjud bo'lmagan
                    // sahifaga tushib, ro'yxat bo'sh chiqardi.
                    setPageSize(Number(e.target.value));
                    setPage(0);
                  }}
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n} ta
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {total > pageSize ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-ghost !py-1"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Oldingi
                </button>
                <button
                  type="button"
                  className="btn-ghost !py-1"
                  disabled={(page + 1) * pageSize >= total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Keyingi
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        </>)}
      </div>

      {/* Kompyuterda ustun jadval bilan yonma-yon turadi — operator
          jadvalni aylantirib, boshqa mijozni bosishi kerak, shuning
          uchun bu modal EMAS, docklangan panel. */}
      {!isMobile && selected ? (
        <aside className="flex w-96 shrink-0 flex-col overflow-y-auto border-l border-ink-800">
          <div className="flex items-center justify-between border-b border-ink-800 px-4 py-3">
            <p className="text-sm font-medium">Mijoz kartasi</p>
            <button
              type="button"
              className="text-ink-500 hover:text-ink-200"
              onClick={() => setSelected(null)}
            >
              ✕
            </button>
          </div>
          <ClientDetailBody
            detailQuery={detailQuery}
            navigate={navigate}
            writable={writable}
            canLookup={canLookup}
            canDelete={canDelete}
            canEdit={canEdit}
            lookup={lookup}
            startConversation={startConversation}
            mismatchOverride={mismatchOverride}
            setMismatchOverride={setMismatchOverride}
            onClosed={() => setSelected(null)}
          />
        </aside>
      ) : null}

      {isMobile ? (
        <Sheet
          open={Boolean(selected)}
          onClose={() => setSelected(null)}
          title={detailQuery.data?.client?.fullName ?? 'Mijoz'}
          variant="right"
        >
          <ClientDetailBody
            detailQuery={detailQuery}
            navigate={navigate}
            writable={writable}
            canLookup={canLookup}
            canDelete={canDelete}
            canEdit={canEdit}
            lookup={lookup}
            startConversation={startConversation}
            mismatchOverride={mismatchOverride}
            setMismatchOverride={setMismatchOverride}
            onClosed={() => setSelected(null)}
          />
        </Sheet>
      ) : null}

      {startDialog ? (
        <StartConversationsDialog
          clientIds={[...checked]}
          pending={startConversations.isPending}
          error={startConversations.error}
          onClose={() => setStartDialog(false)}
          onConfirm={(allowNameMismatch, accountIds, perAccount, spreadUntil) =>
            startConversations.mutate({ allowNameMismatch, accountIds, perAccount, spreadUntil })
          }
        />
      ) : null}

      {lookupDialog ? (
        <LookupAccountsDialog
          clientIds={[...checked]}
          pending={startBulk.isPending}
          error={startBulk.error}
          onClose={() => setLookupDialog(false)}
          onConfirm={(accountIds) => startBulk.mutate(accountIds)}
        />
      ) : null}

      {addOpen ? (
        <AddClientDialog
          onClose={() => setAddOpen(false)}
          onCreated={(clientId) => {
            setAddOpen(false);
            void queryClient.invalidateQueries({ queryKey: ['clients'] });
            void queryClient.invalidateQueries({ queryKey: ['client-tab-counts'] });
            // `/clients/:id` marshruti yo'q — karta yon panelda ochiladi.
            setSelected(clientId);
          }}
        />
      ) : null}
    </div>
  );
}
