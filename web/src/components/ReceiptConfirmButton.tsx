import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useCan } from '@/store/auth';

/** Server qaytaradigan natija — `PaymentCheckService.ReceiptConfirmOutcome` bilan bir xil. */
type ReceiptConfirmOutcome =
  | { kind: 'thanked' }
  | { kind: 'already_thanked' }
  | { kind: 'not_sent'; reason: 'kill_switch' | 'agent_disabled' | 'agent_error' }
  | { kind: 'no_review' };

/** `GET /conversations/:id` dagi ochiq chek tekshiruvi. */
export interface ReceiptReview {
  id: string;
  messageId: string | null;
  createdAt: string;
}

const NATIJA_MATNI: Record<ReceiptConfirmOutcome['kind'], string> = {
  thanked: 'Rahmat yuborildi',
  already_thanked: 'Rahmat avvalroq aytilgan — tekshiruv yopildi',
  not_sent: 'Agent yoza olmadi — mijozga o\'zingiz yozing',
  no_review: 'Tekshiruv allaqachon yopilgan',
};

/**
 * "To'lov qabul qilindi" — operator chekni tekshirib, pul kelganini
 * tasdiqlaydi. Agent mijozga summasiz rahmat yozadi.
 *
 * Summa kiritilmaydi va "rad etish" tugmasi yo'q (2026-09-17 qarori): pul
 * kelmagan bo'lsa operator mijoz bilan o'zi gaplashadi.
 */
export function ReceiptConfirmButton({
  conversationId,
  receiptReview,
}: {
  conversationId: string;
  receiptReview: ReceiptReview | null;
}) {
  const canSend = useCan('conversations.send');
  const queryClient = useQueryClient();

  const confirmReceipt = useMutation({
    mutationFn: async (): Promise<ReceiptConfirmOutcome> => {
      try {
        return await api.post<ReceiptConfirmOutcome>(`/conversations/${conversationId}/receipt-confirm`);
      } catch (err) {
        // 409 — boshqa operator yopib ulgurgan. Xato emas, natija.
        if (err instanceof ApiError && err.status === 409) return { kind: 'no_review' };
        throw err;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const outcome = confirmReceipt.data;
  // Bosilgach tekshiruv yopiladi va `receiptReview` null bo'ladi — natija
  // baribir ko'rinib tursin, aks holda operator nima bo'lganini bilmaydi.
  if (!canSend || (!receiptReview && !outcome)) return null;

  return (
    <div className="mb-3">
      {receiptReview ? (
        <button
          type="button"
          onClick={() => {
            if (confirm('Mijozning to\'lovi haqiqatan qabul qilinganini tekshirdingizmi? Agent mijozga rahmat yozadi.')) {
              confirmReceipt.mutate();
            }
          }}
          disabled={confirmReceipt.isPending}
          className="btn-primary w-full !py-1.5 text-xs"
        >
          {confirmReceipt.isPending ? 'Yuborilyapti…' : 'To\'lov qabul qilindi'}
        </button>
      ) : null}

      {outcome ? (
        <p
          className={`mt-1.5 text-[11px] leading-relaxed ${
            outcome.kind === 'thanked' ? 'text-emerald-300' : outcome.kind === 'not_sent' ? 'text-amber-300' : 'text-ink-400'
          }`}
        >
          {NATIJA_MATNI[outcome.kind]}
        </p>
      ) : null}

      {confirmReceipt.isError ? (
        <p className="mt-1.5 text-[11px] text-red-300">Tasdiqlab bo'lmadi, qaytadan urinib ko'ring.</p>
      ) : null}
    </div>
  );
}
