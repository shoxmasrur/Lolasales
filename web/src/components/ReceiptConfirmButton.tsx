import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { som } from '@/lib/format';
import { useCan } from '@/store/auth';

/** Server qaytaradigan natijalar — `PaymentCheckService` bilan bir xil. */
type ReceiptConfirmOutcome =
  | { kind: 'confirmed'; stage: string; linkSent: boolean }
  | { kind: 'not_sent'; reason: 'kill_switch' | 'agent_disabled' | 'agent_error' }
  | { kind: 'no_review' };
type ReceiptRejectOutcome = { kind: 'rejected' } | { kind: 'no_review' };
type Natija = ReceiptConfirmOutcome | ReceiptRejectOutcome;

/** `GET /conversations/:id` dagi ochiq chek tekshiruvi. */
export interface ReceiptReview {
  id: string;
  messageId: string | null;
  createdAt: string;
  /** Standart summa: birinchi qism yoki qolgan summa; hisoblab bo'lmasa `null`. */
  expectedAmount: number | null;
}

const BOSQICH: Record<string, string> = { qisman_toladi: "Qisman to'ladi", toladi: "To'ladi", chek_keldi: 'Chek keldi' };

function natijaMatni(n: Natija): string {
  switch (n.kind) {
    case 'confirmed':
      return `Tasdiqlandi — ${BOSQICH[n.stage] ?? n.stage}${n.linkSent ? ', guruh havolasi yuborildi' : ''}`;
    case 'not_sent':
      return 'Summa yozildi, lekin agent rahmat yoza olmadi — mijozga o\'zingiz yozing';
    case 'rejected':
      return 'Rad etildi — agent mijozdan qayta chek so\'raydi';
    case 'no_review':
      return 'Tekshiruv allaqachon yopilgan';
  }
}

/** 409 — boshqa menejer yopib ulgurgan. Xato emas, natija. */
async function yuborish<T extends Natija>(path: string, body: unknown): Promise<T> {
  try {
    return await api.post<T>(path, body);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) return { kind: 'no_review' } as T;
    throw err;
  }
}

/**
 * Chek bo'yicha menejer qarori: "Tasdiqlash" (chekdagi summa bilan,
 * standart — kutilgan summa) yoki "Rad etish" (sabab so'raladi).
 */
export function ReceiptConfirmButton({
  conversationId,
  receiptReview,
}: {
  conversationId: string;
  receiptReview: ReceiptReview | null;
}) {
  const canConfirm = useCan('receipts.confirm');
  const queryClient = useQueryClient();
  const kutilgan = receiptReview?.expectedAmount ? String(receiptReview.expectedAmount) : '';
  const [amount, setAmount] = useState<string>(kutilgan);
  // Yangi chek (boshqa tekshiruv) kelsa — standart summa qaytadan qo'yiladi.
  useEffect(() => {
    if (receiptReview) setAmount(kutilgan);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptReview?.id]);

  const yangila = () => {
    void queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
    void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
  };
  const tasdiq = useMutation({
    mutationFn: (summa: number) =>
      yuborish<ReceiptConfirmOutcome>(`/conversations/${conversationId}/receipt-confirm`, { amount: summa }),
    onSuccess: yangila,
  });
  const rad = useMutation({
    mutationFn: (reason: string) =>
      yuborish<ReceiptRejectOutcome>(`/conversations/${conversationId}/receipt-reject`, { reason }),
    onSuccess: yangila,
  });

  const outcome: Natija | undefined = tasdiq.data ?? rad.data;
  const pending = tasdiq.isPending || rad.isPending;
  // Bosilgach tekshiruv yopiladi va `receiptReview` null bo'ladi — natija
  // baribir ko'rinib tursin, aks holda menejer nima bo'lganini bilmaydi.
  if (!canConfirm || (!receiptReview && !outcome)) return null;

  const summa = Number(amount.replace(/\s/g, ''));
  const summaToGri = Number.isInteger(summa) && summa > 0;

  return (
    <div className="mb-3">
      {receiptReview ? (
        <div className="card space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-ink-500">Chek keldi</p>
          <label className="block text-[11px] text-ink-400">
            Chekdagi summa, so'm
            <input
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d\s]/g, ''))}
              className="input mt-1 w-full !py-1.5 text-sm"
              placeholder="masalan, 500000"
            />
          </label>
          {summaToGri ? <p className="text-[11px] text-ink-500">{som(summa)}</p> : null}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (confirm(`Chekdagi ${som(summa)} qabul qilinganini tasdiqlaysizmi? Agent mijozga rahmat yozadi.`)) {
                  tasdiq.mutate(summa);
                }
              }}
              disabled={pending || !summaToGri}
              className="btn-primary !py-1.5 text-xs"
            >
              {tasdiq.isPending ? 'Yuborilyapti…' : 'Tasdiqlash'}
            </button>
            <button
              type="button"
              onClick={() => {
                const sabab = window.prompt('Rad etish sababi (mijozga agent shunga tayanib yozadi):')?.trim();
                if (sabab) rad.mutate(sabab.slice(0, 300));
              }}
              disabled={pending}
              className="btn-ghost !py-1.5 text-xs"
            >
              {rad.isPending ? 'Yuborilyapti…' : 'Rad etish'}
            </button>
          </div>
        </div>
      ) : null}

      {outcome ? (
        <p
          className={`mt-1.5 text-[11px] leading-relaxed ${
            outcome.kind === 'confirmed' || outcome.kind === 'rejected'
              ? 'text-emerald-300'
              : outcome.kind === 'not_sent'
                ? 'text-amber-300'
                : 'text-ink-400'
          }`}
        >
          {natijaMatni(outcome)}
        </p>
      ) : null}

      {tasdiq.isError || rad.isError ? (
        <p className="mt-1.5 text-[11px] text-red-300">Saqlab bo'lmadi, qaytadan urinib ko'ring.</p>
      ) : null}
    </div>
  );
}
