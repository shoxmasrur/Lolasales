import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCan } from '@/store/auth';
import { ErrorNote, Spinner } from '@/components/ui';

interface Props {
  /** Ekrandagi filtrlar — fayl AYNAN shu to'plamni oladi. */
  filtrlar: Record<string, unknown>;
  /** Nechta yozuv ketishi — operator bosishdan oldin ko'rsin. */
  soni: number;
}

/**
 * Mijozlar ro'yxatini Excelga yuklaydi.
 *
 * Ruxsati bo'lmaganda umuman chizilmaydi. Bu faqat interfeysni
 * yashiradi — haqiqiy himoya serverda (`requirePermission`).
 */
export function ClientsExportButton({ filtrlar, soni }: Props) {
  const canExport = useCan('clients.export');
  const download = useMutation({
    mutationFn: () => api.download('/clients/export', filtrlar),
  });

  if (!canExport) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className="btn-ghost text-xs"
        disabled={download.isPending || soni === 0}
        onClick={() => download.mutate()}
        title="Ekrandagi filtr bo'yicha butun ro'yxatni Excel fayl qilib saqlash"
      >
        {download.isPending ? <Spinner /> : null}
        Excelga yuklash{soni > 0 ? ` (${soni})` : ''}
      </button>
      {download.error ? <ErrorNote error={download.error} /> : null}
    </div>
  );
}
