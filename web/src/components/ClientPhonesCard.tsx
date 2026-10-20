import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ErrorNote, Spinner } from '@/components/ui';

/**
 * Mijozning raqamlari — ko'rish, qo'shish va "bu raqam mijozniki emas".
 *
 * NEGA KERAK: mijozga yozdik, javob bergan odam boshqa kishi bo'lib chiqdi —
 * raqam eski egasidan chiqib, yangi odamga berilgan. Agent bunday holatda
 * uzr aytadi va begona odamga "boshqa yozilmaydi" deydi, lekin operatorda
 * o'sha so'zni bajaradigan tugma yo'q edi: raqam faqat matn bo'lib
 * ko'rinardi.
 *
 * Uzilgan raqam ham ko'rsatiladi. Aks holda operator xato uzganini
 * qaytara olmasdi va raqam izsiz yo'qolardi.
 */
export function ClientPhonesCard({
  clientId,
  phone,
  extraPhones,
  blockedPhones,
  writable,
}: {
  clientId: string;
  phone: string | null;
  extraPhones: string[];
  blockedPhones: string[];
  writable: boolean;
}) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState('');
  // Qaysi raqam uchun sabab so'ralyapti. NULL — oyna yopiq.
  const [confirming, setConfirming] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  // Karta, ro'yxat va tab sanoqlari qayta so'raladi: raqam uzilgach mijoz
  // "raqam yo'q" filtriga tushadi va bu darhol ko'rinishi kerak.
  const refresh = async (): Promise<void> => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['client', clientId] }),
      qc.invalidateQueries({ queryKey: ['clients'] }),
      qc.invalidateQueries({ queryKey: ['client-tab-counts'] }),
    ]);
  };

  const block = useMutation({
    mutationFn: (body: { phone: string; reason: string | null }) =>
      api.post(`/clients/${clientId}/phones/block`, body),
    onSuccess: async () => {
      setConfirming(null);
      setReason('');
      await refresh();
    },
  });

  const unblock = useMutation({
    mutationFn: (p: string) => api.delete(`/clients/${clientId}/phones/block`, { phone: p }),
    onSuccess: refresh,
  });

  const add = useMutation({
    mutationFn: (p: string) =>
      api.patch(`/clients/${clientId}`, {
        // Yangi raqam asosiy bo'ladi, agar asosiy bo'sh bo'lsa. Aks holda
        // qo'shimchalarga tushadi — mavjud raqam ishlayotgan bo'lishi mumkin.
        ...(phone ? { extraPhones: [...extraPhones, p] } : { phone: p }),
      }),
    onSuccess: async () => {
      setAdding('');
      await refresh();
    },
  });

  const all = [...(phone ? [phone] : []), ...extraPhones];
  const busy = block.isPending || unblock.isPending || add.isPending;

  return (
    <div className="card !p-3 space-y-2">
      <p className="text-[10px] uppercase text-ink-500">Telefon raqamlari</p>

      {all.length ? (
        <ul className="space-y-1">
          {all.map((p, i) => (
            <li key={p} className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs">
                {p}
                {i === 0 ? <span className="ml-1 text-[10px] text-ink-600">asosiy</span> : null}
              </span>
              {writable ? (
                <button
                  type="button"
                  className="btn-ghost !px-2 !py-0.5 text-[11px]"
                  disabled={busy}
                  onClick={() => {
                    setConfirming(p);
                    setReason('');
                  }}
                >
                  Mijozniki emas
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-ink-600">Raqam yo'q</p>
      )}

      {/* Sabab oynasi. Sabab ixtiyoriy, lekin so'raladi: keyin "bu raqamni
          nega o'chirgansiz?" degan savol chiqishi tabiiy. */}
      {confirming ? (
        <div className="rounded border border-ink-700 p-2 space-y-2">
          <p className="text-[11px] text-ink-400">
            <span className="font-mono">{confirming}</span> shu mijozdan uziladi. Sinxronizatsiya
            va import uni qayta qo'shmaydi.
          </p>
          <input
            className="input w-full text-xs"
            placeholder="Sabab (masalan: raqam boshqa odamda)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary !py-1 text-xs"
              disabled={block.isPending}
              onClick={() => block.mutate({ phone: confirming, reason: reason.trim() || null })}
            >
              {block.isPending ? <Spinner /> : null}
              Uzish
            </button>
            <button
              type="button"
              className="btn-ghost !py-1 text-xs"
              onClick={() => setConfirming(null)}
            >
              Bekor
            </button>
          </div>
        </div>
      ) : null}

      {blockedPhones.length ? (
        <div className="space-y-1 border-t border-ink-800 pt-2">
          <p className="text-[10px] uppercase text-ink-600">Uzilgan raqamlar</p>
          {blockedPhones.map((p) => (
            <div key={p} className="flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-ink-600 line-through">{p}</span>
              {writable ? (
                <button
                  type="button"
                  className="btn-ghost !px-2 !py-0.5 text-[11px]"
                  disabled={busy}
                  onClick={() => unblock.mutate(p)}
                >
                  Qaytarish
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {writable ? (
        <div className="flex gap-2 border-t border-ink-800 pt-2">
          <input
            className="input w-full text-xs"
            placeholder="+998 90 123 45 67"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
          />
          <button
            type="button"
            className="btn-ghost !py-1 text-xs"
            disabled={!adding.trim() || add.isPending}
            onClick={() => add.mutate(adding.trim())}
          >
            {add.isPending ? <Spinner /> : null}
            Qo'shish
          </button>
        </div>
      ) : null}

      {block.error ? <ErrorNote error={block.error} /> : null}
      {unblock.error ? <ErrorNote error={unblock.error} /> : null}
      {add.error ? <ErrorNote error={add.error} /> : null}
    </div>
  );
}
