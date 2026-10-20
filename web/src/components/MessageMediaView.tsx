import { useEffect, useState } from 'react';
import type { Message } from '@/lib/types';
import { tokenStore } from '@/lib/api';

const KIND_LABEL: Record<string, string> = {
  photo: 'Rasm',
  voice: 'Ovozli xabar',
  audio: 'Audio',
  video: 'Video',
  video_note: 'Video-xabar',
  document: 'Hujjat',
  sticker: 'Stiker',
  other: 'Fayl',
};

const RASM_TURI: Record<string, string> = {
  tolov: 'To\'lov cheki',
  hujjat: 'Hujjat',
  noaniq: 'Turi aniqlanmadi',
};

function humanSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function humanDuration(sec: number | null): string {
  if (!sec) return '';
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Media faylni autentifikatsiya bilan olish kerak, shuning uchun uni
 * blob sifatida yuklab, vaqtinchalik URL yasaymiz (<img src> token yubormaydi).
 */
function useMediaUrl(messageId: string, enabled: boolean): { url: string | null; error: string | null } {
  const [state, setState] = useState<{ url: string | null; error: string | null }>({
    url: null,
    error: null,
  });

  useEffect(() => {
    if (!enabled) return;

    let objectUrl: string | null = null;
    let cancelled = false;

    void fetch(`/api/media/${messageId}`, {
      headers: { Authorization: `Bearer ${tokenStore.get() ?? ''}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`Fayl yuklanmadi (${r.status})`);
        return r.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ url: objectUrl, error: null });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ url: null, error: err.message });
      });

    return () => {
      cancelled = true;
      // Brauzer xotirasida blob qolib ketmasin.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [messageId, enabled]);

  return state;
}

export default function MessageMediaView({ message }: { message: Message }) {
  const media = message.media;
  const hasFile = Boolean(media?.path);
  const { url, error } = useMediaUrl(message.id, hasFile);

  if (!media) return null;

  const label = KIND_LABEL[media.kind] ?? 'Fayl';
  const meta = [humanDuration(media.durationSec), humanSize(media.sizeBytes)].filter(Boolean).join(' · ');

  if (!hasFile) {
    return (
      <div className="mb-1.5 rounded-lg border border-dashed border-ink-600/60 px-3 py-2 text-xs opacity-80">
        {label} — fayl saqlanmagan, Telegramdan ko'ring
      </div>
    );
  }

  return (
    <div className="mb-1.5">
      {media.kind === 'photo' ? (
        error ? (
          <p className="text-xs text-red-300">{error}</p>
        ) : url ? (
          <a href={url} target="_blank" rel="noreferrer">
            <img
              src={url}
              alt={label}
              className="max-h-72 w-auto rounded-lg border border-ink-700 object-contain"
            />
          </a>
        ) : (
          <div className="flex h-32 w-48 items-center justify-center rounded-lg bg-ink-800/60 text-xs opacity-70">
            yuklanmoqda…
          </div>
        )
      ) : media.kind === 'voice' || media.kind === 'audio' ? (
        <div className="space-y-1">
          {url ? (
            <audio controls src={url} className="h-9 w-64 max-w-full" />
          ) : (
            <div className="text-xs opacity-70">{error ?? 'audio yuklanmoqda…'}</div>
          )}
          <p className="text-[10px] opacity-60">
            {label}
            {meta ? ` · ${meta}` : ''}
          </p>
        </div>
      ) : media.kind === 'video' || media.kind === 'video_note' ? (
        url ? (
          <video controls src={url} className="max-h-72 w-auto rounded-lg border border-ink-700" />
        ) : (
          <div className="text-xs opacity-70">{error ?? 'video yuklanmoqda…'}</div>
        )
      ) : (
        <a
          href={url ?? '#'}
          download={media.fileName ?? label}
          className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900/50 px-3 py-2 text-xs hover:bg-ink-800"
        >
          <span className="text-base">📎</span>
          <span className="min-w-0">
            <span className="block truncate">{media.fileName ?? label}</span>
            {meta ? <span className="block text-[10px] opacity-60">{meta}</span> : null}
          </span>
        </a>
      )}

      {message.transcriptStatus === 'failed' ? (
        <p className="mt-1 text-[10px] text-amber-300">
          Ovozni matnga o'girib bo'lmadi — o'zingiz eshiting
        </p>
      ) : null}

      {message.imageKind && message.imageKind !== 'boshqa' ? (
        <p className="mt-1 text-[10px] uppercase tracking-wide opacity-70">
          {RASM_TURI[message.imageKind] ?? message.imageKind}
        </p>
      ) : null}

      {/* Tavsifni VISION yozgan va u mijozning rasmidan o'qilgan — ya'ni
          ishonchsiz matn. Faqat operator ko'radi, agentga ketmaydi.
          Manbasi yozib qo'yiladi: kursiv matn fakt bo'lib ko'rinardi,
          holbuki mijoz rasmga o'qiydigan odamga qaratilgan istalgan
          yozuvni yozib yuborishi mumkin. */}
      {message.imageNote ? (
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[11px] opacity-60">
          Vision (tekshirilmagan): <span className="italic">{message.imageNote}</span>
        </p>
      ) : null}
    </div>
  );
}
