import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCan } from '@/store/auth';
import type { ImportBatch, Page } from '@/lib/types';
import { relative } from '@/lib/format';
import { EmptyState, ErrorNote, Spinner } from '@/components/ui';

interface ImportResult {
  batch: ImportBatch;
  warnings: string[];
  created: number;
  existing: number;
  totalRows: number;
}

/**
 * Importni qaytarish tugmasi.
 *
 * Noto'g'ri fayl yuklanishi — oddiy hodisa, va u minglab mijoz yaratib
 * yuborishi mumkin. Shuning uchun har bir import yozuvi yonida qaytarish
 * turadi: u SHU import yaratgan mijozlarni ro'yxatlardan
 * chiqaradi (bazadan o'chirmaydi). Allaqachon bor edi deb o'tkazilgan
 * mijozlarga tegilmaydi.
 */
function UndoButton({ batch }: { batch: ImportBatch }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['import-batches'] });
    void queryClient.invalidateQueries({ queryKey: ['clients'] });
    void queryClient.invalidateQueries({ queryKey: ['client-tab-counts'] });
    void queryClient.invalidateQueries({ queryKey: ['stats'] });
  };

  const preview = useQuery({
    queryKey: ['import-undo-preview', batch.id],
    queryFn: () =>
      api.get<{ preview: { clients: number } }>(
        `/import/batches/${batch.id}/undo-preview`,
      ),
    enabled: confirming,
  });

  const undo = useMutation({
    mutationFn: () => api.post(`/import/batches/${batch.id}/undo`),
    onSuccess: () => {
      setConfirming(false);
      refresh();
    },
  });

  const restore = useMutation({
    mutationFn: () => api.post(`/import/batches/${batch.id}/restore`),
    onSuccess: refresh,
  });

  if (batch.undoneAt) {
    return (
      <div className="flex items-center justify-end gap-2">
        <span className="chip bg-amber-500/15 text-amber-300" title={batch.undoneBy ?? undefined}>
          qaytarilgan
        </span>
        <button
          type="button"
          className="text-[11px] text-brand-400 hover:underline"
          disabled={restore.isPending}
          onClick={() => restore.mutate()}
        >
          {restore.isPending ? 'tiklanmoqda…' : 'tiklash'}
        </button>
      </div>
    );
  }

  if (batch.kind !== 'leads') return <span className="text-[11px] text-ink-700">—</span>;

  if (!confirming) {
    return (
      <button
        type="button"
        className="text-[11px] text-ink-400 hover:text-red-300 hover:underline"
        onClick={() => setConfirming(true)}
      >
        qaytarish
      </button>
    );
  }

  const p = preview.data?.preview;

  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-2 text-left">
      {preview.isLoading || !p ? (
        <p className="text-[11px] text-ink-500">Hisoblanmoqda…</p>
      ) : (
        <p className="text-[11px] text-ink-300">
          <span className="font-semibold tabular-nums">{p.clients}</span> ta mijoz
          ro'yxatlardan chiqadi. Ma'lumot bazada qoladi.
        </p>
      )}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className="btn-ghost flex-1 !py-1 text-[11px] text-red-300 hover:bg-red-500/10"
          disabled={undo.isPending || preview.isLoading}
          onClick={() => undo.mutate()}
        >
          {undo.isPending ? <Spinner /> : null}
          Qaytarilsin
        </button>
        <button
          type="button"
          className="btn-ghost flex-1 !py-1 text-[11px]"
          onClick={() => setConfirming(false)}
        >
          Bekor
        </button>
      </div>
      {undo.error ? (
        <div className="mt-1.5">
          <ErrorNote error={undo.error} />
        </div>
      ) : null}
    </div>
  );
}

