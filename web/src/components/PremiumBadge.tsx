import type { TelegramAccount } from '@/lib/types';

/** Shuncha kun va kamroq qolganda belgi sariqqa o'tadi — eslatma ham shu kundan boshlanadi. */
const OGOHLANTIRISH_KUN = 30;

/**
 * Telegram Premium belgisi: akkaunt kartasi va akkaunt tanlash oynalarida.
 * Premium yo'q akkauntda hech narsa chizilmaydi.
 */
export function PremiumBadge({ account }: { account: Pick<TelegramAccount, 'premiumUntil' | 'premiumKunQoldi'> }) {
  if (!account.premiumUntil || account.premiumKunQoldi === null) return null;
  const kun = account.premiumKunQoldi;
  const sana = account.premiumUntil.split('-').reverse().join('.');

  if (kun < 0) {
    return (
      <span className="chip bg-red-500/10 text-red-300" title={`Premium ${sana} da tugagan`}>
        Premium tugagan
      </span>
    );
  }
  if (kun <= OGOHLANTIRISH_KUN) {
    return (
      <span className="chip bg-amber-500/10 text-amber-300" title={`Premium ${sana} gacha`}>
        ⭐ {kun === 0 ? 'bugun tugaydi' : `${kun} kun qoldi`}
      </span>
    );
  }
  return (
    <span className="chip bg-violet-500/10 text-violet-300" title={`Premium ${sana} gacha`}>
      ⭐ Premium
    </span>
  );
}
