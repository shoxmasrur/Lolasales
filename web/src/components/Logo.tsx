import clsx from 'clsx';

/**
 * "LolaSales" matnli logotipi — navbar va kirish sahifasida bir xil manbadan.
 *
 * Rasm fayli yo'q: nom matn bilan chiziladi, shuning uchun ikkala mavzuda
 * ham `text-ink-100` rangini oladi va alohida teskarilash kerak emas.
 *
 * O'lcham kenglik bo'yicha beriladi. Juda tor joyda (yig'ilgan menyu)
 * to'liq nom sig'maydi — u yerda qisqa "LS" belgisi chiqadi.
 */
const QISQA_CHEGARA = 60;

export function Logo({ width = 132, className }: { width?: number; className?: string }) {
  const qisqa = width < QISQA_CHEGARA;
  return (
    <span
      aria-label="LolaSales"
      className={clsx('block font-semibold tracking-tight text-ink-100 leading-none', className)}
      style={{ width, fontSize: qisqa ? width * 0.45 : width / 6, textAlign: 'center' }}
    >
      {qisqa ? 'LS' : 'LolaSales'}
    </span>
  );
}
