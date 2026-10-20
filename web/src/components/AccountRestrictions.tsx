import clsx from 'clsx';
import type { AccountRestriction, RestrictionKind } from '@/lib/types';
import { relative, untilRelative } from '@/lib/format';

const LABEL: Record<RestrictionKind, string> = {
  flood_wait: 'FLOOD_WAIT',
  peer_flood: 'PEER_FLOOD',
  limited: 'CHEKLANGAN',
  banned: 'BLOKLANGAN',
  session_dead: 'SESSIYA BEKOR QILINGAN',
  not_connected: 'ULANMAGAN',
};

/**
 * Nima qilish kerakligi — kod nomining o'zi operatorga hech narsa
 * aytmaydi. Har biri boshqacha javob talab qiladi: biri kutishni,
 * ikkinchisi yuborishni butunlay to'xtatishni, uchinchisi qayta
 * ulanishni.
 */
const HINT: Record<RestrictionKind, string> = {
  flood_wait: 'Telegram so\'rovlarni sekinlashtirdi — muddat tugashini kuting.',
  peer_flood: 'Notanish odamlarga yozilmaydi. Yuborishni to\'xtating, mavjud suhbatlar davom etadi.',
  limited: 'Notanish odamlarga yozilmaydi. Yangi murojaat qilmang.',
  banned: 'Akkaunt bloklangan — mijozlarni boshqa akkauntga o\'tkazing.',
  session_dead: 'Akkauntni qayta ulang (kod orqali kirish).',
  not_connected: 'Akkaunt ulanmagan — tizimga kiring.',
};

/** Og'irligi bo'yicha: qizil — yuborish umuman to'xtaydi. */
const TONE: Record<RestrictionKind, string> = {
  flood_wait: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  peer_flood: 'border-red-500/30 bg-red-500/10 text-red-200',
  limited: 'border-red-500/30 bg-red-500/10 text-red-200',
  banned: 'border-red-500/40 bg-red-500/15 text-red-100',
  session_dead: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  not_connected: 'border-ink-700 bg-ink-800/60 text-ink-300',
};

interface Props {
  restrictions: AccountRestriction[];
  /**
   * Telegramda topilmagan raqamlar soni. `null` — hali tekshirilmagan
   * (nol bilan aralashib ketmasligi uchun alohida holat).
   */
  notFoundLookups?: number | null;
}

/**
 * Akkauntning faol cheklovlari.
 *
 * Cheklov bo'lmasa HECH NARSA ko'rsatilmaydi — toza akkauntlar kartasi
 * shishib, muammoli akkauntni ajratib olish qiyinlashmasin.
 */
export function AccountRestrictions({ restrictions, notFoundLookups }: Props) {
  const hasLookupNote = notFoundLookups !== null && notFoundLookups !== undefined && notFoundLookups > 0;
  if (!restrictions.length && !hasLookupNote) return null;

  return (
    <div className="mt-2 space-y-1.5">
      {restrictions.map((r, i) => (
        <div
          key={`${r.kind}-${i}`}
          className={clsx('max-w-xl rounded-md border px-2.5 py-1.5 text-[11px]', TONE[r.kind])}
        >
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="font-semibold tracking-wide">{LABEL[r.kind]}</span>
            {r.since ? <span className="opacity-80">{relative(r.since)} tushgan</span> : null}
            <span className="opacity-60">·</span>
            <span className="opacity-80">
              {r.until
                ? `ochilish: ${untilRelative(r.until)}`
                : /* Sana TAXMIN QILINMAYDI: noto'g'ri sana operatorni
                     cheklangan akkauntdan yozishga undab, cheklovni
                     uzaytirardi. */
                  'ochilish vaqtini Telegram aytmadi'}
            </span>
            <span className="ml-auto rounded bg-black/20 px-1 text-[10px] opacity-70">
              {r.source === 'spambot' ? '@SpamBot' : 'MTProto'}
            </span>
          </div>
          <p className="mt-0.5 opacity-75">{HINT[r.kind]}</p>
          {r.message ? <p className="mt-0.5 opacity-60">{r.message}</p> : null}
        </div>
      ))}

      {hasLookupNote ? (
        <p className="text-[11px] text-ink-500">
          Telegramda topilmagan raqamlar:{' '}
          <span className="font-semibold text-ink-300">{notFoundLookups}</span>
          <span className="text-ink-600"> — bu akkaunt cheklovi emas, raqamlarning o'zi</span>
        </p>
      ) : null}
    </div>
  );
}
