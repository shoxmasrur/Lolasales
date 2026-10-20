import { useState } from 'react';
import clsx from 'clsx';
import { somShort } from '@/lib/format';

export interface KartaQongiroq {
  id: string;
  sana: string;
  agentKaliti: string;
  agentIsmi: string;
  telefon: string | null;
  davomiylikSoniya: number;
  natija: 'gaplashildi' | 'kotarmadi' | 'band' | 'boshqa_odam' | 'raqam_notogri';
  xulosa: string | null;
  vada: { kun: string; summa: number | null } | null;
  transkript: string | null;
}

const NATIJA: Record<KartaQongiroq['natija'], { yorliq: string; rang: string }> = {
  gaplashildi: { yorliq: 'Gaplashildi', rang: 'bg-emerald-500/15 text-emerald-300' },
  kotarmadi: { yorliq: 'Ko\'tarmadi', rang: 'bg-ink-800 text-ink-400' },
  band: { yorliq: 'Band', rang: 'bg-ink-800 text-ink-400' },
  boshqa_odam: { yorliq: 'Boshqa odam ko\'tardi', rang: 'bg-amber-500/15 text-amber-300' },
  raqam_notogri: { yorliq: 'Raqam noto\'g\'ri', rang: 'bg-red-500/15 text-red-300' },
};

const vaqt = (iso: string): string =>
  new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
const kun = (iso: string): string => iso.split('-').reverse().join('.');
const davomiylik = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/**
 * Ovozli agentning qo'ng'iroqlari (spec 6-bo'lim). Qo'ng'iroq bo'lmasa
 * bo'lim umuman chizilmaydi.
 *
 * Transkript standart YOPIQ: u uzun bo'ladi va kartani cho'zib yuborardi.
 */
export function ClientCallsCard({ calls }: { calls: ReadonlyArray<KartaQongiroq> }) {
  const [ochiq, setOchiq] = useState<string | null>(null);
  if (!calls.length) return null;

  return (
    <div>
      <p className="mb-2 text-[11px] uppercase tracking-wide text-ink-500">Qo'ng'iroqlar ({calls.length})</p>
      <div className="space-y-2">
        {calls.map((c) => (
          <div key={c.id} className="rounded-lg border border-ink-800 bg-ink-950/50 p-3 text-[11px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-ink-300">{vaqt(c.sana)}</span>
              <span className={clsx('chip', NATIJA[c.natija].rang)}>{NATIJA[c.natija].yorliq}</span>
              <span className="text-ink-500" title={c.agentKaliti}>{c.agentIsmi}</span>
              <span className="text-ink-600">· {davomiylik(c.davomiylikSoniya)}</span>
              {c.telefon ? <span className="font-mono text-ink-600">· {c.telefon}</span> : null}
            </div>
            {c.xulosa ? <p className="mt-1.5 text-ink-300">{c.xulosa}</p> : null}
            {c.vada ? (
              <p className="mt-1 text-emerald-300">
                Va'da: {kun(c.vada.kun)}{c.vada.summa ? `, ${somShort(c.vada.summa)}` : ''}
              </p>
            ) : null}
            {c.transkript ? (
              <div className="mt-1.5">
                <button
                  type="button"
                  className="text-ink-400 underline-offset-2 hover:text-ink-200 hover:underline"
                  onClick={() => setOchiq((o) => (o === c.id ? null : c.id))}
                >
                  {ochiq === c.id ? 'Transkriptni yopish' : 'Transkript'}
                </button>
                {ochiq === c.id ? (
                  <pre className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap rounded bg-ink-900 p-2 font-sans text-ink-300">
                    {c.transkript}
                  </pre>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
