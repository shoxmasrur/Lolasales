import { cachedPeerUsable } from '@/domain/services/peerCache';

/**
 * Qo'lda ishga tushiriladi: npm run test:peer-cache
 *
 * NEGA ALOHIDA TEKSHIRILADI: bu qoida buzilganda prodda `PEER_ID_INVALID`
 * chiqadi va suhbat umuman boshlanmaydi — 2026-08-08 dagi nosozlik aynan
 * shu edi. MTProto'da `access_hash` (akkaunt, peer) juftligiga bog'langan:
 * bitta akkaunt topgan hash boshqa akkaunt uchun yaroqsiz. Mijoz boshqa
 * akkauntga o'tkazilgan bo'lsa, keshdagi hash bilan yozib bo'lmaydi.
 */

let failed = 0;

function eq(nom: string, actual: boolean, kutilgan: boolean): void {
  if (actual === kutilgan) {
    console.log(`✓ ${nom}`);
  } else {
    failed += 1;
    console.log(`✗ ${nom}: ${actual}  (kutilgan: ${kutilgan})`);
  }
}

const AKK_A = 'akkaunt-a';
const AKK_B = 'akkaunt-b';

// ── 1. Hash'ni topgan akkaunt yozmoqchi — kesh ishlatiladi ──────────────
eq(
  'hash o\'sha akkauntniki',
  cachedPeerUsable({ telegramUserId: '123', telegramHashAccountId: AKK_A }, AKK_A),
  true,
);

// ── 2. Boshqa akkaunt yozmoqchi — kesh ISHLATILMAYDI ────────────────────
// Prodda xato bergan holat: mijoz A akkauntda topilgan, keyin ommaviy
// suhbat boshlashda B akkauntga o'tkazilgan.
eq(
  'hash boshqa akkauntniki',
  cachedPeerUsable({ telegramUserId: '123', telegramHashAccountId: AKK_B }, AKK_A),
  false,
);

// ── 3. Qaysi akkaunt topgani noma'lum — ishonmaymiz ────────────────────
// 051 migratsiyasidan oldingi qatorlar: akkaunt hash'dan KEYIN
// almashtirilgan bo'lsa ustun NULL qoldiriladi. Bunday hash'ga ishonish
// aynan nosozlikni saqlab qolardi.
eq(
  'hash egasi noma\'lum',
  cachedPeerUsable({ telegramUserId: '123', telegramHashAccountId: null }, AKK_A),
  false,
);

// ── 4. Umuman topilmagan mijoz — keshda hech narsa yo'q ────────────────
eq(
  'mijoz hali topilmagan',
  cachedPeerUsable({ telegramUserId: null, telegramHashAccountId: null }, AKK_A),
  false,
);

// ── 5. Egasi bor-u, identifikator yo'q — ishonchsiz qator ──────────────
// Bunday bo'lmasligi kerak, lekin bo'lsa qayta qidirish xavfsizroq.
eq(
  'egasi bor, telegram_user_id yo\'q',
  cachedPeerUsable({ telegramUserId: null, telegramHashAccountId: AKK_A }, AKK_A),
  false,
);

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
