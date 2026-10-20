import clsx from 'clsx';
import type { ReactNode } from 'react';

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-ink-600 border-t-brand-400',
        className,
      )}
    />
  );
}

export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={clsx('chip', className)}>{children}</span>;
}

export function EmptyState({
  title,
  hint,
  action,
  icon = '○',
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full border border-ink-800 bg-ink-900/60 text-lg text-ink-600">
        {icon}
      </div>
      <p className="text-sm font-medium text-ink-300">{title}</p>
      {hint ? <p className="max-w-sm text-xs leading-relaxed text-ink-500">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'default' | 'warn' | 'good' | 'bad';
}) {
  const toneClass = {
    default: 'text-ink-50',
    warn: 'text-amber-300',
    good: 'text-emerald-300',
    bad: 'text-red-300',
  }[tone];

  return (
    <div className="card-hover">
      <p className="text-[11px] font-medium uppercase tracking-wider text-ink-500">{label}</p>
      <p className={clsx('mt-1.5 text-2xl font-semibold tabular-nums tracking-tight', toneClass)}>
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs leading-relaxed text-ink-500">{sub}</p> : null}
    </div>
  );
}

export function Avatar({ text, size = 40 }: { text: string; size?: number }) {
  // Ism bo'yicha barqaror rang — har safar bir xil ko'rinadi.
  const hue = [...text].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 360;
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${hue} 55% 45%), hsl(${(hue + 40) % 360} 55% 35%))`,
      }}
    >
      {text}
    </div>
  );
}

/**
 * Kalit (switch).
 *
 * Trek `shrink-0` bo'lishi SHART: tor flex qatorlarda u siqilib qolsa,
 * knob qat'iy masofaga suriladi va trekdan tashqariga chiqib ketadi.
 * Knob ham `left`/`right` bilan joylashtiriladi — translate emas.
 */
export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
  size = 'md',
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
}) {
  const track = size === 'sm' ? 'h-[18px] w-8' : 'h-5 w-9';
  const knob = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'group inline-flex items-center gap-2.5 rounded-lg text-left',
        'max-md:-m-2 max-md:p-2',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950',
        disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer',
      )}
    >
      <span
        className={clsx(
          'relative shrink-0 rounded-full transition-colors duration-200',
          track,
          checked ? 'bg-brand-500' : 'bg-ink-700',
          !disabled && (checked ? 'group-hover:bg-brand-400' : 'group-hover:bg-ink-600'),
        )}
      >
        <span
          className={clsx(
            'absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm',
            'transition-[left,right] duration-200',
            knob,
            checked ? 'left-auto right-[3px]' : 'left-[3px] right-auto',
          )}
        />
      </span>

      {label || hint ? (
        <span className="min-w-0">
          {label ? <span className="block text-sm leading-tight text-ink-200">{label}</span> : null}
          {hint ? <span className="block text-[11px] leading-tight text-ink-500">{hint}</span> : null}
        </span>
      ) : null}
    </button>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
      {message}
    </div>
  );
}
