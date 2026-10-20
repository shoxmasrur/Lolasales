import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCan } from '@/store/auth';
import { ErrorNote, Spinner } from '@/components/ui';

interface BotHolati {
  tokenBor: boolean;
  botUsername: string | null;
  chatId: string | null;
  chatNomi: string | null;
  yangilangan: string | null;
}

interface UlashKodi {
  kod: string;
  amalQiladi: string;
}

/** Sinov xabari natijasi shuncha vaqt ko'rinib turadi, keyin o'zi tozalanadi. */
const SINOV_KORINISH_MS = 10_000;

/**
 * Kunlik xulosa boti.
 *
 * Token EKRANDA hech qachon ko'rinmaydi — server uni qaytarmaydi ham.
 * Shu sababli maydon har saqlashdan keyin bo'shatiladi: ekranda qolgan
 * token yelka ortidan ko'rinib turadi.
 *
 * Ulash ikki qadamda: avval bir martalik kod olinadi va botga qo'lda
 * yuboriladi, keyin «Ulash» bosiladi. "Botga oxirgi yozgan odam" qoidasi
 * yetarli emas edi — bot username'i ochiq, istalgan begona odam botga
 * yozib nomzod bo'lib qolishi mumkin edi, kunlik xulosa esa mijoz
 * ismlarini olib boradi.
 */
export function XulosaBotiPanel() {
  const canView = useCan('settings.view');
  const canEdit = useCan('settings.edit');
  const [token, setToken] = useState('');
  const [hozir, setHozir] = useState(Date.now());
  const queryClient = useQueryClient();

  const holat = useQuery({
    queryKey: ['digest-bot'],
    queryFn: () => api.get<BotHolati>('/settings/digest-bot'),
    enabled: canView,
  });

  const yangila = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['digest-bot'] });
  };

  const saqla = useMutation({
    mutationFn: () => api.put<BotHolati>('/settings/digest-bot', { token: token.trim() }),
    onSuccess: () => {
      setToken('');
      yangila();
    },
  });

  const kodOl = useMutation({
    mutationFn: () => api.post<UlashKodi>('/settings/digest-bot/code'),
  });

  // Kod amal qilish muddati tugaganda tugmalar o'zi o'chsin — buning uchun
  // "hozir" vaqtini kod turgan paytda soniyada bir yangilab turamiz.
  useEffect(() => {
    if (!kodOl.data) return undefined;
    const t = setInterval(() => setHozir(Date.now()), 1000);
    return () => clearInterval(t);
  }, [kodOl.data]);

  const kodAmalda = Boolean(kodOl.data) && new Date(kodOl.data!.amalQiladi).getTime() > hozir;

  const ula = useMutation({
    mutationFn: () => api.post<BotHolati>('/settings/digest-bot/link'),
    onSuccess: () => {
      kodOl.reset();
      yangila();
    },
  });

  const sinov = useMutation({
    mutationFn: () => api.post<{ yuborildi: boolean }>('/settings/digest-bot/test'),
  });

  // Sinov "yuborildi" yozuvi qotib qolmasin: 10 soniyadan keyin o'zi ketadi.
  useEffect(() => {
    if (!sinov.isSuccess) return undefined;
    const t = setTimeout(() => sinov.reset(), SINOV_KORINISH_MS);
    return () => clearTimeout(t);
  }, [sinov.isSuccess, sinov]);

  const ochir = useMutation({
    mutationFn: () => api.delete<BotHolati>('/settings/digest-bot'),
    onSuccess: yangila,
  });

  if (!canView) return null;
  if (holat.isLoading) return <Spinner />;

  const d = holat.data;

  return (
    <div>
      <h2 className="mb-1 text-sm font-medium text-ink-200">Kunlik xulosa boti</h2>
      <p className="mb-3 text-xs text-ink-500">
        Kun oxiridagi xulosa shu bot orqali Telegramga keladi. Mijozlarga yozadigan
        akkauntlarga aloqasi yo'q.
      </p>

      <dl className="mb-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-ink-500">Token</dt>
        <dd className={d?.tokenBor ? 'text-emerald-400' : 'text-amber-400'}>
          {d?.tokenBor ? 'saqlangan' : 'kiritilmagan'}
        </dd>

        <dt className="text-ink-500">Bot</dt>
        <dd className="text-ink-300">{d?.botUsername ? `@${d.botUsername}` : '—'}</dd>

        <dt className="text-ink-500">Qabul qiluvchi</dt>
        <dd className={d?.chatId ? 'text-ink-300' : 'text-amber-400'}>
          {d?.chatId ? `${d.chatNomi ?? 'chat'} (${d.chatId})` : 'ulanmagan'}
        </dd>
      </dl>

      {canEdit ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="password"
              className="input !py-1 w-full text-xs md:w-80"
              placeholder="BotFather bergan token"
              value={token}
              autoComplete="off"
              onChange={(e) => setToken(e.target.value)}
            />
            <button
              type="button"
              className="btn-ghost text-xs"
              disabled={!token.trim() || saqla.isPending}
              onClick={() => saqla.mutate()}
            >
              {saqla.isPending ? <Spinner /> : null}
              Saqlash
            </button>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-ghost text-xs"
              disabled={!d?.tokenBor || kodOl.isPending}
              onClick={() => kodOl.mutate()}
              title="Botga yuboriladigan bir martalik kod"
            >
              {kodOl.isPending ? <Spinner /> : null}
              Ulash kodini olish
            </button>
            <button
              type="button"
              className="btn-ghost text-xs"
              disabled={!kodAmalda || ula.isPending}
              onClick={() => ula.mutate()}
              title="Kodni botga yuborganingizdan keyin bosing"
            >
              {ula.isPending ? <Spinner /> : null}
              Ulash
            </button>
            <button
              type="button"
              className="btn-ghost text-xs"
              disabled={!d?.chatId || sinov.isPending}
              onClick={() => sinov.mutate()}
            >
              {sinov.isPending ? <Spinner /> : null}
              Sinov xabarini yuborish
            </button>
            <button
              type="button"
              className="btn-ghost text-xs text-red-300"
              disabled={!d?.tokenBor || ochir.isPending}
              onClick={() => {
                if (window.confirm("Bot tokeni va ulangan chat o'chirilsinmi?")) {
                  ochir.mutate();
                }
              }}
            >
              O'chirish
            </button>
          </div>

          {kodAmalda ? (
            <p className="mt-2 text-[11px] text-amber-400">
              Botga shu kodni yuboring, keyin «Ulash» tugmasini bosing:{' '}
              <span className="text-lg font-semibold tracking-widest text-ink-100">
                {kodOl.data!.kod}
              </span>
            </p>
          ) : null}
          {d?.tokenBor && !d?.chatId && !kodAmalda ? (
            <p className="mt-2 text-[11px] text-amber-400">
              Ulash uchun «Ulash kodini olish» tugmasini bosing.
            </p>
          ) : null}
          {sinov.isSuccess ? (
            <p className="mt-2 text-[11px] text-emerald-400">Sinov xabari yuborildi.</p>
          ) : null}
        </>
      ) : null}

      {holat.error ? <ErrorNote error={holat.error} /> : null}
      {saqla.error ? <ErrorNote error={saqla.error} /> : null}
      {kodOl.error ? <ErrorNote error={kodOl.error} /> : null}
      {ula.error ? <ErrorNote error={ula.error} /> : null}
      {sinov.error ? <ErrorNote error={sinov.error} /> : null}
      {ochir.error ? <ErrorNote error={ochir.error} /> : null}
    </div>
  );
}
