import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCan } from '@/store/auth';
import type { Client, Conversation, NomalumHolat, NomalumSuhbat } from '@/lib/types';
import { initials } from '@/lib/format';
import { Avatar, ErrorNote } from '@/components/ui';

const HOLAT_LABEL: Record<NomalumHolat, string> = {
  kutilmoqda: 'Kutilmoqda',
  hujjat_kutilmoqda: 'Hujjat kutilmoqda',
  tasdiq_kutilmoqda: 'Tasdiq kutilmoqda',
  operatorda: 'Operatorda',
  mijoz_emas: 'Mijoz emas',
  boglandi: "Bog'landi",
};

/** Agent shu sondan ortiq javob yozmaydi (serverdagi chegara bilan bir xil). */
const AGENT_LIMIT = 6;

interface Props {
  detail: {
    conversation: Conversation;
    client: Client;
    nomalum: NomalumSuhbat;
    topilganMijoz: { id: string; fullName: string } | null;
  };
}

/**
 * Noma'lum Telegram yozuvchi paneli: qarz va shartnoma kartalari o'rniga
 * bog'lash holati va operator amallari. Bog'lash ikki suhbatni birlashtirishi
 * mumkin, shuning uchun serverdan qaytgan suhbatga o'tiladi (id boshqa bo'lishi mumkin).
 */
export default function NomalumPanel({ detail }: Props) {
  const { conversation, client, nomalum, topilganMijoz } = detail;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canAct = useCan('conversations.agent_toggle');
  const [raqam, setRaqam] = useState('');
  const base = `/conversations/${conversation.id}/nomalum`;

  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['conversation'] });
    await queryClient.invalidateQueries({ queryKey: ['conversations'] });
  };

  // Birlashtirishdan keyin eski suhbat yo'qolishi mumkin — yangi id ga o'tamiz.
  const moveTo = useMutation({
    mutationFn: (req: { path: string; body?: unknown }) =>
      api.post<{ conversationId: string }>(`${base}/${req.path}`, req.body),
    onSuccess: async (res) => {
      await refresh();
      setRaqam('');
      navigate(`/chat/${res.conversationId}`);
    },
  });
  const stay = useMutation({
    mutationFn: (path: string) => api.post(`${base}/${path}`),
    onSuccess: refresh,
  });

  const busy = moveTo.isPending || stay.isPending;
  // Hujjat hali kelmagan bo'lsa ham operator tasdiqlay/rad eta oladi (server ham ruxsat beradi).
  const hujjatKutilmoqda = nomalum.holat === 'hujjat_kutilmoqda';
  const confirmPending = nomalum.holat === 'tasdiq_kutilmoqda' || hujjatKutilmoqda;
  const closed = nomalum.holat === 'boglandi';

  return (
    <>
      <div className="mb-4 flex flex-col items-center text-center">
        <Avatar text={initials(client.fullName || '?')} size={56} />
        <p className="mt-2 text-sm font-medium">{client.telegramName || client.fullName}</p>
        {client.telegramUsername ? (
          <p className="text-[11px] text-ink-500">@{client.telegramUsername}</p>
        ) : null}
        {nomalum.telegramTelefon ? (
          <p className="text-[11px] text-ink-500">{nomalum.telegramTelefon}</p>
        ) : null}
      </div>

      <div className="card mb-3">
        <p className="text-[11px] uppercase tracking-wide text-ink-500">Noma'lum mijoz</p>
        <p className="mt-1 text-sm font-medium text-amber-300">{HOLAT_LABEL[nomalum.holat]}</p>
        <p className="mt-1 text-[11px] text-ink-500">
          Agent javoblari: {nomalum.agentJavoblari}/{AGENT_LIMIT}
        </p>
        <p className="mt-0.5 text-[11px] text-ink-500">
          Yozilgan shartnoma raqami: {nomalum.shartnomaRaqami ?? 'yo\'q'}
        </p>
      </div>

      {confirmPending ? (
        <div className="card mb-3 border-amber-500/30 bg-amber-500/5">
          <p className="text-[11px] uppercase tracking-wide text-amber-400">{HOLAT_LABEL[nomalum.holat]}</p>
          {hujjatKutilmoqda ? (
            <p className="mt-1 text-[11px] text-amber-300">Mijozdan pasport yoki shartnoma sahifasi rasmi kutilmoqda</p>
          ) : null}
          <p className="mt-1 text-sm text-ink-200">Raqam: {nomalum.shartnomaRaqami ?? '—'}</p>
          <p className="mt-0.5 text-sm text-ink-200">Topilgan mijoz: {topilganMijoz?.fullName ?? '—'}</p>
          {nomalum.sabab ? <p className="mt-1 text-[11px] text-ink-500">{nomalum.sabab}</p> : null}
          {canAct ? (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="btn-primary flex-1"
                disabled={busy}
                onClick={() => moveTo.mutate({ path: 'tasdiqlash' })}
              >
                Tasdiqlash
              </button>
              <button
                type="button"
                className="btn-ghost flex-1"
                disabled={busy}
                onClick={() => stay.mutate('rad-etish')}
              >
                Rad etish
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {canAct && !closed ? (
        <div className="card mb-3">
          <label className="label">Shartnoma raqami</label>
          <input
            className="input"
            value={raqam}
            disabled={busy}
            placeholder="Masalan: 1234"
            onChange={(e) => setRaqam(e.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="btn-primary flex-1"
              disabled={busy || raqam.trim().length < 3}
              onClick={() => moveTo.mutate({ path: 'boglash', body: { shartnomaRaqami: raqam.trim() } })}
            >
              Mijozga bog'lash
            </button>
            {nomalum.holat !== 'mijoz_emas' ? (
              <button
                type="button"
                className="btn-ghost"
                disabled={busy}
                onClick={() => stay.mutate('mijoz-emas')}
              >
                Mijoz emas
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <ErrorNote error={moveTo.error ?? stay.error} />
    </>
  );
}
