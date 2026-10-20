import clsx from 'clsx';

export type PresetKey =
  | 'today'
  | 'this_month'
  | 'last_month'
  | 'quarter'
  | 'half_year'
  | 'year'
  | 'custom';

export interface Period {
  preset: PresetKey;
  /** Faqat "o'z oralig'i" uchun. Tayyor davrlarda sanani SERVER hisoblaydi. */
  from?: string;
  to?: string;
}

const LABELS: Record<PresetKey, string> = {
  today: 'Bugun',
  this_month: 'Shu oy',
  last_month: "O'tgan oy",
  quarter: 'Chorak',
  half_year: '6 oy',
  year: 'Yil',
  custom: "O'z oralig'i",
};

const ORDER: PresetKey[] = [
  'today', 'this_month', 'last_month', 'quarter', 'half_year', 'year', 'custom',
];

/**
 * Davr filtri.
 *
 * Sana hisobi ATAYLAB bu yerda emas: oy chegarasidagi xatolar (31-martda
 * "o'tgan oy", kabisa yili) interfeysda sinalmaydi. Tugma faqat davr NOMINI
 * yuboradi, server esa javobda aniq sanalarni qaytaradi.
 *
 * `resolved` — serverdan kelgan oraliq. "O'z oralig'i" ga o'tilganda
 * sanalar shundan boshlanadi, ya'ni foydalanuvchi bo'sh maydondan emas,
 * ko'rib turgan davridan davom etadi.
 */
export function PeriodPicker({
  value,
  resolved,
  onChange,
}: {
  value: Period;
  resolved?: { from: string; to: string };
  onChange: (p: Period) => void;
}) {
  const from = value.from ?? resolved?.from ?? '';
  const to = value.to ?? resolved?.to ?? '';

  const pick = (preset: PresetKey): void => {
    onChange(preset === 'custom' ? { preset, from, to } : { preset });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[11px] uppercase tracking-wide text-ink-500">Davr:</span>
        {ORDER.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => pick(key)}
            className={clsx(
              'rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
              value.preset === key ? 'bg-ink-800 text-ink-100' : 'text-ink-500 hover:bg-ink-800/50',
            )}
          >
            {LABELS[key]}
          </button>
        ))}
        {resolved ? (
          <span className="ml-auto text-[11px] text-ink-600">
            {resolved.from} — {resolved.to}
          </span>
        ) : null}
      </div>

      {value.preset === 'custom' ? (
        <div className="flex items-center gap-2">
          <input
            type="date"
            className="input !py-1 text-xs"
            value={from}
            max={to || undefined}
            onChange={(e) => onChange({ preset: 'custom', from: e.target.value, to })}
          />
          <span className="text-xs text-ink-500">—</span>
          <input
            type="date"
            className="input !py-1 text-xs"
            value={to}
            min={from || undefined}
            onChange={(e) => onChange({ preset: 'custom', from, to: e.target.value })}
          />
        </div>
      ) : null}
    </div>
  );
}
