import { useCallback, useSyncExternalStore } from 'react';

/**
 * `matchMedia` ustidagi yupqa qatlam.
 *
 * FAQAT strukturaviy qarorlar uchun: qaysi panel chiziladi, jadvalmi
 * yoki kartochka. Bo'shliq, shrift va grid uchun ISHLATILMAYDI — ular
 * Tailwind prefikslari bilan hal qilinadi. Aks holda oyna o'lchami
 * har o'zgarganda butun daraxt qayta chizilardi.
 *
 * `useSyncExternalStore` tanlangan, `useState` + `useEffect` emas:
 * ikkinchisi birinchi chizishda doim sukutdagi qiymatni beradi va
 * telefonda sahifa avval kompyuter ko'rinishida chizilib, keyin
 * sakrardi.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  // Uchinchi argument — serverda chizish uchun. Bu ilova faqat
  // brauzerda chiziladi, ammo React uni talab qiladi.
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** Telefon: Tailwind `md` chegarasidan pastda. */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767.98px)');
}

/** Keng ekran: suhbatdagi uchinchi panel shu yerdan boshlab ko'rinadi. */
export function useIsDesktopWide(): boolean {
  return useMediaQuery('(min-width: 1280px)');
}
