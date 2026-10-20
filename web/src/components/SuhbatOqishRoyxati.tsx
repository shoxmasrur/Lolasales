import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Message, Page } from '@/lib/types';
import { dateUz } from '@/lib/format';
import { EmptyState, ErrorNote, Spinner } from '@/components/ui';
import MessageBubble from '@/components/MessageBubble';

/** Chat sahifasidagi bilan bir xil chegara — undan eski xabarlar kerak bo'lsa chatga o'tiladi. */
export const XABARLAR_LIMITI = 200;

const hechNarsa = (): void => undefined;

/**
 * Suhbatning oxirgi xabarlari — FAQAT O'QISH (sahifadan chiqmasdan).
 *
 * «Qayta aloqa» paneli va «Talabnomalar» → «Batafsil» oynasi ikkalasi shu
 * ro'yxatni chizadi. Yozish chat sahifasida qoladi: ikki joyda yozish
 * qoralama, fayl va tahrir mantiqini ikki marta saqlashni talab qilardi.
 * Shuning uchun `MessageBubble` ning barcha amallari o'chiq.
 *
 * So'rov kaliti chat sahifasi bilan bir xil (`['messages', id]`) — kesh
 * umumiy, chatga o'tilganda xabarlar darhol ko'rinadi.
 *
 * Ildiz — o'zi aylanadigan blok (`overflow-y-auto`): ota-ona unga aniq
 * balandlik berishi kerak (`min-h-0 flex-1`).
 */
export function SuhbatOqishRoyxati({
  conversationId,
  visible = true,
}: {
  conversationId: string;
  /**
   * Ro'yxat ko'rinadimi. Tor ekrandagi tab `display:none` bo'lganda
   * aylantirish ish bermaydi — ko'ringanda qayta pastga tushiriladi.
   */
  visible?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  const messagesQuery = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () =>
      api.get<Page<Message>>(`/conversations/${conversationId}/messages`, { limit: XABARLAR_LIMITI }),
  });

  const messages = messagesQuery.data?.items ?? [];
  const grouped = useMemo(() => kunlargaBol(messages), [messages]);

  // Oxirgi xabar eng muhimi — ochilganda pastga tushiriladi. Faqat shu
  // blok aylantiriladi: `scrollIntoView` ota-ona bloklarni (oyna, sahifa)
  // ham surardi.
  useEffect(() => {
    if (!messagesQuery.isSuccess || !visible) return;
    const el = rootRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messagesQuery.isSuccess, conversationId, messages.length, visible]);

  return (
    <div ref={rootRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
      {messagesQuery.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : messagesQuery.isError ? (
        <ErrorNote error={messagesQuery.error} />
      ) : messages.length === 0 ? (
        <EmptyState title="Xabarlar yo'q" />
      ) : (
        <>
          {messages.length >= XABARLAR_LIMITI ? (
            <p className="pt-3 text-center text-[11px] text-ink-500">
              Oxirgi {XABARLAR_LIMITI} ta xabar ko'rsatilmoqda — eskilari chat sahifasida
            </p>
          ) : null}
          {grouped.map(([day, dayMessages]) => (
            <div key={day} className="space-y-2">
              {/* Yopishqoq sana to'liq kenglikdagi fon bilan: tor panelda u
                  ostidan o'tayotgan xabar matni ustiga tushib, o'qishni buzardi. */}
              <div className="sticky top-0 z-10 -mx-4 flex justify-center bg-ink-900/90 px-4 py-1.5 backdrop-blur-sm">
                <span className="rounded-full border border-ink-800 bg-ink-900 px-2.5 py-0.5 text-[10px] text-ink-500">
                  {dateUz(day)}
                </span>
              </div>
              {dayMessages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  canApprove={false}
                  onApprove={hechNarsa}
                  onEdit={hechNarsa}
                  canEditSent={false}
                  canDelete={false}
                  onEditSent={hechNarsa}
                  onDelete={hechNarsa}
                  busy={false}
                />
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function kunlargaBol(messages: Message[]): Array<[string, Message[]]> {
  const map = new Map<string, Message[]>();
  for (const m of messages) {
    const day = (m.sentAt ?? m.createdAt).slice(0, 10);
    const list = map.get(day) ?? [];
    list.push(m);
    map.set(day, list);
  }
  return [...map.entries()];
}
