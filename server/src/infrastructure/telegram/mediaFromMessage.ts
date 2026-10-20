import { Api, type TelegramClient } from 'teleproto';
import type { MediaKind } from '@/domain/entities/Message';
import type { IncomingMedia } from '@/domain/services/ITelegramGateway';

/** MTProto media obyektidan atribut olish. */
function attributes(doc: Api.Document): Api.TypeDocumentAttribute[] {
  return doc.attributes ?? [];
}

function findAudio(doc: Api.Document): Api.DocumentAttributeAudio | undefined {
  return attributes(doc).find((a): a is Api.DocumentAttributeAudio => a instanceof Api.DocumentAttributeAudio);
}

function findVideo(doc: Api.Document): Api.DocumentAttributeVideo | undefined {
  return attributes(doc).find((a): a is Api.DocumentAttributeVideo => a instanceof Api.DocumentAttributeVideo);
}

function findFileName(doc: Api.Document): string | null {
  const attr = attributes(doc).find(
    (a): a is Api.DocumentAttributeFilename => a instanceof Api.DocumentAttributeFilename,
  );
  return attr?.fileName ?? null;
}

function isSticker(doc: Api.Document): boolean {
  return attributes(doc).some((a) => a instanceof Api.DocumentAttributeSticker);
}

/** Stikerdagi emoji. Telegram uni `alt` maydonida beradi. */
function stickerAltOf(doc: Api.Document): string | null {
  const attr = attributes(doc).find((a) => a instanceof Api.DocumentAttributeSticker);
  const alt = (attr as Api.DocumentAttributeSticker | undefined)?.alt;
  return alt && alt.trim() ? alt : null;
}

/** MIME turiga qarab kengaytma — Telegram har doim fayl nomini bermaydi. */
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-wav': 'wav',
  'audio/wav': 'wav',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'application/pdf': 'pdf',
};

export function extensionFor(mimeType: string | null, fallback = 'bin'): string {
  if (!mimeType) return fallback;
  return EXT_BY_MIME[mimeType.toLowerCase()] ?? mimeType.split('/')[1]?.replace(/[^a-z0-9]/gi, '') ?? fallback;
}

/**
 * Telegram xabaridan media ma'lumotini ajratadi.
 * Fayl darhol yuklanmaydi — `download()` chaqirilganda tushiriladi.
 */
export function mediaFromMessage(
  client: TelegramClient,
  message: Api.Message,
): IncomingMedia | null {
  const media = message.media;
  if (!media) return null;

  const download = async (): Promise<Buffer> => {
    const data = await client.downloadMedia(message, {});
    if (!data) throw new Error('Faylni yuklab bo\'lmadi');
    return Buffer.isBuffer(data) ? data : Buffer.from(data as unknown as ArrayBuffer);
  };

  if (media instanceof Api.MessageMediaPhoto) {
    const photo = media.photo instanceof Api.Photo ? media.photo : null;
    const largest = photo?.sizes
      ?.filter((s): s is Api.PhotoSize => s instanceof Api.PhotoSize)
      .sort((a, b) => (a.size ?? 0) - (b.size ?? 0))
      .at(-1);

    return {
      kind: 'photo',
      mimeType: 'image/jpeg',
      fileName: null,
      sizeBytes: largest?.size ?? null,
      durationSec: null,
      stickerAlt: null,
      download,
    };
  }

  if (media instanceof Api.MessageMediaDocument) {
    const doc = media.document instanceof Api.Document ? media.document : null;
    if (!doc) return null;

    const mimeType = doc.mimeType ?? null;
    const sizeBytes = doc.size ? Number(doc.size) : null;
    const audio = findAudio(doc);
    const video = findVideo(doc);
    const fileName = findFileName(doc);

    let kind: MediaKind = 'document';
    let durationSec: number | null = null;
    let stickerAlt: string | null = null;

    if (audio) {
      // `voice` — mikrofonga yozilgan xabar, `audio` — yuklangan musiqa/fayl.
      kind = audio.voice ? 'voice' : 'audio';
      durationSec = audio.duration ?? null;
    } else if (video) {
      kind = video.roundMessage ? 'video_note' : 'video';
      durationSec = video.duration ?? null;
    } else if (isSticker(doc)) {
      kind = 'sticker';
      stickerAlt = stickerAltOf(doc);
    } else if (mimeType?.startsWith('image/')) {
      kind = 'photo';
    }

    return { kind, mimeType, fileName, sizeBytes, durationSec, stickerAlt, download };
  }

  // Geolokatsiya, kontakt, so'rovnoma va h.k. — faylsiz.
  return {
    kind: 'other',
    mimeType: null,
    fileName: null,
    sizeBytes: null,
    durationSec: null,
    stickerAlt: null,
    download: async () => {
      throw new Error('Bu turdagi media yuklab olinmaydi');
    },
  };
}
