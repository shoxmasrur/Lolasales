import { useState } from 'react';
import { useCan } from '@/store/auth';
import type { NavigateFunction } from 'react-router-dom';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Client, ClientProfile, Conversation, Course, Purchase, XaridBosqichi } from '@/lib/types';
import { BOSQICH_CLASS, BOSQICH_YORLIGI, MANBA_YORLIGI, XARID_BOSQICHLARI } from '@/lib/xarid';
import { dateUz, initials, som, TELEGRAM_STATUS_LABEL } from '@/lib/format';
import { Avatar, ErrorNote, Spinner } from '@/components/ui';
import { ClientPhonesCard } from '@/components/ClientPhonesCard';

/*
 * Mijoz kartasi — «Mijozlar» sahifasidan ajratilgan komponent.
 */

export interface ClientDetail {
  client: Client;
  /** Joriy xarid (faol, bo'lmasa oxirgi) — yo'q bo'lsa `null`. */
  purchase?: Purchase | null;
  conversation: Conversation | null;
  /**
   * "Bu raqam mijozniki emas" deb uzilgan raqamlar.
   *
   * Kartada ko'rsatiladi: operator xato uzganini qaytara olishi kerak,
   * aks holda raqam izsiz yo'qolardi.
   */
  blockedPhones: string[];
}

const CLIENT_TYPE_LABEL: Record<string, string> = {
  tez_qaror: 'Tez qaror qiladi',
  oylaydigan: 'O\'ylaydigan',
  narxga_sezgir: 'Narxga sezgir',
  shubhali: 'Shubhali',
};

/**
 * Mijozni o'chirish va qaytarish.
 *
 * O'chirish YUMSHOQ: bazadan hech narsa yo'qolmaydi, xaridlari va
 * yozishmalari joyida qoladi — mijoz shunchaki ro'yxatlardan chiqadi.
 * Shuning uchun tugma "xavfli" ko'rinishda, lekin qo'rqinchli emas.
 * Sabab ixtiyoriy va amallar jurnaliga tushadi.
 */
