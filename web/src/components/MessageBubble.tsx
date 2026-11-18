import { useState } from 'react';
import clsx from 'clsx';

import MessageMediaView from '@/components/MessageMediaView';
import type { Message } from '@/lib/types';
import { timeShort } from '@/lib/format';

/** Telegramda chiquvchi xabarni tahrirlash oynasi — server ham shuni tekshiradi. */
const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;

const STATUS_LABEL: Record<string, string> = {
  queued: 'navbatda',
  sending: 'yuborilmoqda',
  sent: 'yuborildi',
  delivered: 'yetkazildi',
  read: 'o\'qildi',
  failed: 'xato',
};

/** Xabarni hali tahrirlash mumkinmi. */
export function tahrirlasaBoladi(message: Message, hozir: number): boolean {
  if (message.direction !== 'out') return false;
  if (message.revokedAt) return false;
  if (message.status === 'draft') return false;
  // Rasm va fayl izohini o'zgartirish qamrovga kirmaydi.
  if (message.media) return false;
  // Telegramga ketmagan xabarda oyna tushunchasi yo'q. Web tipida
  // `telegramMsgId` yo'q, shuning uchun faqat `sentAt` tekshiriladi — bu
  // yetarli, chunki serverda (`MessageDispatcher`) ikkalasi FAQAT birga
  // yoziladi: `sentAt` borligi `telegramMsgId` ham borligini bildiradi.
  // `EditMessageUseCase.ts`dagi oyna tekshiruvi — bu yerning ko'zgusi.
  if (!message.sentAt) return true;
  return hozir - new Date(message.sentAt).getTime() <= EDIT_WINDOW_MS;
}

