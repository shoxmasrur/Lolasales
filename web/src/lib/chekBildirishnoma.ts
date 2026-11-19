import { useEffect, useRef } from 'react';

/** Qisqa ovoz signali. Brauzer foydalanuvchi bosmaguncha ovozni bloklashi mumkin — jim o'tkazib yuboriladi. */
function signal(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => void ctx.close();
  } catch {
    /* ovoz majburiy emas */
  }
}

/** Brauzer bildirishnomasi ruxsati berilganmi. */
export function bildirishnomaRuxsati(): 'granted' | 'denied' | 'default' | 'yoq' {
  return typeof Notification === 'undefined' ? 'yoq' : Notification.permission;
}

/** Foydalanuvchi bosganda ruxsat so'raydi (brauzer talabi). */
export async function bildirishnomaSora(): Promise<void> {
  if (typeof Notification === 'undefined') return;
  try {
    await Notification.requestPermission();
  } catch {
    /* e'tiborsiz */
  }
}

/**
 * Tekshirish kerak bo'lgan cheklar soni oshganda: ovoz + brauzer bildirishnomasi.
 * Sahifa sarlavhasida son ko'rinib turadi: "(2) LolaSales" — boshqa oynadan ham sezish mumkin.
 */
export function useChekBildirishnomasi(soni: number): void {
  const oldingi = useRef<number | null>(null);
  const asosiySarlavha = useRef<string>(document.title.replace(/^\(\d+\)\s*/, '') || 'LolaSales');

  useEffect(() => {
    document.title = soni > 0 ? `(${soni}) ${asosiySarlavha.current}` : asosiySarlavha.current;
  }, [soni]);

  useEffect(() => {
    // Birinchi yuklanishda (oldingi === null) xabar bermaymiz — faqat YANGI chek kelganda.
    if (oldingi.current !== null && soni > oldingi.current) {
      signal();
      try {
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification("Tekshirish kerak bo'lgan chek", {
            body: `Navbatda ${soni} ta chek bor. Boshqaruv panelini oching.`,
            tag: 'lolasales-chek',
          });
        }
      } catch {
        /* e'tiborsiz */
      }
    }
    oldingi.current = soni;
  }, [soni]);
}
