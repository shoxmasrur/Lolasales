import type { TelegramAccount } from '@/domain/entities/TelegramAccount';
import { activeRestrictions } from '@/domain/entities/TelegramAccount';

/**
 * Qo'lda ishga tushiriladi: npm run test:account-restrictions
 *
 * Akkaunt kartasida ko'rinadigan cheklovlar ro'yxati. Xato bu yerda
 * qimmatga tushadi, chunki operator undan AMALIY qaror chiqaradi:
 *
 *   • Muddati o'tgan cheklov ro'yxatda qolsa — operator sog'lom
 *     akkauntni ishlatmay, undiruvni sekinlashtiradi.
 *   • Faol cheklov ro'yxatda bo'lmasa — operator cheklangan akkauntdan
 *     yozadi va cheklovni uzaytiradi.
 *   • Ochilish sanasi TAXMIN qilinsa — yuqoridagi ikkinchi xato,
 *     lekin ishonch bilan.
 */

const NOW = new Date('2026-08-12T10:00:00Z');

function account(patch: Partial<TelegramAccount> = {}): TelegramAccount {
  return {
    id: 'a1', label: 'Sinov', personaName: null, phone: '+998901112233', apiId: 1, apiHash: '',
    session: null, status: 'connected', statusMessage: null, tgUserId: null, tgUsername: null,
    dailyLimit: 40, sentToday: 0, lookupLimit: 50, lookupsToday: 0, counterDate: null,
    floodWaitUntil: null, floodWaitSince: null, peerFloodSince: null,
    spamStatus: 'clean', spamCheckedAt: null, spamMessage: null, spamUntil: null,
    proxy: null, isEnabled: true, styleVersion: 'v1', llmModelId: null, createdAt: NOW, updatedAt: NOW,
    ...patch,
  };
}

let failed = 0;
function check(nom: string, shart: boolean): void {
  if (!shart) failed += 1;
  console.log(`${shart ? '✓' : '✗'} ${nom}`);
}

// ─── Toza akkaunt ──────────────────────────────────────────────────────────
check('toza akkauntda cheklov yo\'q', activeRestrictions(account(), NOW).length === 0);

// ─── FLOOD_WAIT ────────────────────────────────────────────────────────────
{
  const r = activeRestrictions(
    account({
      floodWaitUntil: new Date('2026-08-12T10:30:00Z'),
      floodWaitSince: new Date('2026-08-12T09:20:00Z'),
    }),
    NOW,
  );
  check('faol flood-wait ro\'yxatda', r.length === 1 && r[0]!.kind === 'flood_wait');
  check('flood-wait boshlanish vaqti chiqadi', r[0]?.since?.toISOString() === '2026-08-12T09:20:00.000Z');
  check('flood-wait ochilish vaqti chiqadi', r[0]?.until?.toISOString() === '2026-08-12T10:30:00.000Z');
}

{
  // Muddati o'tgan flood-wait — akkaunt allaqachon ishlaydi.
  const r = activeRestrictions(
    account({
      floodWaitUntil: new Date('2026-08-12T09:00:00Z'),
      floodWaitSince: new Date('2026-08-12T08:00:00Z'),
    }),
    NOW,
  );
  check('muddati o\'tgan flood-wait ro\'yxatga tushmaydi', r.length === 0);
}

// ─── PEER_FLOOD ────────────────────────────────────────────────────────────
{
  const r = activeRestrictions(account({ peerFloodSince: new Date('2026-08-09T10:00:00Z') }), NOW);
  check('peer-flood ro\'yxatda', r.length === 1 && r[0]!.kind === 'peer_flood');
  // MTProto PEER_FLOOD ning tugash vaqtini AYTMAYDI. @SpamBot ham
  // cheklangan demagan ekan — sana yo'q, taxmin ham yo'q.
  check('peer-flood uchun ochilish vaqti taxmin qilinmaydi', r[0]?.until === null);
}

{
  // @SpamBot sana bergan — yagona ishonchli manba.
  const until = new Date('2026-09-12T00:00:00Z');
  const r = activeRestrictions(
    account({ peerFloodSince: new Date('2026-08-09T10:00:00Z'), spamStatus: 'limited', spamUntil: until }),
    NOW,
  );
  check('peer-flood uchun sana @SpamBot dan olinadi', r[0]?.until?.getTime() === until.getTime());
  check('bir cheklov ikki marta ko\'rsatilmaydi', r.length === 1);
}

// ─── @SpamBot "limited" (PEER_FLOOD hali tushmagan) ────────────────────────
{
  const r = activeRestrictions(account({ spamStatus: 'limited', spamUntil: null }), NOW);
  check('spambot cheklovi alohida ko\'rinadi', r.length === 1 && r[0]!.kind === 'limited');
  check('manbasi @SpamBot deb belgilanadi', r[0]?.source === 'spambot');
}

// ─── Bloklangan ────────────────────────────────────────────────────────────
{
  const r = activeRestrictions(account({ status: 'banned', statusMessage: 'USER_DEACTIVATED' }), NOW);
  check('bloklangan akkaunt ro\'yxatda', r.some((x) => x.kind === 'banned'));
}

{
  const r = activeRestrictions(account({ spamStatus: 'banned' }), NOW);
  check('@SpamBot blokni tasdiqlasa ham ro\'yxatda', r.some((x) => x.kind === 'banned'));
}

// ─── Bir vaqtda ikki cheklov ───────────────────────────────────────────────
{
  const r = activeRestrictions(
    account({
      floodWaitUntil: new Date('2026-08-12T10:30:00Z'),
      peerFloodSince: new Date('2026-08-09T10:00:00Z'),
    }),
    NOW,
  );
  // Ikkalasi bir vaqtda bo'lishi mumkin va HAR IKKALASI ko'rinishi
  // kerak: flood-wait o'tgani bilan peer-flood qolaveradi.
  check('flood-wait va peer-flood birga ko\'rinadi', r.length === 2);
}

// ─── Boshlanish vaqti noma'lum (060 migratsiyasidan oldingi yozuvlar) ──────
{
  const r = activeRestrictions(account({ floodWaitUntil: new Date('2026-08-12T10:30:00Z') }), NOW);
  check('boshlanish vaqti yo\'q bo\'lsa null qaytadi', r[0]?.since === null);
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
