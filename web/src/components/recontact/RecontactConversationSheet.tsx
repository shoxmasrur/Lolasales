import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { dateUz, som } from '@/lib/format';
import { Sheet } from '@/components/Sheet';
import { SuhbatOqishRoyxati } from '@/components/SuhbatOqishRoyxati';
import {
  PROMISE_STATUS_LABEL,
  RECONTACT_KIND_COLOR,
  RECONTACT_KIND_LABEL,
  type RecontactItem,
} from '@/lib/recontact';

/**
 * Qayta aloqa ro'yxatidan suhbatni SAHIFADAN CHIQMASDAN o'qish.
 *
 * Operator kimga yozdirishni tanlashdan oldin suhbatni to'liq ko'rishi
 * kerak: "oxirgi xabar" ustuni bitta qatorni ko'rsatadi, qaror esa butun
 * tarixga bog'liq. Chatga o'tib qaytish ro'yxat holatini (filtr, belgilar)
 * yo'qotardi.
 *
 * FAQAT O'QISH: yozish chat sahifasida qoladi. Ikki joyda yozish qoralama,
 * fayl va tahrir mantiqini ikki marta saqlashni talab qilardi. Shuning
 * uchun `MessageBubble` ning barcha amallari o'chiq (`SuhbatOqishRoyxati`).
 */
export function RecontactConversationSheet({
  item,
  checked,
  canSelect,
  onToggle,
  onClose,
}: {
  item: RecontactItem | null;
  checked: boolean;
  canSelect: boolean;
  onToggle: (next: boolean) => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  return (
    <Sheet
      open={Boolean(item)}
      onClose={onClose}
      variant="right"
      rightWidth="md:w-[36rem]"
      title={item?.clientName}
    >
      {item ? (
        // Telefonda panel faqat `max-h` bilan cheklangan, ya'ni `h-full`
        // aniq balandlik bermaydi va BUTUN mazmun bitta bo'lib aylanardi:
        // pastdagi "belgilash" va "Chatda ochish" ekrandan tushib ketardi.
        // Aniq balandlik bilan faqat xabarlar ro'yxati aylanadi.
        <div className="flex h-[78dvh] min-h-0 flex-col md:h-full">
          {/* Sarlavha ostidagi ma'lumot. Ajratuvchi "·" belgilari ATAYLAB yo'q:
              tor ekranda qator uzilganda ular yangi qator boshida osilib qolardi. */}
          <div className="shrink-0 space-y-1.5 border-b border-ink-800 px-4 py-3 text-xs">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className={clsx('chip whitespace-nowrap', RECONTACT_KIND_COLOR[item.kind])}>
                {RECONTACT_KIND_LABEL[item.kind]}
              </span>
              <span className="whitespace-nowrap font-medium tabular-nums text-red-300">{som(item.overdue)}</span>
              <span className="whitespace-nowrap text-ink-500">{item.silentWorkDays} ish kuni jim</span>
            </div>
            {item.lastPromise ? (
              <p className="text-ink-400">
                Oxirgi va'da: {dateUz(item.lastPromise.date)},{' '}
                <span className="tabular-nums">{som(item.lastPromise.amount)}</span> —{' '}
                {PROMISE_STATUS_LABEL[item.lastPromise.status] ?? item.lastPromise.status}
              </p>
            ) : null}
          </div>

          <SuhbatOqishRoyxati conversationId={item.conversationId} />

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-ink-800 px-4 py-3">
            {canSelect ? (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-200">
                <input type="checkbox" checked={checked} onChange={(e) => onToggle(e.target.checked)} />
                Qayta aloqa uchun belgilash
              </label>
            ) : (
              <span />
            )}
            <button
              type="button"
              className="btn-ghost text-sm"
              onClick={() => navigate(`/chat/${item.conversationId}`)}
            >
              Chatda ochish →
            </button>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
