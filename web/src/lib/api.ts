export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const TOKEN_KEY = 'lolasales.token';

export const tokenStore = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (token: string): void => localStorage.setItem(TOKEN_KEY, token),
  clear: (): void => localStorage.removeItem(TOKEN_KEY),
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  const isFormData = init.body instanceof FormData;

  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const body = payload as ApiErrorBody | null;
    if (response.status === 401) tokenStore.clear();
    throw new ApiError(
      body?.error?.message ?? `So'rov bajarilmadi (${response.status})`,
      response.status,
      body?.error?.code ?? 'UNKNOWN',
      body?.error?.details,
    );
  }

  return payload as T;
}

const qs = (params: Record<string, unknown>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    // Ro'yxat TAKRORLANGAN parametr bo'lib ketadi (`a=x&a=y`), vergul
    // bilan emas: qiymatning o'zida vergul bo'lishi mumkin.
    if (Array.isArray(value)) {
      for (const v of value) search.append(key, String(v));
      continue;
    }
    search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : '';
};

export const api = {
  get: <T>(path: string, params?: Record<string, unknown>): Promise<T> =>
    request<T>(`${path}${params ? qs(params) : ''}`),
  post: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown): Promise<T> =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown): Promise<T> =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  // Tana ixtiyoriy: mijozni o'chirishda sabab yuboriladi (jurnalga tushadi).
  delete: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) }),
  upload: <T>(path: string, file: File, fields?: Record<string, string>): Promise<T> => {
    const form = new FormData();
    form.append('file', file);
    for (const [key, value] of Object.entries(fields ?? {})) form.append(key, value);
    return request<T>(path, { method: 'POST', body: form });
  },
  /**
   * Faylni yuklab olish.
   *
   * NEGA ALOHIDA: `request` javobni doim `response.json()` qiladi va
   * `.xlsx` da bu darhol yiqiladi. Bu yerda muvaffaqiyatli javob `blob`
   * bo'lib olinadi, XATO esa baribir JSON — server oqim boshlanishidan
   * oldin tekshiradi, ya'ni 403 va 400 to'liq JSON bo'lib keladi.
   */
  download: async (path: string, params?: Record<string, unknown>): Promise<void> => {
    const token = tokenStore.get();
    const response = await fetch(`/api${path}${params ? qs(params) : ''}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
      if (response.status === 401) tokenStore.clear();
      throw new ApiError(
        body?.error?.message ?? `So'rov bajarilmadi (${response.status})`,
        response.status,
        body?.error?.code ?? 'UNKNOWN',
        body?.error?.details,
      );
    }

    const blob = await response.blob();
    // Fayl nomini server aytadi — sanasi ham o'sha yerda qo'yiladi.
    const disposition = response.headers.get('Content-Disposition') ?? '';
    const nom = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'yuklama.xlsx';

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nom;
    a.click();
    URL.revokeObjectURL(url);
  },
};