function ClientDangerZone({ client, onDeleted }: { client: Client; onDeleted: () => void }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['clients'] });
    void queryClient.invalidateQueries({ queryKey: ['client-tab-counts'] });
    void queryClient.invalidateQueries({ queryKey: ['client', client.id] });
    void queryClient.invalidateQueries({ queryKey: ['stats'] });
  };

  const remove = useMutation({
    mutationFn: () =>
      api.delete(`/clients/${client.id}`, { reason: reason.trim() || undefined }),
    onSuccess: () => {
      setConfirming(false);
      setReason('');
      refresh();
      onDeleted();
    },
  });

  const restore = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/restore`),
    onSuccess: refresh,
  });

  if (client.deletedAt) {
    return (
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
        <p className="text-xs text-amber-200">
          Bu mijoz {dateUz(client.deletedAt)} kuni o'chirilgan
          {client.deletedBy ? ` (${client.deletedBy})` : ''}.
        </p>
        <p className="mt-1 text-[11px] text-amber-300/70">
          Xaridlari va yozishmalari bazada saqlanib turibdi.
        </p>
        <button
          type="button"
          className="btn-ghost mt-2 w-full !py-1.5 text-xs"
          disabled={restore.isPending}
          onClick={() => restore.mutate()}
        >
          {restore.isPending ? <Spinner /> : null}
          Qaytarish
        </button>
        {restore.error ? (
          <div className="mt-1.5">
            <ErrorNote error={restore.error} />
          </div>
        ) : null}
      </div>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        className="btn-ghost w-full !py-1.5 text-xs text-red-300 hover:bg-red-500/10"
        onClick={() => setConfirming(true)}
      >
        Mijozni o'chirish
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
      <p className="text-xs text-ink-300">
        <span className="font-medium">{client.fullName}</span> ro'yxatlardan olib
        tashlanadi. Ma'lumot bazada qoladi — "O'chirilgan" tabidan qaytarish mumkin.
      </p>
      <input
        className="input mt-2 !py-1 text-xs"
        placeholder="Sabab (ixtiyoriy) — jurnalga yoziladi"
        value={reason}
        maxLength={500}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="btn-ghost flex-1 !py-1 text-xs text-red-300 hover:bg-red-500/10"
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
        >
          {remove.isPending ? <Spinner /> : null}
          Ha, o'chirilsin
        </button>
        <button
          type="button"
          className="btn-ghost flex-1 !py-1 text-xs"
          onClick={() => setConfirming(false)}
        >
          Bekor
        </button>
      </div>
      {remove.error ? (
        <div className="mt-1.5">
          <ErrorNote error={remove.error} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Telegram profili va uning mijoz ismiga mosligi.
 *
 * Raqamlar qo'ldan qo'lga o'tadi, shuning uchun xodim xabar yuborishdan oldin
 * "Telegramda kim o'tiribdi?" degan savolga javob topishi kerak. Shuning uchun
 * ikkala ism YONMA-YON ko'rsatiladi.
 */
function TelegramIdentityCard({ client, canConfirm }: { client: Client; canConfirm: boolean }) {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const status = client.telegramStatus;

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['client', client.id] });
    void queryClient.invalidateQueries({ queryKey: ['clients'] });
    // Holat o'zgardi — tab sonlari ham boshqacha bo'ldi.
    void queryClient.invalidateQueries({ queryKey: ['client-tab-counts'] });
  };

  const confirm = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/telegram-confirm`),
    onSuccess: refresh,
  });

  const setByUsername = useMutation({
    mutationFn: () => api.post(`/clients/${client.id}/telegram-username`, { username }),
    onSuccess: () => {
      setUsername('');
      refresh();
    },
  });

  // Hali qidirilmagan bo'lsa ko'rsatadigan narsa yo'q.
  if (status === 'unknown') return null;

  const mismatch = status === 'name_mismatch';
  const found = status === 'found';

  return (
    <div
      className={`card !p-3 ${
        mismatch ? 'border-amber-500/40 bg-amber-500/5' : found ? '' : 'border-amber-500/30'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wider text-ink-500">Telegram profili</p>
        <span
          className={
            found
              ? 'chip bg-emerald-500/15 text-emerald-300'
              : mismatch
                ? 'chip bg-amber-500/20 text-amber-200'
                : 'chip bg-amber-500/15 text-amber-300'
          }
        >
          {mismatch ? '⚠ ' : ''}
          {TELEGRAM_STATUS_LABEL[status] ?? status}
        </span>
      </div>

      {/* Ism mos kelmasa HAM ko'rsatiladi — xodim o'zi baholay olishi kerak. */}
      {client.telegramName || client.telegramUsername || client.telegramUserId ? (
        <div className="mt-2 space-y-1 text-xs">
          <div className="flex gap-2">
            <span className="w-20 shrink-0 text-ink-600">Bazada</span>
            <span className="min-w-0 flex-1 break-words text-ink-200">{client.fullName}</span>
          </div>
          <div className="flex gap-2">
            <span className="w-20 shrink-0 text-ink-600">Telegramda</span>
            <span
              className={`min-w-0 flex-1 break-words font-medium ${
                mismatch ? 'text-amber-300' : 'text-ink-200'
              }`}
            >
              {client.telegramName || '(ism qo\'yilmagan)'}
            </span>
          </div>
          {client.telegramUsername ? (
            <div className="flex gap-2">
              <span className="w-20 shrink-0 text-ink-600">Username</span>
              <span className="min-w-0 flex-1 truncate text-ink-400">
                @{client.telegramUsername}
              </span>
            </div>
          ) : null}
          <div className="flex gap-2">
            <span className="w-20 shrink-0 text-ink-600">Raqam</span>
            <span className="min-w-0 flex-1 truncate font-mono text-ink-400">
              {client.phone ?? '—'}
            </span>
          </div>
        </div>
      ) : null}

      {mismatch ? (
        <>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
            Ismlar mos kelmadi, shuning uchun xabar yuborilmadi. Lekin odamlar
            Telegramda ismini o'zgacha qo'yishi ham mumkin — profilni ko'rib,
            haqiqatan shu mijoz bo'lsa tasdiqlang.
          </p>

          {canConfirm && client.telegramUserId ? (
            <div className="mt-2 space-y-2">
              <button
                type="button"
                className="btn-primary w-full !py-1.5 text-xs"
                disabled={confirm.isPending}
                onClick={() => confirm.mutate()}
              >
                {confirm.isPending ? <Spinner /> : null}
                Ha, shu mijoz — tasdiqlash
              </button>
              {confirm.error ? <ErrorNote error={confirm.error} /> : null}
            </div>
          ) : canConfirm ? (
            // Eski kod bilan aniqlangan mijozlarda profil saqlanmagan —
            // tasdiqlash uchun avval qaytadan qidirish kerak.
            <p className="mt-2 text-[11px] text-amber-300/80">
              Tasdiqlash uchun avval "Telegramdan qidirish" tugmasini bosing —
              profil saqlanmagan.
            </p>
          ) : null}
        </>
      ) : null}

      {/* Mijoz bergan raqamdan boshqa raqamda o'tirgan bo'lishi mumkin —
          o'shanda username orqali bog'lanamiz. */}
      {canConfirm && !found ? (
        <div className="mt-3 border-t border-ink-800 pt-3">
          <p className="text-[11px] text-ink-500">
            Mijoz boshqa raqamda o'tirgan bo'lsa, Telegram username'ini kiriting
          </p>
          <div className="mt-1.5 flex gap-1.5">
            <input
              className="input flex-1 !py-1 text-xs"
              placeholder="@username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && username.trim()) setByUsername.mutate();
              }}
            />
            <button
              type="button"
              className="btn-ghost !py-1 text-xs"
              disabled={!username.trim() || setByUsername.isPending}
              onClick={() => setByUsername.mutate()}
            >
              {setByUsername.isPending ? <Spinner /> : null}
              Biriktirish
            </button>
          </div>
          {setByUsername.error ? (
            <div className="mt-1.5">
              <ErrorNote error={setByUsername.error} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ClientMemoryCard({ clientId, canEdit }: { clientId: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ summary: '', whatWorks: '', clientType: '' });

  const profileQuery = useQuery({
    queryKey: ['client-profile', clientId],
    queryFn: () => api.get<{ profile: ClientProfile | null }>(`/agent/client-profile/${clientId}`),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch(`/agent/client-profile/${clientId}`, {
        summary: draft.summary || null,
        whatWorks: draft.whatWorks || null,
        clientType: draft.clientType || null,
      }),
    onSuccess: () => {
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ['client-profile', clientId] });
    },
  });

  const profile = profileQuery.data?.profile;
  const isEmpty = !profile?.summary && !profile?.whatWorks && !profile?.clientType;

  return (
    <div className="card">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wide text-ink-500">Agent xotirasi</p>
        {canEdit && !editing ? (
          <button
            type="button"
            className="text-[11px] text-brand-400 hover:underline"
            onClick={() => {
              setEditing(true);
              setDraft({
                summary: profile?.summary ?? '',
                whatWorks: profile?.whatWorks ?? '',
                clientType: profile?.clientType ?? '',
              });
            }}
          >
            tahrir
          </button>
        ) : null}
      </div>

      {editing ? (
        <div className="space-y-2">
          <select
            className="input !py-1 text-xs max-md:min-h-[40px]"
            value={draft.clientType}
            onChange={(e) => setDraft((d) => ({ ...d, clientType: e.target.value }))}
          >
            <option value="">— tip tanlanmagan —</option>
            {Object.entries(CLIENT_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <textarea
            className="input text-xs"
            rows={2}
            placeholder="Mijoz haqida qisqa xulosa"
            value={draft.summary}
            onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
          />
          <textarea
            className="input text-xs"
            rows={2}
            placeholder="Qaysi yondashuv ishlagan"
            value={draft.whatWorks}
            onChange={(e) => setDraft((d) => ({ ...d, whatWorks: e.target.value }))}
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary !py-1 text-xs"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              Saqlash
            </button>
            <button type="button" className="btn-ghost !py-1 text-xs" onClick={() => setEditing(false)}>
              Bekor
            </button>
          </div>
        </div>
      ) : isEmpty ? (
        <p className="text-[11px] text-ink-600">
          Hali bo'sh — agent suhbatlar davomida o'zi to'ldiradi.
        </p>
      ) : (
        <div className="space-y-1.5 text-xs">
          {profile?.clientType ? (
            <span className="chip bg-violet-500/15 text-violet-300">
              {CLIENT_TYPE_LABEL[profile.clientType] ?? profile.clientType}
            </span>
          ) : null}
          {profile?.summary ? <p className="text-ink-300">{profile.summary}</p> : null}
          {profile?.whatWorks ? (
            <p className="text-[11px] text-emerald-300/90">Ishlagan: {profile.whatWorks}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

export interface ClientDetailBodyProps {
  detailQuery: UseQueryResult<ClientDetail, Error>;
  navigate: NavigateFunction;
  writable: boolean;
  canLookup: boolean;
  canDelete: boolean;
  canEdit: boolean;
  /*
   * Qidiruv/suhbat amallari ixtiyoriy: karta ba'zan
   * faqat ko'rish uchun chizadi (`writable=false`) va ularni bermaydi.
   * Berilmasa amallar bloki chizilmaydi.
   */
  lookup?: UseMutationResult<{ outcome: string }, Error, string>;
  startConversation?: UseMutationResult<
    { status: string; reason?: string; conversation?: Conversation },
    Error,
    { id: string; allowNameMismatch?: boolean }
  >;
  mismatchOverride?: boolean;
  setMismatchOverride?: (value: boolean) => void;
  onClosed: () => void;
}

/**
 * Xarid kartasi: bosqich (menejer qo'lda o'zgartira oladi), manba, kurs,
 * to'langan summa va guruh izohi. Suhbatlar sahifasidagi mijoz paneli ham
 * shu kartani ko'rsatadi.
 */
export function PurchaseStageCard({ client, purchase, canEdit }: { client: Client; purchase: Purchase | null; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const canSeeCourses = useCan('courses.view');
  const coursesQuery = useQuery({
    queryKey: ['courses'],
    queryFn: () => api.get<{ items: Course[] }>('/courses'),
    enabled: canSeeCourses && Boolean(purchase?.courseId),
  });
  const kurs = purchase?.courseId
    ? (coursesQuery.data?.items.find((c) => c.id === purchase.courseId)?.name ?? null)
    : null;
  const change = useMutation({
    mutationFn: (stage: XaridBosqichi) => api.patch(`/clients/${client.id}/stage`, { stage }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
      void queryClient.invalidateQueries({ queryKey: ['client', client.id] });
      // Suhbatlar sahifasidagi mijoz paneli shu kartani `['conversation', id]` dan chizadi.
      void queryClient.invalidateQueries({ queryKey: ['conversation'] });
    },
  });
  const stage: XaridBosqichi = purchase?.stage ?? 'yangi';
  return (
    <div className="card !p-3">
      <p className="text-[10px] uppercase text-ink-500">Xarid bosqichi</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className={BOSQICH_CLASS[stage]}>{BOSQICH_YORLIGI[stage]}</span>
        <span className="text-[11px] text-ink-500">Manba: {MANBA_YORLIGI[client.source] ?? '—'}</span>
      </div>
      <p className="mt-1 text-[11px] text-ink-500">Kurs: {kurs ?? (purchase?.courseId ? '…' : 'tanlanmagan')}</p>
      {purchase && purchase.totalAmount ? (
        <p className="mt-1 text-[11px] text-ink-500">
          To'langan: {som(purchase.paidAmount)} / {som(purchase.totalAmount)}
          {purchase.installment ? ' · bo\'lib to\'lash' : ''}
        </p>
      ) : null}
      {client.sourceGroup || client.sourceComment ? (
        <div className="mt-2 rounded-md border border-ink-800 bg-ink-950/50 p-2 text-[11px]">
          {client.sourceGroup ? <p className="text-ink-500">{client.sourceGroup}</p> : null}
          {client.sourceComment ? (
            <p className="mt-0.5 italic text-ink-300">“{client.sourceComment}”</p>
          ) : null}
        </div>
      ) : null}
      {canEdit && !client.deletedAt ? (
        <select
          className="input mt-2 w-full"
          value={stage}
          disabled={change.isPending}
          onChange={(e) => change.mutate(e.target.value as XaridBosqichi)}
        >
          {XARID_BOSQICHLARI.map((b) => (
            <option key={b} value={b}>{BOSQICH_YORLIGI[b]}</option>
          ))}
        </select>
      ) : null}
      {change.error ? <ErrorNote error={change.error} /> : null}
    </div>
  );
}

/**
 * Mijoz kartasining mazmuni — kompyuterda yonma-yon `<aside>` panelida
 * ham, telefonda `Sheet` ichida ham aynan shu bitta komponent chiziladi
 * (shuningdek faqat ko'rish rejimida).
 */
export function ClientDetailBody({
  detailQuery,
  navigate,
  writable,
  canLookup,
  canDelete,
  canEdit,
  lookup,
  startConversation,
  mismatchOverride = false,
  setMismatchOverride,
  onClosed,
}: ClientDetailBodyProps) {
  return detailQuery.isLoading || !detailQuery.data ? (
    <div className="flex justify-center py-10">
      <Spinner />
    </div>
  ) : (
    <div className="space-y-4 p-4">
      <div className="flex flex-col items-center text-center">
        <Avatar text={initials(detailQuery.data.client.fullName)} size={56} />
        <p className="mt-2 font-medium">{detailQuery.data.client.fullName}</p>
        <p className="text-xs text-ink-500">{detailQuery.data.client.phone ?? 'raqam yo\'q'}</p>
      </div>

      {/* Raqamlarni tahrirlash: qo'shish va "bu raqam mijozniki emas".
          Ilgari raqam faqat matn bo'lib turardi va operator begona
          raqamni uza olmasdi. */}
      <ClientPhonesCard
        clientId={detailQuery.data.client.id}
        phone={detailQuery.data.client.phone}
        extraPhones={detailQuery.data.client.extraPhones}
        blockedPhones={detailQuery.data.blockedPhones ?? []}
        writable={writable && !detailQuery.data.client.deletedAt}
      />

      {/* Telegram profili: xodim shu yerda "bu haqiqatan bizning
          mijozimizmi?" degan savolga javob topadi. */}
      <TelegramIdentityCard client={detailQuery.data.client} canConfirm={canLookup} />

      <PurchaseStageCard
        client={detailQuery.data.client}
        purchase={detailQuery.data.purchase ?? null}
        canEdit={canEdit}
      />

      {/* O'chirilgan mijozga qidiruv/suhbat amallari ko'rsatilmaydi —
          avval qaytarish kerak. */}
      {writable && lookup && startConversation && setMismatchOverride && !detailQuery.data.client.deletedAt ? (
        <div className="space-y-2">
          {lookup.error ? <ErrorNote error={lookup.error} /> : null}
          {startConversation.error ? <ErrorNote error={startConversation.error} /> : null}

          {detailQuery.data.client.telegramStatus !== 'found' ? (
            <button
              type="button"
              className="btn-ghost w-full"
              disabled={lookup.isPending || !detailQuery.data.client.phone}
              onClick={() => lookup.mutate(detailQuery.data.client.id)}
            >
              {lookup.isPending ? <Spinner /> : null}
              Telegramdan qidirish
            </button>
          ) : null}

          {/* `new` holat — suhbat yozuvi bor, lekin birinchi xabar
              ketmagan (masalan server uzilgan). Qayta urinish kerak. */}
          {detailQuery.data.conversation &&
          detailQuery.data.conversation.state !== 'new' ? (
            <button
              type="button"
              className="btn-primary w-full"
              onClick={() => navigate(`/chat/${detailQuery.data.conversation!.id}`)}
            >
              Suhbatni ochish
            </button>
          ) : (
            <>
              {/* Ism mos kelmagan mijoz. Yonidagi "Telegram profili"
                  kartasida "Ha, shu mijoz — tasdiqlash" tugmasi bor,
                  lekin u mijozning holatini BUTUNLAY o'zgartiradi
                  ("bu aynan o'sha odam" degani). Bu belgi esa faqat
                  shu bitta yuborishga ruxsat beradi: operator
                  "ishonchim komil emas, lekin baribir yozaman"
                  deganda. Har biri jurnalga tushadi. */}
              {detailQuery.data.client.telegramStatus === 'name_mismatch' ? (
                <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-[11px] leading-tight text-ink-300">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-amber-400"
                    checked={mismatchOverride}
                    disabled={startConversation.isPending}
                    onChange={(e) => setMismatchOverride(e.target.checked)}
                  />
                  <span>
                    Ism mos kelmasa ham yuborilsin — javobgarlikni o'z zimmamga
                    olaman.
                    <span className="block text-ink-500">
                      Raqam boshqa odamga o'tgan bo'lsa, xabar begona odamga
                      ketadi. Har bir bunday yuborish amallar jurnaliga
                      yoziladi.
                    </span>
                  </span>
                </label>
              ) : null}

              <button
                type="button"
                className="btn-primary w-full"
                disabled={startConversation.isPending}
                onClick={() =>
                  startConversation.mutate({
                    id: detailQuery.data.client.id,
                    allowNameMismatch: mismatchOverride,
                  })
                }
              >
                {startConversation.isPending ? <Spinner /> : null}
                {detailQuery.data.conversation ? 'Qayta urinish' : 'Suhbatni boshlash'}
              </button>
              {detailQuery.data.conversation ? (
                <p className="text-[11px] text-amber-400">
                  Suhbat ochilgan, lekin birinchi xabar yuborilmagan.
                </p>
              ) : null}
            </>
          )}

          {startConversation.data?.status === 'skipped' ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              O'tkazib yuborildi: {startConversation.data.reason}
            </p>
          ) : null}
        </div>
      ) : null}

      <ClientMemoryCard clientId={detailQuery.data.client.id} canEdit={canEdit} />

      {canDelete ? (
        <div className="border-t border-ink-800 pt-4">
          <ClientDangerZone
            client={detailQuery.data.client}
            onDeleted={onClosed}
          />
        </div>
      ) : null}
    </div>
  );
}