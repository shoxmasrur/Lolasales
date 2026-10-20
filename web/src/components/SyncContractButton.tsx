import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCan } from '@/store/auth';
import { relative } from '@/lib/format';

interface SyncResult {
  outcome: 'ok' | 'not_found' | 'error' | 'disabled';
  debtTotal: number;
  newPhones: string[];
}

const OUTCOME_MESSAGE: Record<SyncResult['outcome'], string> = {
  ok: 'yangilandi',
  not_found: 'shartnomalar bazasida topilmadi',
  error: 'yangilab bo\'lmadi',
  disabled: 'integratsiya o\'chirilgan',
};

/**
 * Bitta shartnomani shartnomalar bazasidan darhol yangilaydi.
 *
 * Mijozlar va Suhbatlar sahifalarida bir xil ishlatiladi: xodim eskirgan
 * raqamni ko'rsa kechani kutmasligi kerak — bitta so'rov ~330 ms.
 *
 * Yangilangandan keyin mijoz kartasi, ro'yxat va ochiq suhbat qayta
 * so'raladi: kechikkan summa o'zgargan bo'lsa hamma joyda darhol ko'rinsin.
 */
export function SyncContractButton({
  clientId,
  contractId,
  syncedAt,
  syncError,
  conversationId,
  compact = false,
}: {
  clientId: string;
  contractId: string;
  syncedAt?: string | null;
  syncError?: string | null;
  /** Suhbat sahifasida — o'sha suhbat ham yangilanadi. */
  conversationId?: string;
  /** Suhbat panelida joy tor: faqat tugma, holat matnisiz. */
  compact?: boolean;
}) {
  const canSync = useCan('contracts.sync');
  const queryClient = useQueryClient();

  const sync = useMutation({
    mutationFn: () => api.post<SyncResult>(`/clients/${clientId}/sync-contract`, { contractId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['client', clientId] });
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
      if (conversationId) {
        void queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
        void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }
    },
  });

  if (!canSync) return null;

  const result = sync.data;
  // Xato bazada saqlangan bo'lsa ham ko'rsatamiz — u oxirgi kechasi
  // sinxronizatsiyadan qolgan bo'lishi mumkin.
  const problem = result && result.outcome !== 'ok' ? OUTCOME_MESSAGE[result.outcome] : syncError;

  return (
    <div className={compact ? 'mt-1.5' : 'mt-2 flex flex-wrap items-center gap-2'}>
      <button
        type="button"
        onClick={() => sync.mutate()}
        disabled={sync.isPending}
        className="rounded-md border border-ink-700 px-2 py-0.5 text-[10px] text-ink-400 hover:border-ink-500 hover:text-ink-200 disabled:opacity-50 max-md:inline-flex max-md:min-h-10 max-md:min-w-10 max-md:items-center max-md:justify-center"
      >
        {sync.isPending ? 'Yangilanmoqda…' : 'Yangilash'}
      </button>

      {!compact ? (
        <span className="text-[10px] text-ink-600">
          {syncedAt ? `oxirgi: ${relative(syncedAt)}` : 'hali yangilanmagan'}
        </span>
      ) : null}

      {result?.outcome === 'ok' ? (
        <span className="text-[10px] text-emerald-500">
          yangilandi
          {result.newPhones.length ? ` · ${result.newPhones.length} yangi raqam` : ''}
        </span>
      ) : null}

      {problem ? (
        <span className="text-[10px] text-rose-400">
          {problem === 'not_found' ? 'bazada topilmadi' : problem}
        </span>
      ) : null}

      {sync.error ? <span className="text-[10px] text-rose-400">so'rov ketmadi</span> : null}
    </div>
  );
}
