import type { ClientSource, XaridBosqichi } from '@/lib/types';

export const XARID_BOSQICHLARI: XaridBosqichi[] = [
  'yangi', 'suhbatda', 'qiziqdi', 'karta_yuborildi', 'chek_keldi', 'qisman_toladi', 'toladi', 'rad_etdi',
];

export const BOSQICH_YORLIGI: Record<XaridBosqichi, string> = {
  yangi: 'Yangi',
  suhbatda: 'Suhbatda',
  qiziqdi: 'Qiziqdi',
  karta_yuborildi: 'Karta yuborildi',
  chek_keldi: 'Chek keldi',
  qisman_toladi: "Qisman to'ladi",
  toladi: "To'ladi",
  rad_etdi: 'Rad etdi',
};

export const BOSQICH_CLASS: Record<XaridBosqichi, string> = {
  yangi: 'chip bg-ink-800 text-ink-400',
  suhbatda: 'chip bg-sky-500/15 text-sky-300',
  qiziqdi: 'chip bg-violet-500/15 text-violet-300',
  karta_yuborildi: 'chip bg-amber-500/15 text-amber-300',
  chek_keldi: 'chip bg-amber-500/25 text-amber-200',
  qisman_toladi: 'chip bg-teal-500/15 text-teal-300',
  toladi: 'chip bg-emerald-500/15 text-emerald-300',
  rad_etdi: 'chip bg-red-500/15 text-red-300',
};

export const MANBA_YORLIGI: Record<ClientSource, string> = {
  reklama: 'Reklama',
  guruh: 'Guruh',
  raqam: 'Raqam',
  qolda: "Qo'lda",
};
