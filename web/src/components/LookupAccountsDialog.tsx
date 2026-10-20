import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PremiumBadge } from '@/components/PremiumBadge';
import type { BulkStartAccountPlan, TelegramAccount } from '@/lib/types';
import { ErrorNote, Spinner } from '@/components/ui';
import { Sheet } from '@/components/Sheet';

/**
 * Telegram qidiruvini qaysi akkauntlar bajarishini tanlash.
 *
 * NEGA TANLOV KERAK: kunlik qidiruv kvotasi har akkauntda 50 ta. Bitta
 * akkaunt bilan 200 ta mijozni tekshirib bo'lmaydi, shuning uchun operator
 * bir nechta akkauntni belgilaydi va tizim mijozlarni ular orasida qolgan
 * kvotaga qarab taqsimlaydi.
 *
 * NEGA BIRIKTIRADI: topilgan `access_hash` aynan qidirgan akkauntga
 * bog'lanadi. Shu sabab qidiruv akkaunti keyin xabar yozadigan akkaunt
 * bilan bir xil bo'lishi kerak — aks holda mijoz qaytadan qidirilib,
 * kvota ikki marta sarflanardi.
 */
export function LookupAccountsDialog({
  clientIds,
  onClose,
  onConfirm,
  pending,
  error,
}: {
  clientIds: string[];
  onClose: () => void;
  onConfirm: (accountIds: string[]) => void;
  pending: boolean;
  error: unknown;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  const accountsQuery = useQuery({
    queryKey: ['telegram-accounts'],
    queryFn: () =>
      api.get<{ items: TelegramAccount[]; defaultPersonaName: string }>('/telegram/accounts'),
  });
  const accounts = accountsQuery.data?.items ?? [];

  // Qidiruvni faqat AYNAN HOZIR ulangan akkaunt bajara oladi — server ham
  // shu qoidada tekshiradi (`canLookup`). Kvotasi tugagani ham tanlanmaydi.
  const selectable = accounts.filter(
    (a) => a.isEnabled && a.connected && a.spamStatus !== 'banned' && a.remainingLookupsToday > 0,
  );

  // Oyna ochiq turganda akkaunt holati o'zgarishi mumkin (uzilib qolishi,
  // kvotasi tugashi). Yaroqsiz bo'lib qolganini tanlovdan olib tashlaymiz,
  // aks holda tugma doim xato bilan qaytardi.
  useEffect(() => {
    setSelected((s) => {
      const ok = new Set(selectable.map((a) => a.id));
      const next = s.filter((id) => ok.has(id));
      return next.length === s.length ? s : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  const previewQuery = useQuery({
    queryKey: ['lookup-preview', clientIds, selected],
    queryFn: () =>
      api.post<{ total: number; accountPlan: BulkStartAccountPlan[] }>(
        '/clients/telegram-lookup-bulk/preview',
        { clientIds, accountIds: selected },
      ),
    enabled: selected.length > 0,
  });

  const plan = previewQuery.data?.accountPlan ?? [];
  const jami = plan.reduce((sum, a) => sum + a.count, 0);
  // Taqsimlagich kvotadan ortiqni TASHLAMAYDI — biriktiradi va ortig'ini
  // `overQuota` da beradi. Shuning uchun "sig'magan" ni
  // `tanlangan − biriktirilgan` deb hisoblash XATO bo'lardi: u doim nol
  // chiqib, operator kvota to'lganini bilmay qolardi.
  const sigmagan = plan.reduce((sum, a) => sum + a.overQuota, 0);
  const sigadi = jami - sigmagan;

  const toggle = (id: string): void =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <Sheet
      open
      // Qidiruv so'rovi ketayotganda dialog yopilmasin — boshqa ikki
      // dialogdagi kabi `pending` shartini `Sheet`ga uzatamiz.
      onClose={() => {
        if (!pending) onClose();
      }}
      title="Telegramni tekshirish"
      maxWidth="max-w-lg"
    >
      <div className="p-4 md:p-5">
        <p className="text-xs text-ink-500">
          {clientIds.length} ta mijoz tanlangan. Qidiruvni qaysi akkauntlar bajarsin?
        </p>

        {accountsQuery.isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : selectable.length === 0 ? (
          <p className="py-6 text-center text-xs text-amber-300">
            Qidiruvga tayyor akkaunt yo'q — ulanmagan yoki kunlik kvotasi tugagan.
          </p>
        ) : (
          <div className="mt-3 space-y-1.5">
            {selectable.map((a) => (
              <label
                key={a.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg border border-ink-800 px-3 py-2 hover:bg-ink-900/60"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(a.id)}
                  onChange={() => toggle(a.id)}
                />
                <span className="flex-1 text-xs text-ink-200">
                  {a.label} <PremiumBadge account={a} />
                </span>
                <span className="text-[11px] text-ink-500">
                  {a.remainingLookupsToday} ta qidiruv qoldi
                </span>
                {/* Rejadagi son faqat tanlangan akkauntlarda ko'rinadi. */}
                {selected.includes(a.id) ? (
                  <span className="text-[11px] font-medium text-emerald-300">
                    {plan.find((p) => p.accountId === a.id)?.count ?? 0} ta
                  </span>
                ) : null}
              </label>
            ))}
          </div>
        )}

        {selected.length > 0 ? (
          <p className="mt-3 text-[11px] text-ink-400">
            {previewQuery.isLoading ? (
              'Taqsimot hisoblanmoqda…'
            ) : (
              <>
                Bugun {sigadi} ta mijoz tekshiriladi.
                {sigmagan > 0 ? (
                  <span className="text-amber-300">
                    {' '}
                    Yana {sigmagan} tasi kunlik kvotadan oshadi — ular ertaga yoki boshqa
                    akkaunt bilan tekshiriladi.
                  </span>
                ) : null}
              </>
            )}
          </p>
        ) : null}

        {error ? <ErrorNote error={error} /> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-ghost" disabled={pending} onClick={onClose}>
            Bekor qilish
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={pending || selected.length === 0 || jami === 0}
            onClick={() => onConfirm(selected)}
          >
            {pending ? <Spinner /> : null}
            Tekshirishni boshlash
          </button>
        </div>
      </div>
    </Sheet>
  );
}