export default function ImportPage() {
  const queryClient = useQueryClient();
  const writable = useCan('import.run');
  const canUndo = useCan('import.undo');
  const [result, setResult] = useState<ImportResult | null>(null);

  const batchesQuery = useQuery({
    queryKey: ['import-batches'],
    queryFn: () => api.get<Page<ImportBatch>>('/import/batches'),
  });

  const upload = useMutation({
    mutationFn: (file: File) => api.upload<ImportResult>('/import/leads', file),
    onSuccess: (data) => {
      setResult(data);
      void queryClient.invalidateQueries({ queryKey: ['import-batches'] });
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
      void queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="hidden border-b border-ink-800 px-4 py-3 md:block md:px-6 md:py-4">
        <h1 className="text-base font-semibold">Import</h1>
        <p className="mt-0.5 text-xs text-ink-500">
          Mijozlar ro'yxatini yuklash (.xlsx yoki .csv)
        </p>
      </header>

      <div className="space-y-5 p-4 md:p-6">
        <UploadCard
          title="Mijozlar ro'yxati"
          description="Ustunlar: Ism, Telefon va (ixtiyoriy) Kurs. Har bir yangi raqam 'Raqam' manbali mijoz bo'ladi; bazada bor raqamlar o'zgarmaydi. Kurs nomi kurslar ro'yxati bilan solishtiriladi. Fayl qayta yuklansa — dublikat yaratilmaydi."
          accept=".xlsx,.xlsm,.csv"
          disabled={!writable || upload.isPending}
          onFile={(file) => upload.mutate(file)}
        />

        {upload.isPending ? (
          <div className="card flex items-center gap-3">
            <Spinner />
            <span className="text-sm text-ink-300">Fayl qayta ishlanmoqda… </span>
          </div>
        ) : null}

        {upload.error ? <ErrorNote error={upload.error} /> : null}

        {result ? (
          <div className="card space-y-3">
            <h2 className="text-sm font-medium">Import natijasi — {result.batch.filename}</h2>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label="Jami qator" value={result.totalRows} />
              <Metric label="Yangi mijoz" value={result.created} tone="good" />
              <Metric label="Allaqachon bor" value={result.existing} />
              <Metric label="Xatolar" value={result.batch.rowsFailed} tone={result.batch.rowsFailed ? 'bad' : 'default'} />
            </div>

            {result.warnings.map((w, i) => (
              <p
                key={i}
                className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
              >
                {w}
              </p>
            ))}

            {result.batch.errors.length ? (
              <details className="rounded-lg border border-ink-800 bg-ink-950/50 p-3">
                <summary className="cursor-pointer text-xs text-ink-400">
                  Xato qatorlar ({result.batch.errors.length})
                </summary>
                <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-[11px] text-ink-500">
                  {result.batch.errors.map((e, i) => (
                    <li key={i}>
                      <span className="font-mono text-ink-400">{e.row}-qator:</span> {e.reason}
                      {e.value ? <span className="text-ink-600"> ({e.value})</span> : null}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}

        <div>
          <h2 className="mb-2 text-sm font-medium text-ink-200">Import tarixi</h2>
          {batchesQuery.isLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : !batchesQuery.data?.items.length ? (
            <EmptyState title="Hali import qilinmagan" />
          ) : (
            <div className="table-wrap rounded-xl border border-ink-800">
              <table className="w-full text-sm">
                <thead className="bg-ink-900/60 text-[11px] uppercase tracking-wide text-ink-500">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Fayl</th>
                    <th className="px-3 py-2 text-left font-medium">Tur</th>
                    <th className="px-3 py-2 text-right font-medium">Qator</th>
                    <th className="px-3 py-2 text-right font-medium">OK</th>
                    <th className="px-3 py-2 text-right font-medium">Xato</th>
                    <th className="px-4 py-2 text-right font-medium">Sana</th>
                    {canUndo ? <th className="px-4 py-2 text-right font-medium">Amal</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {batchesQuery.data.items.map((b) => (
                    <tr
                      key={b.id}
                      className={`border-t border-ink-800/60 ${b.undoneAt ? 'opacity-50' : ''}`}
                    >
                      <td className="max-w-xs truncate px-4 py-2 text-ink-200">{b.filename}</td>
                      <td className="px-3 py-2 text-xs text-ink-500">
                        {b.kind === 'leads' ? 'Mijozlar' : b.kind === 'debtors' ? 'Debitor' : 'Telefon'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-400">{b.rowsTotal}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-300">{b.rowsOk}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-red-300">{b.rowsFailed}</td>
                      <td className="px-4 py-2 text-right text-xs text-ink-500">{relative(b.createdAt)}</td>
                      {canUndo ? (
                        <td className="px-4 py-2 text-right align-top">
                          <UndoButton batch={b} />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UploadCard({
  title,
  description,
  accept,
  disabled,
  onFile,
}: {
  title: string;
  description: string;
  accept: string;
  disabled: boolean;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={`card transition-colors ${dragging ? 'border-brand-500 bg-brand-500/5' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file && !disabled) onFile(file);
      }}
    >
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-500">{description}</p>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />

      <button
        type="button"
        className="btn-ghost mt-3 w-full"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        Fayl tanlash yoki bu yerga tashlang
      </button>
    </div>
  );
}

function Metric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'good' | 'bad';
}) {
  const color = { default: 'text-ink-100', good: 'text-emerald-300', bad: 'text-red-300' }[tone];
  return (
    <div className="rounded-lg border border-ink-800 bg-ink-950/50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-ink-500">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}
