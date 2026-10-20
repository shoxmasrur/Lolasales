import type {
  ISpeechToText,
  TranscriptionInput,
  TranscriptionResult,
} from '@/domain/services/ISpeechToText';
import { config } from '@/shared/config';
import { childLogger } from '@/shared/logger';

const log = childLogger('stt:aisha');

/**
 * Aisha Group STT (aisha.group).
 *
 *   POST {base}/api/v1/stt/post/   — qisqa audio, sinxron
 *   header: X-Api-Key
 *   multipart: audio (fayl), language (uz|en|ru), has_diarization (bool)
 *
 * Javob sxemasi hujjatda ochiq yozilmagan, shuning uchun matn bir nechta
 * mumkin bo'lgan maydondan qidiriladi (transcript / text / result …).
 */
export class AishaSpeechToText implements ISpeechToText {
  readonly available: boolean;

  constructor(
    private readonly apiKey: string | undefined = config.AISHA_API_KEY,
    private readonly baseUrl: string = config.AISHA_BASE_URL,
    private readonly defaultLanguage: string = config.STT_LANGUAGE,
  ) {
    this.available = Boolean(apiKey);
  }

  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    if (!this.apiKey) {
      return { ok: false, reason: 'AISHA_API_KEY sozlanmagan' };
    }

    const maxBytes = config.STT_MAX_MB * 1024 * 1024;
    if (input.audio.byteLength > maxBytes) {
      return { ok: false, reason: `Audio juda katta (${config.STT_MAX_MB} MB dan oshdi)` };
    }

    const form = new FormData();
    form.append(
      'audio',
      new Blob([new Uint8Array(input.audio)], { type: input.mimeType ?? 'application/octet-stream' }),
      input.fileName,
    );
    form.append('language', input.language ?? this.defaultLanguage);
    form.append('has_diarization', 'false');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.STT_TIMEOUT_MS);
    const started = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/stt/post/`, {
        method: 'POST',
        headers: { 'X-Api-Key': this.apiKey, Accept: 'application/json' },
        body: form,
        signal: controller.signal,
      });

      const raw = await response.text();

      if (!response.ok) {
        log.warn({ status: response.status, body: raw.slice(0, 300) }, 'Aisha STT xatosi');
        return { ok: false, reason: `Aisha STT ${response.status}: ${raw.slice(0, 200)}` };
      }

      const text = extractTranscript(raw);
      if (!text) {
        log.warn({ body: raw.slice(0, 300) }, 'Aisha javobidan matn topilmadi');
        return { ok: false, reason: 'Javobda matn topilmadi' };
      }

      log.info(
        { ms: Date.now() - started, chars: text.length, durationSec: input.durationSec },
        'Ovoz matnga o\'girildi',
      );
      return { ok: true, text, language: extractLanguage(raw) };
    } catch (err) {
      const reason =
        err instanceof Error && err.name === 'AbortError'
          ? `STT ${config.STT_TIMEOUT_MS / 1000} soniyada javob bermadi`
          : err instanceof Error
            ? err.message
            : 'Noma\'lum STT xatosi';
      log.error({ err }, 'Aisha STT so\'rovi muvaffaqiyatsiz');
      return { ok: false, reason };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Javob JSON bo'lmasligi ham mumkin — o'sha holda matnning o'zi qaytariladi. */
function extractTranscript(raw: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const plain = raw.trim();
    return plain && plain.length < 10_000 ? plain : null;
  }

  const found = deepFindString(parsed, ['transcript', 'text', 'result', 'transcription', 'content']);
  return found?.trim() || null;
}

function extractLanguage(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const lang = parsed.language ?? parsed.lang;
    return typeof lang === 'string' ? lang : null;
  } catch {
    return null;
  }
}

/** Ichma-ich joylashgan javobdan kerakli kalitni topadi. */
function deepFindString(value: unknown, keys: string[], depth = 0): string | null {
  if (depth > 5 || value === null || value === undefined) return null;

  if (Array.isArray(value)) {
    const parts = value.map((v) => deepFindString(v, keys, depth + 1)).filter(Boolean);
    return parts.length ? parts.join(' ') : null;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of keys) {
      const candidate = obj[key];
      if (typeof candidate === 'string' && candidate.trim()) return candidate;
    }
    for (const key of keys) {
      if (key in obj) {
        const nested = deepFindString(obj[key], keys, depth + 1);
        if (nested) return nested;
      }
    }
    for (const nested of Object.values(obj)) {
      const found = deepFindString(nested, keys, depth + 1);
      if (found) return found;
    }
  }

  return null;
}
