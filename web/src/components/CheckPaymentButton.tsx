import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCan } from '@/store/auth';
import { som } from '@/lib/format';

/** Server qaytaradigan natija — `PaymentCheckService.CheckOutcome` bilan bir xil. */
type CheckOutcome =
  | { kind: 'confirmed'; amount: number; paymentType: string | null; thanked: boolean }
  | { kind: 'watching'; until: string }
  | { kind: 'not_found' }
  | { kind: 'unavailable'; reason: string };

/** `xonpay` — Xonsaroy Pay; qolgani bank. Operator manbani ko'rsin. */
function channelLabel(paymentType: string | null): string {
  if (!paymentType) return '';
  return paymentType === 'xonpay' ? ' · Xonsaroy Pay' : ` · ${paymentType}`;
}

/**
 * "To'lovni tekshirish" — CRM'dan yangi to'lov kelganini qidiradi.
 *
 * Mijoz chek yuborganda tekshiruv o'z-o'zidan ochiladi, lekin operatorga
 * qo'lda qo'zg'atish ham kerak: mijoz chekni boshqa kanal orqali yuborgan
 * yoki shunchaki "to'ladim" deb yozgan bo'lishi mumkin.
 */
export function CheckPaymentButton({ conversationId }: { conversationId: string }) {
  const canSend = useCan('conversations.send');
  const queryClient = useQueryClient();

  const check = useMutation({
    mutationFn: () => api.post<CheckOutcome>(`/conversations/${conversationId}/check-payment`),
    onSuccess: (outcome) => {
      // To'lov topilsa agent rahmat aytadi va suhbat holati o'zgaradi.
      if (outcome.kind === 'confirmed' || outcome.kind === 'not_found') {
        void queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
        void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
        void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }
    },
  });

  if (!canSend) return null;

  const outcome = check.data;

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => check.mutate()}
        disabled={check.isPending}
        className="w-full rounded-lg border border-ink-800 px-2 py-1.5 text-[11px] font-medium text-ink-300 transition-colors hover:bg-ink-800/50 disabled:opacity-50"
      >
        {check.isPending ? 'Tekshirilyapti…' : 'To\'lovni tekshirish'}
      </button>

      {/* Natija tugma ostida qoladi: operator uni ko'rmasdan boshqa ishga
          o'tsa, tekshirish bekorga ketardi. */}
      {outcome ? (
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-400">
          {outcome.kind === 'confirmed' ? (
            <span className="text-emerald-300">
              To'lov topildi: {som(outcome.amount)}
              {channelLabel(outcome.paymentType)}
              {outcome.thanked ? ' · agent rahmat aytdi' : ''}
            </span>
          ) : null}
          {outcome.kind === 'watching'
            ? 'Hozircha ko\'rinmadi. Xonsaroy Pay darhol, bank o\'tkazmasi bir kungacha ' +
              'kechikadi — kuzatuv davom etyapti.'
            : null}
          {outcome.kind === 'not_found' ? (
            <span className="text-amber-300">
              Bir kun ichida to'lov ko'rinmadi — qo'lda tekshirish kerak.
            </span>
          ) : null}
          {outcome.kind === 'unavailable' ? outcome.reason : null}
        </p>
      ) : null}

      {check.isError ? (
        <p className="mt-1.5 text-[11px] text-red-300">Tekshirib bo'lmadi, qaytadan urinib ko'ring.</p>
      ) : null}
    </div>
  );
}
