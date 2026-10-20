import { mavzudanTashqari } from '@/domain/services/mavzudanTashqari';

/**
 * Qo'lda ishga tushiriladi: npm run test:mavzudan-tashqari --workspace=server
 *
 * NEGA BU TEST KERAK: qo'riqchi ishga tushsa, mijoz modelning javobini emas,
 * tayyor rad jumlasini oladi. Ya'ni xato ushlash — haqiqiy mijozga noto'g'ri
 * javob. Shuning uchun "ushlamasligi kerak" holatlari "ushlashi kerak"
 * holatlaridan ko'p va ular birinchi turadi.
 */

interface Holat {
  matn: string;
  tashqarimi: boolean;
  sabab?: 'arifmetika' | 'topshiriq';
}

const HOLATLAR: Holat[] = [
  // ── USHLAMASLIGI KERAK: to'lov konteksti ────────────────────────────
  { matn: 'Shartnoma kodini yozib bering', tashqarimi: false },
  { matn: '5 mln to‘layman', tashqarimi: false },
  { matn: '9 275 000 so‘m to‘ladim', tashqarimi: false },
  { matn: 'oyiga qancha bo‘ladi?', tashqarimi: false },
  { matn: 'qarzim qancha qoldi', tashqarimi: false },
  { matn: '12+8 mln so‘m tashladim', tashqarimi: false },
  { matn: '5-7 oktabrda to‘layman', tashqarimi: false },
  { matn: 'chekni yuboraman', tashqarimi: false },
  { matn: '1065MSO244D shartnoma bo‘yicha', tashqarimi: false },

  // ── USHLAMASLIGI KERAK: oddiy suhbat ────────────────────────────────
  { matn: 'Assalomu alaykum', tashqarimi: false },
  { matn: 'xop', tashqarimi: false },
  { matn: 'ertaga', tashqarimi: false },
  { matn: '7', tashqarimi: false },
  { matn: '', tashqarimi: false },
  { matn: 'Kodni SMS orqali yuboring', tashqarimi: false },

  // ── USHLASHI KERAK: sof arifmetika ──────────────────────────────────
  { matn: '5+9', tashqarimi: true, sabab: 'arifmetika' },
  { matn: '5+9 nechchi bo‘ladi?', tashqarimi: true, sabab: 'arifmetika' },
  { matn: '5 + 9 necha?', tashqarimi: true, sabab: 'arifmetika' },
  { matn: '10 ni 2 ga bo‘l', tashqarimi: true, sabab: 'arifmetika' },
  { matn: '2*3=?', tashqarimi: true, sabab: 'arifmetika' },
  { matn: 'x + x/2 + x/3 = 121, x ni top', tashqarimi: true, sabab: 'arifmetika' },

  // ── USHLASHI KERAK: topshiriq iboralari ─────────────────────────────
  { matn: 'Buni ingliz tiliga tarjima qil', tashqarimi: true, sabab: 'topshiriq' },
  { matn: 'menga kod yozib ber', tashqarimi: true, sabab: 'topshiriq' },
  { matn: 'she’r ayt', tashqarimi: true, sabab: 'topshiriq' },
  { matn: 'shu masalani yechib ber', tashqarimi: true, sabab: 'topshiriq' },
];

let failed = 0;
for (const h of HOLATLAR) {
  const natija = mavzudanTashqari(h.matn);
  const nom = h.matn || '(bo‘sh)';
  if (natija.tashqarimi !== h.tashqarimi) {
    console.log(`✗ ${nom} → tashqarimi=${natija.tashqarimi}, kutilgan ${h.tashqarimi}`);
    failed += 1;
    continue;
  }
  if (h.tashqarimi && h.sabab && natija.sabab !== h.sabab) {
    console.log(`✗ ${nom} → sabab=${natija.sabab}, kutilgan ${h.sabab}`);
    failed += 1;
    continue;
  }
  console.log(`✓ ${nom}`);
}

console.log(failed ? `${failed} ta xato` : `${HOLATLAR.length} ta holat o‘tdi`);
process.exit(failed ? 1 : 0);
