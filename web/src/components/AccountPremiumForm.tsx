import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import type { TelegramAccount } from '@/lib/types';
import { Spinner } from '@/components/ui';

/** Server `PREMIUM_MUDDATLARI` bilan bir xil ro'yxat. */
const MUDDATLAR = [
  { oy: 1, nom: '1 oy' },
  { oy: 3, nom: '3 oy' },
  { oy: 6, nom: '6 oy' },
  { oy: 12, nom: '1 yil' },
  { oy: 24, nom: '2 yil' },
];

/** Brauzerning mahalliy sanasi, YYYY-MM-DD — sana maydonining standart qiymati. */
function bugunIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Props {
  account: TelegramAccount;
  onSaved: () => void;
}

/**
 * Akkaunt kartasidagi Telegram Premium bo'limi.
 *
 * Sana qo'lda kiritiladi: Telegram obuna tugash sanasini bermaydi.
 * Tugash sanasini server hisoblaydi (sotib olingan sana + muddat).
 * Tugashiga 30, 7 va 1 kun qolganda administratorga bot orqali eslatma
 * ketadi; sana yangilanganda eslatmalar qaytadan boshlanadi.
 */
export function AccountPremiumForm({ account, onSaved }: Props) {
  const [boshlanish, setBoshlanish] = useState(bugunIso());
  const [oy, setOy] = useState(12);
  const [until, setUntil] = useState(account.premiumUntil ?? '');
  const [xato, setXato] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: { until: string | null } | { boshlanish: string; oy: number }) =>
      api.put(`/telegram/accounts/${account.id}/premium`, body),
    onSuccess: () => {
      setXato(null);
      onSaved();
    },
    onError: (e) => setXato(e instanceof ApiError ? e.message : 'Saqlab bo\'lmadi'),
  });

  const bor = Boolean(account.premiumUntil);
  // Amaldagi obuna tugash sanasidan uzayadi; tugab bo'lgani — bugundan.
  const amalda = bor && (account.premiumKunQoldi ?? -1) >= 0;
  const sana = account.premiumUntil?.split('-').reverse().join('.');

  return (
    <div className="mt-3 border-t border-ink-800 pt-3">
      <div className="mb-2 text-xs text-ink-500">
        Telegram Premium
        <span className="ml-2 text-ink-600">
          {bor
            ? amalda
              ? `${sana} gacha · ${account.premiumKunQoldi} kun qoldi`
              : `${sana} da tugagan`
            : 'yo\'q'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {bor ? (
          <>
            <select
              className="input !py-1 w-20 text-xs"
              value={oy}
              onChange={(e) => setOy(Number(e.target.value))}
              title="Qancha muddatga uzaytirildi"
            >
              {MUDDATLAR.map((m) => (
                <option key={m.oy} value={m.oy}>{m.nom}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn-ghost !py-1 text-xs"
              disabled={save.isPending}
              onClick={() =>
                save.mutate({ boshlanish: amalda ? account.premiumUntil! : bugunIso(), oy })
              }
              title={
                amalda
                  ? 'Tugash sanasiga tanlangan muddat qo\'shiladi, eslatmalar qaytadan boshlanadi'
                  : 'Obuna tugagan — yangi muddat bugundan hisoblanadi'
              }
            >
              {save.isPending ? <Spinner /> : null}
              Uzaytirish
            </button>
            <span className="text-ink-700">|</span>
            <input
              type="date"
              className="input !py-1 w-36 text-xs"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
              title="Tugash sanasini qo'lda to'g'rilash"
            />
            <button
              type="button"
              className="btn-ghost !py-1 text-xs"
              disabled={save.isPending || !until || until === account.premiumUntil}
              onClick={() => save.mutate({ until })}
            >
              Sanani saqlash
            </button>
            <button
              type="button"
              className="btn-ghost !py-1 text-xs text-amber-300"
              disabled={save.isPending}
              onClick={() => {
                if (window.confirm(`«${account.label}» akkauntidan Premium belgisi olib tashlansinmi?`)) {
                  save.mutate({ until: null });
                }
              }}
            >
              Premium yo'q
            </button>
          </>
        ) : (
          <>
            <label className="flex items-center gap-1.5 text-xs text-ink-500">
              Sotib olingan
              <input
                type="date"
                className="input !py-1 w-36 text-xs"
                value={boshlanish}
                onChange={(e) => setBoshlanish(e.target.value)}
              />
            </label>
            <select
              className="input !py-1 w-20 text-xs"
              value={oy}
              onChange={(e) => setOy(Number(e.target.value))}
              title="Obuna muddati"
            >
              {MUDDATLAR.map((m) => (
                <option key={m.oy} value={m.oy}>{m.nom}</option>
              ))}
            </select>
            <button
              type="button"
              className="btn-ghost !py-1 text-xs"
              disabled={save.isPending || !boshlanish}
              onClick={() => save.mutate({ boshlanish, oy })}
            >
              {save.isPending ? <Spinner /> : null}
              Premium belgilash
            </button>
          </>
        )}
      </div>

      {xato ? <p className="mt-2 text-[11px] text-red-300">{xato}</p> : null}
    </div>
  );
}