export default function MessageBubble({
  message,
  canApprove,
  onApprove,
  onEdit,
  canEditSent,
  canDelete,
  onEditSent,
  onDelete,
  busy,
}: {
  message: Message;
  canApprove: boolean;
  onApprove: (body: string) => void;
  onEdit: (body: string) => void;
  canEditSent: boolean;
  canDelete: boolean;
  onEditSent: (body: string) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const inbound = message.direction === 'in';
  const isDraft = message.status === 'draft';
  const revoked = message.revokedAt !== null;

  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(message.body);
  const [confirming, setConfirming] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [showRevoked, setShowRevoked] = useState(false);

  const canShowEdit = canEditSent && tahrirlasaBoladi(message, Date.now());
  const canShowDelete = canDelete && !inbound && !isDraft && !revoked;

  // O'chirilgan xabar ro'yxatdan yo'qolmaydi: rahbar kim nima yozganini
  // ko'ra olishi kerak. Mijozdan olib tashlash buni bekor qilmaydi.
  if (revoked) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-2xl rounded-br-md border border-dashed border-ink-600 px-3.5 py-2 text-sm text-ink-400">
          <p className="text-[11px] italic">Xabar o'chirildi · {timeShort(message.revokedAt!)}</p>
          {showRevoked ? (
            <p className="mt-1 whitespace-pre-wrap break-words text-[12px] opacity-70">{message.body}</p>
          ) : null}
          <button
            type="button"
            className="mt-1 text-[10px] underline opacity-70 hover:opacity-100"
            onClick={() => setShowRevoked((v) => !v)}
          >
            {showRevoked ? 'Yashirish' : 'Ko\'rsatish'}
          </button>
        </div>
      </div>
    );
  }

  // Operatorning agentga topshirig'i — mijozga ketmagan ichki qayd. Chat
  // o'rtasida, pufakchasiz: operator uni yuborilgan xabar deb adashtirmasin.
  if (message.direction === 'note') {
    const by = typeof message.meta?.by === 'string' ? message.meta.by : null;
    return (
      <div className="flex justify-center">
        <div className="max-w-[85%] rounded-lg border border-dashed border-ink-700 bg-ink-900/60 px-3 py-1.5 text-center text-xs text-ink-300">
          <p className="text-[10px] uppercase tracking-wide text-ink-500">
            Agentga topshiriq{by ? ` · ${by}` : ''} · {timeShort(message.createdAt)} · mijoz ko'rmaydi
          </p>
          <p className="mt-0.5 whitespace-pre-wrap break-words">{message.body}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('group flex', inbound ? 'justify-start' : 'justify-end')}>
      <div
        className={clsx(
          'max-w-[75%] rounded-2xl px-3.5 py-2 text-sm',
          inbound
            ? 'rounded-bl-md bg-ink-800 text-ink-100'
            : isDraft
              ? 'rounded-br-md border border-dashed border-amber-500/50 bg-amber-500/10 text-amber-100'
              : message.status === 'failed'
                ? 'rounded-br-md border border-red-500/40 bg-red-500/10 text-red-100'
                : 'rounded-br-md bg-brand-600 text-white',
        )}
      >
        {!inbound ? (
          <p className="mb-0.5 text-[10px] uppercase tracking-wide opacity-70">
            {message.author === 'agent' ? (isDraft ? 'Agent qoralamasi' : 'Agent') : 'Operator'}
          </p>
        ) : null}

        <MessageMediaView message={message} />

        {message.transcript ? (
          <div className="mb-1 border-l-2 border-current/30 pl-2">
            <p className="text-[10px] uppercase tracking-wide opacity-60">Ovozdan matn</p>
            <p className="whitespace-pre-wrap break-words italic">{message.transcript}</p>
          </div>
        ) : null}

        {/* XonzodaAI — faqat solishtirish uchun: agentga Nai matni boradi. */}
        {message.xonzoda ? (
          <div className="mb-1 border-l-2 border-current/15 pl-2 opacity-70">
            <p className="text-[10px] uppercase tracking-wide opacity-60">
              XonzodaAI{message.xonzoda.ms !== null ? ` · ${(message.xonzoda.ms / 1000).toFixed(1)} s` : ''}
            </p>
            {message.xonzoda.status === 'done' ? (
              <p className="whitespace-pre-wrap break-words text-[12px] italic">{message.xonzoda.text}</p>
            ) : (
              <p className="text-[11px] text-amber-300">
                Tanilmadi{message.xonzoda.error ? ` (${message.xonzoda.error})` : ''}
              </p>
            )}
          </div>
        ) : null}

        {editing ? (
          <div className="mt-1">
            <textarea
              className="w-full rounded-md bg-black/20 p-2 text-sm text-white outline-none"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="mt-1.5 flex gap-1.5">
              <button
                type="button"
                disabled={busy || !text.trim()}
                className="rounded-md bg-white/20 px-2 py-1 text-[11px] font-medium hover:bg-white/30 disabled:opacity-50"
                onClick={() => {
                  onEditSent(text.trim());
                  setEditing(false);
                }}
              >
                Saqlash
              </button>
              <button
                type="button"
                className="rounded-md border border-white/30 px-2 py-1 text-[11px] hover:bg-white/10"
                onClick={() => {
                  setText(message.body);
                  setEditing(false);
                }}
              >
                Bekor qilish
              </button>
            </div>
          </div>
        ) : message.body.trim() ? (
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
        ) : null}

        {message.editedAt && !editing ? (
          <button
            type="button"
            className="mt-0.5 text-[10px] italic underline opacity-60 hover:opacity-100"
            onClick={() => setShowOriginal((v) => !v)}
          >
            tuzatilgan
          </button>
        ) : null}

        {showOriginal && message.originalBody ? (
          <p className="mt-1 whitespace-pre-wrap break-words border-l-2 border-current/30 pl-2 text-[12px] opacity-70">
            {message.originalBody}
          </p>
        ) : null}

        {isDraft && canApprove ? (
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              className="rounded-md bg-amber-500 px-2 py-1 text-[11px] font-medium text-amber-950 hover:bg-amber-600"
              onClick={() => onApprove(message.body)}
            >
              Tasdiqlab yuborish
            </button>
            <button
              type="button"
              className="rounded-md border border-amber-500/40 px-2 py-1 text-[11px] hover:bg-amber-500/10"
              onClick={() => onEdit(message.body)}
            >
              Tahrirlash
            </button>
          </div>
        ) : null}

        {confirming ? (
          <div className="mt-2 rounded-md bg-black/25 p-2">
            <p className="text-[11px]">
              Bu xabar mijozning Telegramidan ham o'chadi. Qaytarib bo'lmaydi.
            </p>
            <div className="mt-1.5 flex gap-1.5">
              <button
                type="button"
                disabled={busy}
                className="rounded-md bg-red-500 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-600 disabled:opacity-50"
                onClick={() => {
                  onDelete();
                  setConfirming(false);
                }}
              >
                O'chirish
              </button>
              <button
                type="button"
                className="rounded-md border border-white/30 px-2 py-1 text-[11px] hover:bg-white/10"
                onClick={() => setConfirming(false)}
              >
                Bekor qilish
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-1 flex items-center gap-1.5 text-[10px] opacity-60">
          <span>{timeShort(message.sentAt ?? message.createdAt)}</span>
          {!inbound && !isDraft ? (
            message.readAt ? (
              <span title={`Telegramda o'qilgan: ${timeShort(message.readAt)}`}>
                · o'qildi {timeShort(message.readAt)}
              </span>
            ) : (
              <span>· {STATUS_LABEL[message.status] ?? message.status}</span>
            )
          ) : null}

          {/* Qaysi til modeli javob yozgani — faqat chiquvchi agent
              xabarida bo'ladi (`meta.llmModel`), server yozgan.
              Tamg'asiz eski xabarlarda (`meta` bo'sh yoki maydon yo'q)
              hech narsa chiqmaydi — taxmin qilinmaydi. */}
          {typeof message.meta?.llmModel === 'string' && (
            <span className="text-[10px] opacity-60">
              {message.meta.llmFallback
                ? `${message.meta.llmModel} ← qaytish`
                : String(message.meta.llmModel)}
            </span>
          )}

          {/* Tugmalar faqat AMAL MUMKIN bo'lganda ko'rinadi. 48 soat o'tgan
              xabarda tahrirlash tugmasi umuman chizilmaydi: server baribir
              rad etadi, tugmani ko'rsatish esa yolg'on va'da bo'lardi. */}
          {canShowEdit && !editing ? (
            <button
              type="button"
              className="ml-1 underline opacity-0 transition group-hover:opacity-100 max-md:opacity-100 [@media(hover:none)]:opacity-100"
              // `text` mount vaqtida bir marta o'rnatiladi, komponent esa
              // tahrirlar orasida qayta mount bo'lmaydi — shuning uchun
              // birinchi saqlashdan keyin eski qiymat qolib ketadi. Har
              // safar tahrirlash OCHILGANDA joriy `message.body`dan qayta
              // urug'lantiramiz, effektga tayanmasdan (effekt esa
              // tashqi yangilanish kelganda operator yozayotgan matnni
              // bosib ketardi).
              onClick={() => {
                setText(message.body);
                setEditing(true);
              }}
            >
              tahrirlash
            </button>
          ) : null}
          {canShowDelete && !confirming ? (
            <button
              type="button"
              className="underline opacity-0 transition group-hover:opacity-100 max-md:opacity-100 [@media(hover:none)]:opacity-100"
              onClick={() => setConfirming(true)}
            >
              o'chirish
            </button>
          ) : null}
        </div>

        {message.error ? <p className="mt-1 text-[10px] text-red-300">{message.error}</p> : null}
      </div>
    </div>
  );
}
