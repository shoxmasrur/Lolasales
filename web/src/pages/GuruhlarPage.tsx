import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { api } from '@/lib/api';
import type {
  ChannelCommentItem,
  ChannelPost,
  CommentChannel,
  CommentsFetchResult,
  TelegramAccount,
} from '@/lib/types';
import { EmptyState, ErrorNote, Spinner } from '@/components/ui';
import { useCan } from '@/store/auth';

const KUNLAR = [1, 3, 7, 14, 30];

const kalit = (c: ChannelCommentItem): string => `${c.postId}:${c.id}`;

function sana(iso: string): string {
  return new Date(iso).toLocaleString('uz-UZ', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function qisqa(text: string, n = 80): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t || '(matnsiz)';
}

interface LeadNatija {
  created: number;
  existing: number;
  campaignId: string | null;
  /** Yangi mijozlar bor, lekin foydalanuvchida `campaigns.create` yo'q. */
  campaignSkipped?: boolean;
}

/**
 * Kanal izohlaridan mijoz olish.
 *
 * Faqat O'QIYDI: kanalda ham, muhokama guruhida ham hech narsa yozilmaydi.
 * Tanlangan odamlarga birinchi xabar shaxsiy chatda, kampaniya orqali ketadi.
 */
export default function GuruhlarPage() {
  const canImport = useCan('comments.import');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [channel, setChannel] = useState<CommentChannel | null>(null);
  const [kun, setKun] = useState(7);
  const [postlar, setPostlar] = useState<Set<number>>(new Set());
  const [filtrsiz, setFiltrsiz] = useState(false);
  const [natija, setNatija] = useState<CommentsFetchResult | null>(null);
  const [tanlangan, setTanlangan] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<LeadNatija | null>(null);

  const accountsQuery = useQuery({
    queryKey: ['telegram-accounts'],
    queryFn: () => api.get<{ items: TelegramAccount[] }>('/telegram/accounts'),
  });
  const accounts = useMemo(
    () => (accountsQuery.data?.items ?? []).filter((a) => a.connected),
    [accountsQuery.data],
  );
  useEffect(() => {
    if (!accountId && accounts.length) setAccountId(accounts[0]!.id);
  }, [accounts, accountId]);

  const channelsQuery = useQuery({
    queryKey: ['comment-channels', accountId],
    queryFn: () => api.get<{ items: CommentChannel[] }>('/comments/channels', { accountId }),
    enabled: Boolean(accountId),
    staleTime: 5 * 60_000,
  });

  const postsQuery = useQuery({
    queryKey: ['comment-posts', accountId, channel?.peer.peerId, kun],
    queryFn: () =>
      api.get<{ items: ChannelPost[] }>('/comments/posts', {
        accountId, channelId: channel!.peer.peerId, sinceDays: kun,
      }),
    enabled: Boolean(accountId && channel),
  });

  const fetchMutation = useMutation({
    mutationFn: () =>
      api.post<CommentsFetchResult>('/comments/fetch', {
        accountId,
        channelId: channel!.peer.peerId,
        postIds: postlar.size ? [...postlar] : 'all',
        sinceDays: kun,
        filtrsiz,
      }),
    onSuccess: (data) => {
      setNatija(data);
      // Sukut: yozsa bo'ladigan va hali mijoz bo'lmaganlar belgilanadi.
      setTanlangan(new Set(data.items.filter((c) => c.tanlasaBoladi && !c.mavjudMijoz).map(kalit)));
    },
  });

  const leadMutation = useMutation({
    mutationFn: () => {
      const items = (natija?.items ?? [])
        .filter((c) => tanlangan.has(kalit(c)) && c.author.kind === 'user')
        .map((c) => {
          const a = c.author as Extract<ChannelCommentItem['author'], { kind: 'user' }>;
          return { peer: a.peer, fullName: a.fullName, text: c.text };
        });
      return api.post<LeadNatija>('/comments/to-leads', {
        accountId, channelTitle: channel!.title, items,
      });
    },
    onSuccess: (data) => {
      setToast(data);
      setNatija((n) =>
        n ? { ...n, items: n.items.map((c) => (tanlangan.has(kalit(c)) ? { ...c, mavjudMijoz: true } : c)) } : n,
      );
      setTanlangan(new Set());
    },
  });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 10_000);
    return () => clearTimeout(t);
  }, [toast]);

  const tanlash = (c: CommentChannel): void => {
    setChannel(c);
    setPostlar(new Set());
    setNatija(null);
    setTanlangan(new Set());
  };

  const posts = postsQuery.data?.items ?? [];
  const channels = channelsQuery.data?.items ?? [];
  const items = natija?.items ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-800 px-4 py-3">
        <div>
          <h1 className="text-base font-semibold">Guruhlar</h1>
          <p className="text-xs text-ink-500">
            Kanal izohlaridan mijoz olish. Kanal va guruhga hech narsa yozilmaydi.
          </p>
        </div>
        <select
          className="input !w-auto"
          value={accountId ?? ''}
          onChange={(e) => {
            setAccountId(e.target.value || null);
            setChannel(null);
            setNatija(null);
          }}
        >
          {accounts.length === 0 ? <option value="">Ulangan akkaunt yo'q</option> : null}
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
      </header>

      <div className="grid gap-4 p-4 lg:grid-cols-[18rem_1fr]">
        <section className="card !p-0">
          <h2 className="border-b border-ink-800 px-4 py-2 text-sm font-medium">Kanallar</h2>
          {!accountId ? (
            <EmptyState title="Akkaunt tanlanmagan" hint="Avval Telegram akkauntini ulang." />
          ) : channelsQuery.isLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : channelsQuery.error ? (
            <div className="p-3"><ErrorNote error={channelsQuery.error} /></div>
          ) : channels.length === 0 ? (
            <EmptyState title="Kanal yo'q" hint="Akkaunt izohlari yoqilgan kanalga a'zo emas." />
          ) : (
            <ul className="divide-y divide-ink-800/60">
              {channels.map((c) => (
                <li key={c.peer.peerId}>
                  <button
                    type="button"
                    onClick={() => tanlash(c)}
                    className={clsx(
                      'w-full px-4 py-2.5 text-left text-sm hover:bg-ink-900/60',
                      channel?.peer.peerId === c.peer.peerId && 'bg-ink-800/60',
                    )}
                  >
                    <p className="truncate font-medium text-ink-100">{c.title}</p>
                    {!c.memberOfLinked ? (
                      <p className="mt-0.5 text-[11px] leading-snug text-amber-400">
                        Akkaunt muhokama guruhiga a'zo emas — kommentlarni o'qish uchun guruhga qo'shiling
                      </p>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex min-w-0 flex-col gap-4">
          {!channel ? (
            <div className="card">
              <EmptyState title="Kanal tanlang" hint="Chapdagi ro'yxatdan kanalni tanlang." />
            </div>
          ) : (
            <div className="card space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-sm font-medium">{channel.title} — postlar</h2>
                <label className="flex items-center gap-2 text-xs text-ink-400">
                  Oxirgi
                  <select className="input !w-auto !py-1" value={kun} onChange={(e) => setKun(Number(e.target.value))}>
                    {KUNLAR.map((k) => <option key={k} value={k}>{k} kun</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs text-ink-400">
                  <input type="checkbox" checked={filtrsiz} onChange={(e) => setFiltrsiz(e.target.checked)} />
                  Kalit so'z filtrisiz
                </label>
              </div>

              {postsQuery.isLoading ? (
                <div className="flex justify-center py-6"><Spinner /></div>
              ) : postsQuery.error ? (
                <ErrorNote error={postsQuery.error} />
              ) : posts.length === 0 ? (
                <p className="text-xs text-ink-500">Bu davrda post yo'q.</p>
              ) : (
                <ul className="max-h-64 divide-y divide-ink-800/60 overflow-y-auto rounded border border-ink-800">
                  {posts.map((p) => (
                    <li key={p.id} className="flex items-start gap-3 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={postlar.has(p.id)}
                        onChange={(e) =>
                          setPostlar((s) => {
                            const n = new Set(s);
                            if (e.target.checked) n.add(p.id);
                            else n.delete(p.id);
                            return n;
                          })
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-ink-200">{qisqa(p.text, 120)}</p>
                        <p className="text-[11px] text-ink-500">
                          #{p.id} · {sana(p.date)} · {p.repliesCount} ta izoh
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={fetchMutation.isPending || !channel.memberOfLinked}
                  onClick={() => fetchMutation.mutate()}
                >
                  {fetchMutation.isPending ? <Spinner /> : null}
                  Kommentlarni olish
                </button>
                <span className="text-xs text-ink-500">
                  {postlar.size ? `${postlar.size} ta post tanlangan` : 'Post tanlanmasa — izohi bor barcha postlar'}
                </span>
              </div>
              {fetchMutation.error ? <ErrorNote error={fetchMutation.error} /> : null}
            </div>
          )}

          {natija ? (
            <div className="card !p-0">
              {natija.partial ? (
                <p className="border-b border-ink-800 px-4 py-2 text-xs text-amber-400">
                  Ro'yxat to'liq emas: {natija.partial.reason}. Birozdan keyin qayta urinib ko'ring.
                </p>
              ) : null}
              {items.length === 0 ? (
                <EmptyState title="Mos izoh topilmadi" hint="Kalit so'z filtrisiz qayta urinib ko'ring." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-ink-900/60 text-[11px] uppercase tracking-wide text-ink-500">
                      <tr>
                        <th className="w-9 px-3 py-2" />
                        <th className="px-3 py-2 text-left font-medium">Muallif</th>
                        <th className="px-3 py-2 text-left font-medium">Username</th>
                        <th className="px-3 py-2 text-left font-medium">Komment</th>
                        <th className="px-3 py-2 text-left font-medium">Post</th>
                        <th className="px-3 py-2 text-left font-medium">Sana</th>
                        <th className="px-3 py-2 text-left font-medium">Holat</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-800/60">
                      {items.map((c) => {
                        const k = kalit(c);
                        const user = c.author.kind === 'user' ? c.author : null;
                        return (
                          <tr key={k} className={clsx(!c.tanlasaBoladi && 'opacity-60')}>
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                disabled={!c.tanlasaBoladi || !canImport}
                                checked={tanlangan.has(k)}
                                onChange={(e) =>
                                  setTanlangan((s) => {
                                    const n = new Set(s);
                                    if (e.target.checked) n.add(k);
                                    else n.delete(k);
                                    return n;
                                  })
                                }
                              />
                            </td>
                            <td className="px-3 py-2">{user ? user.fullName : c.author.kind === 'anonim' ? c.author.title : ''}</td>
                            <td className="px-3 py-2 text-ink-400">{user?.peer.username ? `@${user.peer.username}` : '—'}</td>
                            <td className="max-w-xs px-3 py-2 text-ink-200" title={c.text}>{qisqa(c.text)}</td>
                            <td className="px-3 py-2 text-ink-400">#{c.postId}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-ink-400">{sana(c.date)}</td>
                            <td className="px-3 py-2">
                              {!c.tanlasaBoladi ? (
                                <span className="chip bg-ink-800 text-ink-400">Yozib bo'lmaydi</span>
                              ) : c.mavjudMijoz ? (
                                <span className="chip bg-sky-500/15 text-sky-300">Mijoz bor</span>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {canImport && items.length ? (
                <div className="flex flex-wrap items-center gap-3 border-t border-ink-800 px-4 py-3">
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={!tanlangan.size || leadMutation.isPending}
                    onClick={() => leadMutation.mutate()}
                  >
                    {leadMutation.isPending ? <Spinner /> : null}
                    Mijoz qilish ({tanlangan.size})
                  </button>
                  <span className="text-xs text-ink-500">
                    Yangi mijozlarga birinchi xabar kampaniya orqali, shaxsiy chatda ketadi.
                  </span>
                  {leadMutation.error ? <ErrorNote error={leadMutation.error} /> : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      {toast ? (
        <div className="fixed bottom-20 right-4 z-50 max-w-sm rounded-lg border border-emerald-500/30 bg-ink-900 px-4 py-3 text-sm shadow-lg md:bottom-6">
          <p className="text-ink-100">
            {toast.created} ta yangi mijoz, {toast.existing} tasi avvaldan bor edi.
          </p>
          {toast.campaignId ? (
            <Link to="/campaigns" className="mt-1 inline-block text-xs text-emerald-300 underline">
              Kampaniyani ochish
            </Link>
          ) : toast.campaignSkipped ? (
            <p className="mt-1 text-xs text-amber-300">
              Kampaniya yaratilmadi: kampaniya yaratish huquqingiz yo'q. Mijozlarga yozish uchun administratorga murojaat qiling.
            </p>
          ) : (
            <p className="mt-1 text-xs text-ink-500">Yangi mijoz yo'q — kampaniya yaratilmadi.</p>
          )}
          <button type="button" className="absolute right-2 top-1 text-ink-500" onClick={() => setToast(null)}>×</button>
        </div>
      ) : null}
    </div>
  );
}
