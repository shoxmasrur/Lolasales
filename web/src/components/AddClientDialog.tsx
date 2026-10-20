import { useState } from 'react';
import { api } from '@/lib/api';
import type { AddClientPreview, AddClientResult } from '@/lib/types';
import { ErrorNote, Spinner } from '@/components/ui';
import { som } from '@/lib/format';
import { Sheet } from '@/components/Sheet';

/**
 * "+ Mijoz qo'shish" oynasi.
 *
 * Ikki bosqich: raqamni tekshirish, so'ng tasdiqlash. Bitta raqam xato
 * terilsa butunlay boshqa odam qo'shilib ketardi va uni keyin o'chirish
 * kerak bo'lardi — shuning uchun saqlashdan oldin kim qo'shilayotgani
 * ko'rsatiladi.
 *
 * Ism, telefon va to'lov summasi qo'lda kiritilmaydi: summa har kuni
 * o'zgaradi va odam yozib qo'ysa o'sha zahoti eskiradi.
 */
export function AddClientDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (clientId: string) => void;
}) {
  const [contractNo, setContractNo] = useState('');
  const [preview, setPreview] = useState<AddClientPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const check = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const res = await api.post<{ preview: AddClientPreview }>('/clients/from-contract/preview', {
        contractNo: contractNo.trim(),
      });
      setPreview(res.preview);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const create = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ result: AddClientResult }>('/clients/from-contract', {
        contractNo: contractNo.trim(),
      });
      onCreated(res.result.clientId);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      // Saqlash ketayotganda dialog yopilmasin — hozirgi `busy`
      // shartining o'zi, faqat endi u `Sheet` ga uzatiladi.
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Mijoz qo'shish"
      maxWidth="max-w-lg"
    >
      <div className="p-4 md:p-5">
        <p className="text-xs leading-relaxed text-ink-400">
          Shartnoma raqamini kiriting — ism, telefon va to'lov ma'lumoti shartnomalar
          bazasidan olinadi.
        </p>

        <div className="mt-4 flex gap-2">
          <input
            autoFocus
            value={contractNo}
            onChange={(e) => setContractNo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && contractNo.trim() && !busy) void check();
            }}
            placeholder="Shartnoma raqami"
            className="input"
          />
          <button
            type="button"
            className="btn-ghost shrink-0 !py-1 text-xs"
            disabled={!contractNo.trim() || busy}
            onClick={() => void check()}
          >
            {busy && !preview ? <Spinner /> : 'Tekshirish'}
          </button>
        </div>

        <ErrorNote error={error} />

        {preview ? (
          <div className="mt-4 rounded-xl border border-ink-700 bg-ink-950/50 p-4 text-sm">
            <div className="font-medium">{preview.contract.clientName}</div>
            <div className="mt-1 text-xs text-ink-400">{preview.contract.phones.join(', ')}</div>
            {preview.contract.objectName ? (
              <div className="mt-1 text-xs text-ink-400">
                Obyekt: {preview.contract.objectName}
              </div>
            ) : null}

            <div className="mt-3 border-t border-ink-800 pt-3">
              <div>
                Kechikkan to'lov:{' '}
                <span className="tabular-nums">{som(preview.contract.overdueTotal)}</span>
              </div>
              <div className="mt-0.5 text-xs text-ink-400">
                Kechikish: <span className="tabular-nums">{preview.contract.daysOverdue}</span> kun
              </div>
            </div>

            {preview.existingClient ? (
              <p className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-300">
                Bu shartnoma bazada bor: {preview.existingClient.fullName}. «Ochish» uni
                ko'rsatadi.
              </p>
            ) : null}
            {preview.matchedByPhone ? (
              <p className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-300">
                Bu raqam {preview.matchedByPhone.fullName} ga tegishli — shartnoma o'sha
                mijozga qo'shiladi.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-ghost !py-1 text-xs" disabled={busy} onClick={onClose}>
            Bekor qilish
          </button>
          {preview ? (
            <button
              type="button"
              className="btn-primary !py-1 text-xs"
              disabled={busy}
              onClick={() => void create()}
            >
              {preview.existingClient ? 'Ochish' : 'Qo\'shish'}
            </button>
          ) : null}
        </div>
      </div>
    </Sheet>
  );
}
