import type {
  ISpeechToText,
  TranscriptionInput,
  TranscriptionResult,
} from '@/domain/services/ISpeechToText';
import { sleep } from '@/shared/datetime';
import { config } from '@/shared/config';
import { childLogger } from '@/shared/logger';

const log = childLogger('stt:nai');

/** 429 (limit) va 503 da shuncha marta qayta uriniladi. */
const QAYTA_URINISH = 3;
/** `Retry-After` katta bo'lsa ham shundan ko'p kutilmaydi. */
const ENG_UZUN_KUTISH_MS = 30_000;

/**
 * Nai.uz STT (docs.neuronai.uz).
 *
 *   POST {base}/stt/transcribe — multipart `file`, `language` (uz|ru|en|auto …)
 *   header: Authorization: Bearer nai_…
 *   200 → { data: { text, language, duration_seconds, segments[] }, request_id }
 *   xato → { error: { type, code, message }, request_id }
 *
 * Fayl chegarasi — 25 MB. Hisob soniya bo'yicha; `transcription_failed` da pul yechilmaydi.
 */
export class NaiSpeechToText implements ISpeechToText {
  readonly available: boolean;
  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string | undefined = config.NAI_STT_API_KEY,
    baseUrl: string = config.NAI_STT_BASE_URL,
    private readonly defaultLanguage: string = config.STT_LANGUAGE,
  ) {
    this.available = Boolean(apiKey);
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    if (!this.apiKey) {
      return { ok: false, reason: 'NAI_STT_API_KEY sozlanmagan' };
    }

    const maxMb = Math.min(config.STT_MAX_MB, 25);
    if (input.audio.byteLength > maxMb * 1024 * 1024) {
      return { ok: false, reason: `Audio juda katta (${maxMb} MB dan oshdi)` };
    }

    for (let urinish = 0; ; urinish += 1) {
      const javob = await this.birMarta(input, this.apiKey);
      if (javob.qaytaUrinsin && urinish < QAYTA_URINISH) {
        await sleep(Math.min(ENG_UZUN_KUTISH_MS, Math.max(javob.kutishMs, 1000 * 2 ** urinish)));
        continue;
      }
      return javob.natija;
    }
  }

  private async birMarta(
    input: TranscriptionInput,
    apiKey: string,
  ): Promise<{ natija: TranscriptionResult; qaytaUrinsin: boolean; kutishMs: number }> {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(input.audio)], { type: input.mimeType ?? 'application/octet-stream' }),
      input.fileName,
    );
    form.append('language', input.language ?? this.defaultLanguage);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.STT_TIMEOUT_MS);
    const started = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/stt/transcribe`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        body: form,
        signal: controller.signal,
      });
      const raw = await response.text();

      if (!response.ok) {
        const kod = xatoKodi(raw);
        log.warn({ status: response.status, kod, body: raw.slice(0, 300) }, 'Nai STT xatosi');
        const soniya = Number(response.headers.get('retry-after') ?? '1');
        return {
          natija: { ok: false, reason: `Nai STT ${response.status} ${kod}`.trim() },
          qaytaUrinsin: response.status === 429 || response.status === 503,
          kutishMs: (Number.isFinite(soniya) ? Math.max(1, soniya) : 1) * 1000,
        };
      }

      let text = '';
      let language: string | null = null;
      try {
        const data = (JSON.parse(raw) as { data?: { text?: unknown; language?: unknown } }).data;
        text = typeof data?.text === 'string' ? data.text.trim() : '';
        language = typeof data?.language === 'string' ? data.language : null;
      } catch {
        return { natija: { ok: false, reason: 'Nai STT javobi JSON emas' }, qaytaUrinsin: false, kutishMs: 0 };
      }
      if (!text) {
        log.warn({ body: raw.slice(0, 300) }, 'Nai javobidan matn topilmadi');
        return { natija: { ok: false, reason: 'Javobda matn topilmadi' }, qaytaUrinsin: false, kutishMs: 0 };
      }

      log.info(
        { ms: Date.now() - started, chars: text.length, durationSec: input.durationSec },
        'Ovoz matnga o\'girildi',
      );
      return { natija: { ok: true, text, language }, qaytaUrinsin: false, kutishMs: 0 };
    } catch (err) {
      const reason =
        err instanceof Error && err.name === 'AbortError'
          ? `STT ${config.STT_TIMEOUT_MS / 1000} soniyada javob bermadi`
          : err instanceof Error
            ? err.message
            : 'Noma\'lum STT xatosi';
      log.error({ err }, 'Nai STT so\'rovi muvaffaqiyatsiz');
      return { natija: { ok: false, reason }, qaytaUrinsin: false, kutishMs: 0 };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** `{"error":{"code":"…"}}` dan kod; topilmasa bo'sh qator. */
function xatoKodi(raw: string): string {
  try {
    const code = (JSON.parse(raw) as { error?: { code?: unknown } }).error?.code;
    return typeof code === 'string' ? code : '';
  } catch {
    return '';
  }
}
