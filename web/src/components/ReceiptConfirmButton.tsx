import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { som } from '@/lib/format';
import { useCan } from '@/store/auth';

/** Server qaytaradigan natijalar — `PaymentCheckService` bilan bir xil. */
type ReceiptConfirmOutcome =
  | { kind: 'confirmed'; stage: string; linkSent: boolean }
  | { kind: 'not_sent'; reason: 'kill_switch' | 'agent_disabled' | 'agent_error'; stage: string; linkSent: boolean }
  | { kind: 'needs_human'; reason: 'yakunlangan_xarid' | 'summa_yoq'; stage: string | null }
  | { kind: 'no_review' };
type ReceiptRejectOutcome = { kind: 'rejected' } | { kind: 'no_review' };
type ReceiptDismissOutcome = { kind: 'dismissed'; restoredStage: string | null } | { kind: 'no_review' };
type Natija = ReceiptConfirmOutcome | ReceiptRejectOutcome | ReceiptDismissOutcome;

/** `GET /conversations/:id` dagi ochiq chek tekshiruvi. */
export interface ReceiptReview {
  id: string;
  messageId: string | null;
  createdAt: string;
  /** Standart summa: birinchi qism yoki qolgan summa; hisoblab bo'lmasa `null`. */
  expectedAmount: number | null;
}

const BOSQICH: Record<string, string> = {
  yangi: 'Yangi',
  suhbatda: 'Suhbatda',
  qiziqdi: 'Qiziqdi',
  karta_yuborildi: 'Karta yuborildi',
  qisman_toladi: "Qisman to'ladi",
  toladi: "To'ladi",
  chek_keldi: 'Chek keldi',
};

function natijaMatni(n: Natija): string {
  switch (n.kind) {
    case 'confirmed':
      return `Tasdiqlandi — ${BOSQICH[n.stage] ?? n.stage}${n.linkSent ? ', guruh havolasi yuborildi' : ''}`;
    case 'not_sent':
      return `Summa yozildi — ${BOSQICH[n.stage] ?? n.stage}${n.linkSent ? ', guruh havolasi yuborildi' : ''}. Agent rahmat yoza olmadi — mijozga o'zingiz yozing`;
    case 'needs_human':
      return n.reason === 'summa_yoq'
        ? 'Summa yozildi, lekin xarid summasi noma\'lum — bosqichni qo\'lda belgilang'
        : 'Chek yakunlangan xaridga keldi — summa xaridga qo\'shilmadi, qo\'lda tekshiring';
    case 'rejected':
      return 'Rad etildi — agent mijozdan qayta chek so\'raydi';
    case 'dismissed':
      return n.restoredStage
        ? `Chek emas deb belgilandi — bosqich "${BOSQICH[n.restoredStage] ?? n.restoredStage}" ga qaytdi`
        : 'Chek emas deb belgilandi';
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
    void queryClient.invalidateQueries({ queryKey: ['clients'] });
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

  const chekEmas = useMutation({
    mutationFn: () => yuborish<ReceiptDismissOutcome>(`/conversations/${conversationId}/receipt-dismiss`, {}),
    onSuccess: yangila,
  });

  const outcome: Natija | undefined = tasdiq.data ?? rad.data ?? chekEmas.data;
  const pending = tasdiq.isPending || rad.isPending || chekEmas.isPending;
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
          <div className="grid grid-cols-3 gap-1.5">
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
            <button
              type="button"
              onClick={() => {
                if (confirm("Bu to'lov cheki emasmi? Tekshiruv yopiladi, mijozga hech narsa yozilmaydi.")) {
                  chekEmas.mutate();
                }
              }}
              disabled={pending}
              className="btn-ghost !py-1.5 text-xs"
            >
              {chekEmas.isPending ? 'Yopilyapti…' : 'Chek emas'}
            </button>
          </div>
        </div>
      ) : null}

      {outcome ? (
        <p
          className={`mt-1.5 text-[11px] leading-relaxed ${
            outcome.kind === 'confirmed' || outcome.kind === 'rejected' || outcome.kind === 'dismissed'
              ? 'text-emerald-300'
              : outcome.kind === 'not_sent' || outcome.kind === 'needs_human'
                ? 'text-amber-300'
                : 'text-ink-400'
          }`}
        >
          {natijaMatni(outcome)}
        </p>
      ) : null}

      {tasdiq.isError || rad.isError || chekEmas.isError ? (
        <p className="mt-1.5 text-[11px] text-red-300">Saqlab bo'lmadi, qaytadan urinib ko'ring.</p>
      ) : null}
    </div>
  );
}

