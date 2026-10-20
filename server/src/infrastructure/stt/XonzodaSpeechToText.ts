import type {
  ISpeechToText,
  TranscriptionInput,
  TranscriptionResult,
} from '@/domain/services/ISpeechToText';
import { sleep as standartSleep } from '@/shared/datetime';
import { childLogger } from '@/shared/logger';

const log = childLogger('stt:xonzoda');

/**
 * 429 (GPU band) da kutishlar, ms. Platforma navbatga qo'ymaydi va jonli
 * qo'ng'iroq slotni daqiqalab ushlaydi — bir necha soniyalik urinishlar
 * aynan band paytdagi (kuzatish uchun eng qiziq) natijani yo'qotardi.
 * Ish fonda va ketma-ket, shuning uchun kutishga qurbimiz yetadi.
 * `Retry-After` dan qisqa kutilmaydi.
 */
const BAND_KUTISHLARI = [2_000, 5_000, 15_000, 30_000, 60_000];
/** Bitta kutishning yuqori chegarasi — katta `Retry-After` navbatni soatlab to'xtatmasin. */
const ENG_UZUN_KUTISH = 120_000;
/** 502 (model servisi javob bermadi) da shuncha marta urinish. */
const XATO_URINISHLARI = 3;

export interface XonzodaOptions {
  readonly apiKey: string | undefined;
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  /** Sinovlar uchun. */
  readonly fetchFn?: typeof fetch;
  readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * O'zimizning STT platformasi (XonzodaAI, xonsaroy.adiz.uz).
 *
 *   POST {base}/transcriptions — multipart `file`, header `Authorization: Bearer xs_stt_…`
 *   200 → { text, audio_seconds, ms }; xato → { error: { code, message } }
 *
 * Til yuborilmaydi — model o'zbek/rus tilini o'zi aniqlaydi. Platforma
 * jonli qo'ng'iroqlar bilan bitta GPU'da ishlaydi va bir vaqtda 2 ta
 * so'rovdan ortig'ini navbatga qo'ymay `429` bilan rad etadi — shuning
 * uchun `Retry-After` kutib qayta urinamiz. `502` da ham qayta urinish
 * mumkin (hujjat), qolgan xatolarda yo'q.
 *
 * Kalit FAQAT headerda: URL'dagi kalitni platforma o'zi rad etadi.
 */
export class XonzodaSpeechToText implements ISpeechToText {
  readonly available: boolean;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(private readonly opts: XonzodaOptions) {
    this.available = Boolean(opts.apiKey);
    this.fetchFn = opts.fetchFn ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => standartSleep(ms));
    this.timeoutMs = opts.timeoutMs ?? 120_000;
    // Oxiridagi `/` bilan `//transcriptions` bo'lib qolmasin.
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
  }

  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    if (!this.opts.apiKey) return { ok: false, reason: 'XONZODA_STT_API_KEY sozlanmagan' };

    let bandUrinish = 0;
    let xatoUrinish = 0;
    for (;;) {
      const javob = await this.birMarta(input, this.opts.apiKey);
      if (javob.kind === 'band' && bandUrinish < BAND_KUTISHLARI.length) {
        const kutish = Math.min(ENG_UZUN_KUTISH, Math.max(javob.retryAfterMs, BAND_KUTISHLARI[bandUrinish]!));
        bandUrinish += 1;
        await this.sleep(kutish);
        continue;
      }
      if (javob.kind === 'upstream' && xatoUrinish + 1 < XATO_URINISHLARI) {
        await this.sleep(1000 * 2 ** xatoUrinish);
        xatoUrinish += 1;
        continue;
      }
      return javob.natija;
    }
  }

  private async birMarta(
    input: TranscriptionInput,
    apiKey: string,
  ): Promise<
    | { kind: 'tayyor'; natija: TranscriptionResult }
    | { kind: 'band'; retryAfterMs: number; natija: TranscriptionResult }
    | { kind: 'upstream'; natija: TranscriptionResult }
  > {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(input.audio)], { type: input.mimeType ?? 'application/octet-stream' }),
      input.fileName,
    );

    const timeoutMs = vaqtChegarasi(this.timeoutMs, input.durationSec);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetchFn(`${this.baseUrl}/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        body: form,
        signal: controller.signal,
      });
      const raw = await response.text();

      if (!response.ok) {
        const sabab = `XonzodaAI ${response.status} ${xatoKodi(raw)}`;
        log.warn({ status: response.status, body: raw.slice(0, 300) }, 'XonzodaAI STT xatosi');
        const natija: TranscriptionResult = { ok: false, reason: sabab };
        if (response.status === 429) {
          const soniya = Number(response.headers.get('retry-after') ?? '1');
          return { kind: 'band', retryAfterMs: Math.max(1, Number.isFinite(soniya) ? soniya : 1) * 1000, natija };
        }
        if (response.status === 502) return { kind: 'upstream', natija };
        return { kind: 'tayyor', natija };
      }

      let text = '';
      try {
        const parsed = JSON.parse(raw) as { text?: unknown };
        text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
      } catch {
        return { kind: 'tayyor', natija: { ok: false, reason: 'XonzodaAI javobi JSON emas' } };
      }
      if (!text) return { kind: 'tayyor', natija: { ok: false, reason: 'XonzodaAI nutqni tanimadi' } };
      return { kind: 'tayyor', natija: { ok: true, text, language: null } };
    } catch (err) {
      const reason =
        err instanceof Error && err.name === 'AbortError'
          ? `XonzodaAI ${Math.round(timeoutMs / 1000)} soniyada javob bermadi`
          : err instanceof Error
            ? err.message
            : 'Noma\'lum XonzodaAI xatosi';
      log.warn({ err }, 'XonzodaAI STT so\'rovi muvaffaqiyatsiz');
      return { kind: 'tayyor', natija: { ok: false, reason } };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Platforma javobni shuncha kutadi — undan uzoq kutish ma'nosiz. */
const PLATFORMA_CHEGARASI = 15 * 60_000;

/**
 * So'rovning vaqt chegarasi: kamida sozlamadagi, uzun yozuvda esa
 * davomiylikka mos (sekundiga 2 s). Aks holda uzun audio chegarada
 * uzilib, server esa GPU slotini qo'ng'iroqlardan tortib ishlashda
 * davom etardi — natija behuda "failed" bo'lardi.
 */
export function vaqtChegarasi(asosiyMs: number, durationSec: number | null | undefined): number {
  const davomiylikBoyicha = durationSec && durationSec > 0 ? durationSec * 2_000 : 0;
  return Math.min(PLATFORMA_CHEGARASI, Math.max(asosiyMs, davomiylikBoyicha));
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
