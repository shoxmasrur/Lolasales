import { useState } from 'react';
import clsx from 'clsx';

/**
 * "XON SAROY" logotipi — navbar va kirish sahifasida bir xil manbadan.
 *
 * Fayl `web/public/` da turadi va Vite uni ildizdan beradi. Formatni
 * almashtirish (png → svg) uchun faqat SHU qator o'zgaradi.
 */
const LOGO_SRC = '/logo.png';

/** Manba o'lchami: 200×106. Balandlik shundan hisoblanadi. */
const RATIO = 106 / 200;

/**
 * Logo SHAFFOF fonda OQ rangda chizilgan — shuning uchun u to'q panelning
 * o'ziga qo'yiladi. Ostiga oq yoki yorug' tagzamin QO'YILMAYDI: o'shanda
 * oq chiziqlar oq fonga qo'shilib, logo ko'rinmay qolardi.
 *
 * Aynan shu sabab YORUG' MAVZUDA logo teskarilanadi (`--logo-invert`):
 * oq chiziqlar qora bo'ladi. Alohida qora fayl kerak emas — manba bitta
 * qoladi va ikkalasi bir-biridan ajrab ketmaydi.
 *
 * O'lcham kenglik bo'yicha beriladi: logo cho'ziq (~1.9:1) va ichida
 * kompaniya nomi bor — balandlik bo'yicha o'lchansa yozuv o'qib
 * bo'lmaydigan darajada kichrayib ketadi.
 */
export function Logo({ width = 132, className }: { width?: number; className?: string }) {
  const [failed, setFailed] = useState(false);

  // Logo yuklanmasa ilova buzilmaydi — nomi matn bilan qoladi.
  if (failed) {
    return (
      <span className={clsx('text-sm font-semibold tracking-wide text-ink-100', className)}>
        XON SAROY
      </span>
    );
  }

  return (
    <img
      src={LOGO_SRC}
      alt="Xon Saroy"
      width={width}
      height={Math.round(width * RATIO)}
      onError={() => setFailed(true)}
      className={clsx('block object-contain', className)}
      style={{ width, height: 'auto', filter: 'invert(var(--logo-invert))' }}
    />
  );
}
