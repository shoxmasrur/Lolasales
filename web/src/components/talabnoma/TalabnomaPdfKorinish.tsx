import { useEffect, useState } from 'react';
import { ApiError, tokenStore, type ApiErrorBody } from '@/lib/api';
import { talabnomaXatoMatni } from '@/lib/talabnoma';
import { Spinner } from '@/components/ui';

/**
 * PDF'ni Bearer token bilan blob qilib oladi. Xato JSON bo'lib keladi
 * (masalan, 409 REKVIZIT) — operatorga "yuklanmadi (409)" emas, sababning
 * o'zi ko'rinsin.
 */
async function pdfBlobOl(path: string, signal?: AbortSignal): Promise<Blob> {
  const token = tokenStore.get();
  const r = await fetch(`/api${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal,
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => null)) as ApiErrorBody | null;
    if (r.status === 401) tokenStore.clear();
    throw new ApiError(
      body?.error?.message ?? `PDF yuklanmadi (${r.status})`,
      r.status,
      body?.error?.code ?? 'UNKNOWN',
      body?.error?.details,
    );
  }
  return r.blob();
}

/**
 * PDF'ni token bilan olib, fayl sifatida yuklab beradi (`<a download>`):
 * oddiy havola token yubormaydi. Xato `ApiError` bo'lib tashlanadi.
 */
export async function pdfYuklabOl(path: string, faylNomi: string): Promise<void> {
  const url = URL.createObjectURL(await pdfBlobOl(path));
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = faylNomi;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Brauzer yuklashni boshlab olishi uchun biroz kutib tozalaymiz.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

/**
 * Ko'rinish uchun blob URL (`useMediaUrl` naqshi):
 * `<iframe src>` o'zi token yubormaydi, server esa `talabnoma.view` talab
 * qiladi. `kalit` o'zgarsa qayta yuklanadi — qayta urinishdan keyin PDF
 * yangisidan chiqadi, yo'l esa o'sha.
 */
function usePdfUrl(path: string, kalit: string): { url: string | null; error: string | null } {
  const [state, setState] = useState<{ url: string | null; error: string | null }>({ url: null, error: null });

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    // Tashlab ketilgan ko'rinish so'rovi uziladi: aks holda tez-tez qator
    // almashtirganda serverda keraksiz Chrome renderlari navbatga tushardi.
    const ctrl = new AbortController();
    setState({ url: null, error: null });

    void pdfBlobOl(path, ctrl.signal)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ url: objectUrl, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ url: null, error: talabnomaXatoMatni(err) });
      });

    return () => {
      cancelled = true;
      ctrl.abort();
      // Brauzer xotirasida blob qolib ketmasin.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, kalit]);

  return state;
}

export function TalabnomaPdfKorinish({ path, kalit = '', title }: { path: string; kalit?: string; title: string }) {
  const { url, error } = usePdfUrl(path, kalit);

  if (error) {
    return (
      <div className="m-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
        {error}
      </div>
    );
  }
  if (!url) {
    // Ko'rinish serverda Chrome bilan chiziladi — bir necha soniya ketadi.
    return (
      <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-2 text-xs text-ink-500">
        <Spinner />
        PDF tayyorlanmoqda…
      </div>
    );
  }
  return <iframe src={url} title={title} className="h-full min-h-[60vh] w-full rounded-lg border border-ink-800 bg-white lg:min-h-0" />;
}
