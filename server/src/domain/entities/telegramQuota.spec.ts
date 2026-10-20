import type { TelegramAccount } from '@/domain/entities/TelegramAccount';
import { canLookup, canReply, canSend } from '@/domain/entities/TelegramAccount';

/**
 * Qo'lda ishga tushiriladi: npm run test:telegram-quota
 *
 * Bu qoida ban xavfiga taalluqli, shuning uchun sof funksiya sifatida
 * ajratilgan va alohida tekshiriladi:
 *
 *   canSend  — NOTANISH odamga birinchi xabar. Kunlik kvota shu yerda.
 *   canReply — MAVJUD suhbatda javob. Kvota tekshirilmaydi.
 *
 * Ikkalasi adashtirilsa oqibat jiddiy: `canSend` javoblarga ham
 * qo'llansa, kvota tugagach agent kun o'rtasida jim qoladi va mijoz
 * javobsiz qoladi. Aksincha, `canReply` birinchi murojaatga qo'llansa,
 * akkaunt cheksiz notanish odamga yozib PEER_FLOOD ga tushadi.
 */

const TODAY = '2026-08-06';
const NOW = new Date('2026-08-06T10:00:00Z');

function account(patch: Partial<TelegramAccount> = {}): TelegramAccount {
  return {
    id: 'a1', label: 'Sinov', personaName: null, phone: '+998901112233', apiId: 1, apiHash: '', session: null,
    status: 'connected', statusMessage: null, tgUserId: null, tgUsername: null,
    dailyLimit: 40, sentToday: 0,
    lookupLimit: 50, lookupsToday: 0,
    counterDate: TODAY,
    floodWaitUntil: null,
    floodWaitSince: null,
    peerFloodSince: null,
    spamStatus: 'clean', spamCheckedAt: null, spamMessage: null, spamUntil: null,
    proxy: null,
    isEnabled: true, styleVersion: 'v1', llmModelId: null, premiumUntil: null, premiumEslatildi: null, createdAt: NOW, updatedAt: NOW,
    ...patch,
  };
}

const CASES: Array<{ holat: string; acc: TelegramAccount; send: boolean; reply: boolean }> = [
  {
    holat: 'toza akkaunt',
    acc: account(),
    send: true, reply: true,
  },
  {
    // ASOSIY HOLAT: kvota tugadi. Yangi murojaat to'xtaydi, javob ketaveradi.
    holat: 'kunlik kvota to\'ldi',
    acc: account({ sentToday: 40 }),
    send: false, reply: true,
  },
  {
    holat: 'kvota to\'lgan, lekin hisoblagich kechagi kunniki',
    acc: account({ sentToday: 40, counterDate: '2026-08-05' }),
    send: true, reply: true,
  },
  {
    // Spam filtri cheklagan akkaunt notanishga yoza olmaydi, lekin
    // mavjud suhbatni davom ettira oladi.
    holat: 'spam filtri cheklagan (limited)',
    acc: account({ spamStatus: 'limited', spamUntil: new Date('2026-08-10T00:00:00Z') }),
    send: false, reply: true,
  },
  {
    holat: 'bloklangan (banned)',
    acc: account({ spamStatus: 'banned', spamUntil: new Date('2026-08-10T00:00:00Z') }),
    send: false, reply: false,
  },
  {
    // FLOOD_WAIT — Telegram o'zi kutishni talab qilgan. Ikkalasi ham to'xtaydi.
    holat: 'flood-wait davom etyapti',
    acc: account({ floodWaitUntil: new Date('2026-08-06T11:00:00Z') }),
    send: false, reply: false,
  },
  {
    holat: 'flood-wait tugagan',
    acc: account({ floodWaitUntil: new Date('2026-08-06T09:00:00Z') }),
    send: true, reply: true,
  },
  {
    holat: 'akkaunt o\'chirilgan',
    acc: account({ isEnabled: false }),
    send: false, reply: false,
  },
  {
    holat: 'ulanmagan',
    acc: account({ status: 'logged_out' }),
    send: false, reply: false,
  },
];

let failed = 0;
for (const c of CASES) {
  const send = canSend(c.acc, NOW, TODAY);
  const reply = canReply(c.acc, NOW);
  const ok = send === c.send && reply === c.reply;
  if (!ok) failed += 1;
  console.log(
    `${ok ? '✓' : '✗'} ${c.holat}: yangi=${send} javob=${reply}` +
      (ok ? '' : `  (kutilgan: yangi=${c.send} javob=${c.reply})`),
  );
}

// ─── canLookup ────────────────────────────────────────────────────────
//
// Qidiruv (importContacts) — xabardan alohida signal, shuning uchun
// alohida hisoblagich va alohida chegara. Xabar kvotasi tugagani
// qidiruvni to'xtatmasligi kerak va aksincha.

const LOOKUP_CASES: Array<{ holat: string; acc: TelegramAccount; kutilgan: boolean }> = [
  { holat: 'toza akkaunt qidira oladi', acc: account(), kutilgan: true },
  {
    holat: 'qidiruv kvotasi to\'ldi',
    acc: account({ lookupsToday: 50 }),
    kutilgan: false,
  },
  {
    holat: 'qidiruv kvotasi to\'lgan, lekin hisoblagich kechagi kunniki',
    acc: account({ lookupsToday: 50, counterDate: '2026-08-05' }),
    kutilgan: true,
  },
  {
    // MUHIM: ikki kvota bir-biriga bog'liq emas.
    holat: 'xabar kvotasi to\'lgan, qidiruv kvotasi bo\'sh',
    acc: account({ sentToday: 40 }),
    kutilgan: true,
  },
  { holat: 'akkaunt o\'chirilgan', acc: account({ isEnabled: false }), kutilgan: false },
  { holat: 'ulanmagan', acc: account({ status: 'logged_out' }), kutilgan: false },
  {
    holat: 'flood-wait davom etyapti',
    acc: account({ floodWaitUntil: new Date('2026-08-06T11:00:00Z') }),
    kutilgan: false,
  },
  {
    holat: 'spam filtri cheklagan',
    acc: account({ spamStatus: 'limited', spamUntil: new Date('2026-08-10T00:00:00Z') }),
    kutilgan: false,
  },
];

for (const c of LOOKUP_CASES) {
  const actual = canLookup(c.acc, NOW, TODAY);
  const ok = actual === c.kutilgan;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} qidiruv: ${c.holat}: ${actual}` + (ok ? '' : `  (kutilgan: ${c.kutilgan})`));
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