type SendLinkOutcome = { kind: 'sent' | 'already_sent' | 'not_eligible' | 'no_link' | 'failed' };

const HAVOLA_NATIJASI: Record<SendLinkOutcome['kind'], string> = {
  sent: 'Guruh havolasi yuborildi',
  already_sent: 'Havola avvalroq yuborilgan',
  not_eligible: 'Kurs qoidasi hali bajarilmagan',
  no_link: 'Kursga guruh havolasi kiritilmagan',
  failed: 'Yuborib bo\'lmadi — Telegram ulanishini tekshirib, qayta urinib ko\'ring',
};

/**
 * "Havolani yuborish" — avtomatik yuborish yiqilganda yoki havola kursga
 * keyin kiritilganda. Matnni tizim yuboradi (aniq qiymatdan), bir marta.
 */
export function SendLinkButton({ conversationId, visible }: { conversationId: string; visible: boolean }) {
  const canConfirm = useCan('receipts.confirm');
  const queryClient = useQueryClient();
  const yubor = useMutation({
    mutationFn: () => api.post<SendLinkOutcome>(`/conversations/${conversationId}/send-link`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
  });
  if (!canConfirm || (!visible && !yubor.data)) return null;
  return (
    <div className="mb-3">
      {visible ? (
        <button
          type="button"
          onClick={() => yubor.mutate()}
          disabled={yubor.isPending}
          className="btn-ghost w-full !py-1.5 text-xs"
        >
          {yubor.isPending ? 'Yuborilyapti…' : 'Havolani yuborish'}
        </button>
      ) : null}
      {yubor.data ? <p className="mt-1.5 text-[11px] text-ink-400">{HAVOLA_NATIJASI[yubor.data.kind]}</p> : null}
      {yubor.isError ? <p className="mt-1.5 text-[11px] text-red-300">Yuborib bo'lmadi, qaytadan urinib ko'ring.</p> : null}
    </div>
  );
}

type SendCardOutcome =
  | { kind: 'sent' }
  | { kind: 'not_sent'; reason: 'kurs_yoq' | 'karta_yoq' | 'bolib_tolash_yoq' }
  | { kind: 'failed'; reason: string };

const KARTA_SABABI: Record<string, string> = {
  kurs_yoq: "Mijozning faol xaridida kurs yo'q — avval kursni belgilang",
  karta_yoq: "Sozlamalarda faol karta yo'q",
  bolib_tolash_yoq: "Bu kursda bo'lib to'lash yo'q",
};

function kartaNatijasi(n: SendCardOutcome): string {
  if (n.kind === 'sent') return 'Karta yuborildi';
  if (n.kind === 'not_sent') return KARTA_SABABI[n.reason] ?? n.reason;
  return `Yuborib bo'lmadi: ${n.reason}`;
}

/**
 * "Kartani yuborish" — agent "mana karta" degan, lekin karta ketmagan
 * (qo'lda tasdiqlash rejimi, takror himoyasi, kurs aniqlanmagan) yoki mijoz
 * qiziqib turibdi. Karta raqamini tizim Sozlamalardagi aniq qiymatdan yuboradi.
 */
export function SendCardButton({ conversationId, visible }: { conversationId: string; visible: boolean }) {
  const canConfirm = useCan('receipts.confirm');
  const queryClient = useQueryClient();
  const yubor = useMutation({
    mutationFn: () => api.post<SendCardOutcome>(`/conversations/${conversationId}/send-card`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });
  if (!canConfirm || (!visible && !yubor.data)) return null;
  return (
    <div className="mb-3">
      {visible ? (
        <button
          type="button"
          onClick={() => {
            if (confirm("To'lov kartasini mijozga yuborasizmi?")) yubor.mutate();
          }}
          disabled={yubor.isPending}
          className="btn-ghost w-full !py-1.5 text-xs"
        >
          {yubor.isPending ? 'Yuborilyapti…' : 'Kartani yuborish'}
        </button>
      ) : null}
      {yubor.data ? (
        <p className={`mt-1.5 text-[11px] ${yubor.data.kind === 'sent' ? 'text-emerald-300' : 'text-amber-300'}`}>
          {kartaNatijasi(yubor.data)}
        </p>
      ) : null}
      {yubor.isError ? <p className="mt-1.5 text-[11px] text-red-300">Yuborib bo'lmadi, qaytadan urinib ko'ring.</p> : null}
    </div>
  );
}
