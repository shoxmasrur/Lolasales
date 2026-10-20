import { ulanishQarori } from '@/domain/services/ulanishHolati';
import type { TelegramAccount } from '@/domain/entities/TelegramAccount';

/**
 * Qo'lda ishga tushiriladi: npm run test:ulanish-holati
 *
 * NEGA ALOHIDA TEKSHIRILADI: bu qoidalar noto'g'ri bo'lsa oqibat jim
 * bo'ladi. Juda qattiq bo'lsa — uzilgan akkaunt hech qachon tiklanmaydi
 * (2026-08-09 dagi nosozlik aynan shu edi). Juda yumshoq bo'lsa —
 * sessiyasi eskirgan akkauntni tizim cheksiz urinib, proksini va
 * Telegramni behuda bezovta qiladi.
 *
 * QOIDALAR TARTIBI ham ahamiyatli va shu yerda qotirilgan.
 */

let failed = 0;

function eq(nom: string, actual: unknown, kutilgan: unknown): void {
  if (actual === kutilgan) {
    console.log(`✓ ${nom}`);
  } else {
    failed += 1;
    console.log(`✗ ${nom}: ${String(actual)}  (kutilgan: ${String(kutilgan)})`);
  }
}

const HOZIR = new Date('2026-08-09T12:00:00Z');

/** Standart: yoqilgan, sessiyasi bor, holati `connected`. */
function akk(patch: Partial<TelegramAccount> = {}): Pick<TelegramAccount, 'isEnabled' | 'session' | 'status'> {
  return { isEnabled: true, session: 'sessiya', status: 'connected', ...patch };
}

function qaror(
  account: Pick<TelegramAccount, 'isEnabled' | 'session' | 'status'>,
  ulanganmi: boolean,
  oxirgiXatoUrinishi: Date | null = null,
): string {
  return ulanishQarori({ account, ulanganmi, oxirgiXatoUrinishi, hozir: HOZIR });
}

// ── 1. O'chirilgan akkaunt — tirik klient bilan ham o'tkazib yuboriladi ──
// 1-qoida 5-dan ustun: operator ataylab o'chirgan bo'lsa, tizim uni
// qayta ko'tarmaydi.
eq('o\'chirilgan, klient tirik', qaror(akk({ isEnabled: false }), true), 'otkazib_yuborish');
eq('o\'chirilgan, klient o\'lik', qaror(akk({ isEnabled: false }), false), 'otkazib_yuborish');

// ── 2. Sessiyasi yo'q — ulanadigan narsa yo'q ──────────────────────────
eq('sessiyasiz', qaror(akk({ session: null }), false), 'otkazib_yuborish');

// ── 3. logged_out — qayta ulanish sessiyani tiklamaydi ────────────────
// Prodda Nafosatning holati: proksi ishlayapti, sessiya eskirgan.
// Operator qo'lda qayta login qilishi kerak.
eq('logged_out', qaror(akk({ status: 'logged_out' }), false), 'otkazib_yuborish');

// ── 4. banned — Telegram bloklagan ─────────────────────────────────────
eq('banned', qaror(akk({ status: 'banned' }), false), 'otkazib_yuborish');

// ── 5. Klient tirik — ish yo'q ─────────────────────────────────────────
eq('tirik klient', qaror(akk(), true), 'ulangan');

// 5-qoida 6-dan ustun: yaqinda yiqilib, keyin o'zi tiklangan akkaunt
// tanaffus tufayli "o'lik" deb ko'rsatilmasligi kerak.
eq(
  'tirik klient, yaqinda yiqilgan',
  qaror(akk(), true, new Date(HOZIR.getTime() - 60_000)),
  'ulangan',
);

// ── 6. Tanaffus ────────────────────────────────────────────────────────
eq(
  'o\'lik, 1 daqiqa oldin yiqilgan',
  qaror(akk(), false, new Date(HOZIR.getTime() - 60_000)),
  'otkazib_yuborish',
);
// Chegarada — ruxsat etiladi.
eq(
  'o\'lik, roppa-rosa 5 daqiqa oldin',
  qaror(akk(), false, new Date(HOZIR.getTime() - 5 * 60_000)),
  'qayta_ulash',
);
eq(
  'o\'lik, 10 daqiqa oldin',
  qaror(akk(), false, new Date(HOZIR.getTime() - 10 * 60_000)),
  'qayta_ulash',
);

// Soat orqaga siljishi (NTP tuzatishi): xato vaqti `hozir`dan KEYINGI
// bo'lib ko'rinishi mumkin — farq manfiy chiqadi. Bu holatda ham
// tanaffus qoidasi ishlashi kerak (0 ga qisqartirilgan holda), aks holda
// manfiy son taqqoslashda kutilmagan natija berishi mumkin edi.
eq(
  'soat orqaga siljigan — xato vaqti "kelajakda"',
  qaror(akk(), false, new Date(HOZIR.getTime() + 60_000)),
  'otkazib_yuborish',
);

// ── 7. Hali yiqilmagan o'lik akkaunt — darhol uriniladi ────────────────
eq('o\'lik, hali urinilmagan', qaror(akk(), false, null), 'qayta_ulash');

// ── 8. `error` holati ham qayta uriniladi ──────────────────────────────
// Proksi yiqilganda status `error` bo'ladi; proksi tiklangach akkaunt
// o'zi qaytishi kerak.
eq('error holati', qaror(akk({ status: 'error' }), false, null), 'qayta_ulash');

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
