import { CHEK_TEKSHIRUVI_MUDDATI_KUNLAR } from '@/domain/entities/PaymentCheck';

/**
 * `findSilent` filtri: operator tekshirayotgan `tolov` cheki bor suhbatga
 * sukut xabari yuborilmaydi (2026-09-17).
 *
 * NEGA: Komiljonov Doniyorbek chek yuborgach 28-avgust va 16-sentabrda
 * "chekingizni hali tekshiryapmiz" degan sukut xabarini oldi — nudge
 * promptida tekshiruv natijasi yo'q edi. Chekni endi odam tasdiqlaydi va
 * natija kelguncha mijozni bezovta qilishga asos yo'q.
 *
 * NEGA FAQAT `tolov`: `aniqlanmagan` suhbat eskalatsiyada turadi va sukut
 * xabari `canAgentNudge` tufayli baribir ketmaydi. Operator eskalatsiyani
 * tugmasiz yechsa — rasmni ko'rib, chek emas deb hisoblagan: sukut
 * xabarlari qaytadi, aks holda oddiy surat suhbatni umrbod jim qoldirardi.
 *
 * NEGA MUDDAT: tugmasiz qolib ketgan tekshiruv `CHEK_TEKSHIRUVI_MUDDATI_KUNLAR`
 * dan keyin sukutni to'smaydi — aks holda mijoz umrbod jim qolardi.
 *
 * Alohida modul: SQL matni bazasiz sinaladi (`chekSukut.spec.ts`).
 */
export const CHEK_TEKSHIRUVIDAGI_SUHBATLARSIZ = `
          AND NOT EXISTS (
            SELECT 1 FROM payment_checks pc
             WHERE pc.conversation_id = c.id
               AND pc.status = 'reviewing'
               AND pc.receipt_source = 'tolov'
               AND pc.created_at > now() - interval '${CHEK_TEKSHIRUVI_MUDDATI_KUNLAR} days'
          )`;
