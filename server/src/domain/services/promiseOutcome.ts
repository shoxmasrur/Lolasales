/**
 * Va'da bo'yicha keyingi qadamni aniqlaydi.
 *
 * Sof funksiya: bazaga ham, tarmoqqa ham, soatga ham tegmaydi. Butun
 * tsiklning mantig'i shu yerda — kuzatuvchi faqat natijani bajaradi.
 */

import { ochiqVadami, type PromiseStatus } from '@/domain/entities/PaymentPromise';
import { ishKuniga, type Bayram } from '@/domain/entities/bayram';

export interface PromiseSnapshot {
  readonly amount: number;
  /** YYYY-MM-DD — mijoz aytgan sana. */
  readonly promisedDateIso: string;
  /** YYYY-MM-DD — shu sanadan keyin va'da buzilgan deb belgilanadi. */
  readonly watchUntilIso: string;
  /** Va'da berilganidan KEYIN kelgan jami to'lov. */
  readonly paidAmount: number;
  /** Qaysi summagacha rahmat aytilgan — takroriy rahmatning oldini oladi. */
  readonly thankedAmount: number;
  /** Va'da kunidagi eslatma yuborilganmi. */
  readonly reminded: boolean;
}

export type PromiseAction =
  /** Hech narsa qilinmaydi — mijozga xabar ketmaydi. */
  | { kind: 'wait' }
  /** Va'da kunidagi yumshoq eslatma. */
  | { kind: 'remind' }
  | {
      kind: 'thank';
      /** Va'da qilingan summa to'liq kelganmi. */
      full: boolean;
      /** Shu safar kelgan YANGI pul — rahmat aynan shu summa uchun. */
      newMoney: number;
      /** Va'dadan keyin kelgan jami. */
      totalPaid: number;
      /** Kelishuvdan qancha qolgani (to'liq bo'lsa 0). */
      remaining: number;
      newStatus: 'kept' | 'partial';
    }
  /** Kuzatuv muddati tugadi, to'lov to'liq kelmadi. */
  | { kind: 'break' };

export interface PromiseKalendar {
  readonly bayramlar: Bayram[];
  readonly weekdays: number[];
}

/**
 * `todayIso` — YYYY-MM-DD (Asia/Tashkent, `IClock.todayIso()`).
 *
 * Sanalar satr sifatida solishtiriladi: YYYY-MM-DD da leksikografik tartib
 * xronologik tartib bilan bir xil.
 *
 * Tartib muhim: YANGI PUL har doim birinchi tekshiriladi. Aks holda
 * kuzatuv muddati tugagan kuni to'lagan mijoz "buzdi" deb belgilanib,
 * rahmat o'rniga bosim ko'rardi.
 *
 * `kalendar` IXTIYORIY: berilmasa muddat qanday bo'lsa shunday
 * ishlatiladi. Bu mavjud testlarni buzmaslik uchun emas — ular baribir
 * yangilanadi — balki funksiya kalendarsiz ham ma'noli qolishi uchun:
 * u sof qaror funksiyasi, bayram esa tashqi ma'lumot.
 */
export function evaluatePromise(
  p: PromiseSnapshot,
  todayIso: string,
  kalendar?: PromiseKalendar,
): PromiseAction {
  const newMoney = p.paidAmount - p.thankedAmount;

  if (newMoney > 0) {
    const full = p.paidAmount >= p.amount;
    return {
      kind: 'thank',
      full,
      newMoney,
      totalPaid: p.paidAmount,
      remaining: Math.max(0, p.amount - p.paidAmount),
      newStatus: full ? 'kept' : 'partial',
    };
  }

  if (todayIso < p.promisedDateIso) return { kind: 'wait' };

  if (todayIso === p.promisedDateIso) {
    return p.reminded ? { kind: 'wait' } : { kind: 'remind' };
  }

  // Sana o'tdi. Bank o'tkazmasi ertasi kuni ko'rinishi odatiy hol,
  // shuning uchun darhol "buzildi" demaymiz — kuzatuv oynasi beriladi.
  //
  // Bank yopiq kunda mijoz to'lay olmaydi, ya'ni muddat o'tgan deb
  // hisoblash noto'g'ri. Muddat bayram yoki dam olish kuniga tushsa,
  // u KEYINGI ISH KUNIGA suriladi. Bugun bayram bo'lsa alohida qoida
  // kerak emas: muddat baribir oldinda turadi.
  const muddat = kalendar
    ? ishKuniga(p.watchUntilIso, kalendar.bayramlar, kalendar.weekdays)
    : p.watchUntilIso;

  return todayIso > muddat ? { kind: 'break' } : { kind: 'wait' };
}

/** Va'da kunidagi eslatma uchun kerakli holat — bazadan QAYTA o'qilgan. */
export interface ReminderSnapshot {
  readonly status: PromiseStatus;
  readonly amount: number;
  readonly paidAmount: number;
  readonly thankedAmount: number;
}

/**
 * Kelishilgan kunda mijozga eslatma yuboriladimi.
 *
 * NEGA ALOHIDA FUNKSIYA: bu shart ilgari kuzatuvchining ichida bitta
 * qatorda turardi — `status !== 'pending' || paidAmount > 0` — va ikkita
 * xato qilardi.
 *
 *   1. Qisman to'lagan mijoz eslatmasiz qolardi. Qisman to'lov va'dani
 *      `partial` ga o'tkazadi, ya'ni "pending emas" shartiga tushardi.
 *      Agent "qolganini o'sha kuni yopasizmi?" deb kelishib olardi-yu,
 *      kelishilgan kuni jim turardi — keyin va'da "buzildi" bo'lib
 *      operatorga otilardi.
 *   2. `paidAmount > 0` ning o'zi juda keng: qoldiq qolgan bo'lsa ham
 *      eslatmani butunlay o'chirardi.
 *
 * Shart uchta: va'da ochiq bo'lsin, qoldiq qolgan bo'lsin va kelgan pul
 * uchun RAHMAT allaqachon aytilgan bo'lsin. Uchinchisi muhim — pul
 * kelgan, lekin rahmat hali ketmagan bo'lsa, eslatma undan oldin borib,
 * "pulingizni ko'rmadik" degan taassurot qoldirardi. Rahmat keyingi
 * tsiklda ketadi, eslatma esa o'sha kuni ham ulguradi.
 */
export function eslatmaKerakmi(p: ReminderSnapshot): boolean {
  if (!ochiqVadami(p.status)) return false;
  if (p.paidAmount >= p.amount) return false;
  return p.paidAmount <= p.thankedAmount;
}
