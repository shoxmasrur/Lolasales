/**
 * Debitor REST API ustidagi yupqa mijoz.
 *
 * MCP server bazaga TO'G'RIDAN-TO'G'RI tegmaydi — barcha so'rovlar API orqali
 * o'tadi. Shunda rol/ruxsat tekshiruvi, kill switch, limitlar va audit jurnali
 * o'z-o'zidan ishlaydi va biznes mantiq ikki joyda takrorlanmaydi.
 */

export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class DebitorApi {
  constructor(private readonly config: ApiConfig) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(`${this.config.baseUrl}/api${path}`, {
        ...init,
        headers: {
          'X-Api-Key': this.config.apiKey,
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
        signal: controller.signal,
      });

      const text = await response.text();
      const payload: unknown = text ? JSON.parse(text) : null;

      if (!response.ok) {
        const err = (payload as { error?: { message?: string; code?: string } } | null)?.error;
        throw new ApiError(
          err?.message ?? `So'rov bajarilmadi (${response.status})`,
          response.status,
          err?.code ?? 'UNKNOWN',
        );
      }

      return payload as T;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ApiError('Server javob bermadi (timeout)', 504, 'TIMEOUT');
      }
      throw new ApiError(
        err instanceof Error ? err.message : 'Serverga ulanib bo\'lmadi',
        503,
        'UNAVAILABLE',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value === undefined || value === null || value === '') continue;
      search.set(key, String(value));
    }
    const qs = search.toString();
    return this.request<T>(`${path}${qs ? `?${qs}` : ''}`);
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
  }
}
