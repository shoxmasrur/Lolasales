import bigInt from 'big-integer';
import { Api, TelegramClient, sessions } from 'teleproto';

import { PgTelegramAccountRepository } from '@/infrastructure/db/repositories/PgTelegramAccountRepository';
import { closePool } from '@/infrastructure/db/pool';
import { errorHaystack } from '@/infrastructure/telegram/telegramErrors';
import { toSocksProxy } from '@/infrastructure/telegram/proxyConfig';
import { logger } from '@/shared/logger';

/**
 * "Bir akkaunt raqamni topadi, ikkinchisi topmaydi" — sababini o'lchaydi.
 *
 *   npm run probe-lookup --workspace=server -- +998901234567
 *   npm run probe-lookup --workspace=server -- +998901234567 "Akkaunt nomi"
 *
 * NEGA KERAK: ishlab turgan kod `lookupByPhone()` ichida ikki bosqichni
 * ketma-ket sinaydi va ikkalasi ham natija bermasa shunchaki "topilmadi"
 * deydi. Qaysi bosqichda va NEGA uzilgani hech qayerda yozilmaydi —
 * shuning uchun bir akkaunt topib, ikkinchisi topmasa, sababini
 * ajratib bo'lmaydi. Bu skript aynan o'sha yo'lni takrorlaydi, lekin
 * har bosqichning XOM javobini ko'rsatadi.
 *
 * NIMA TEKSHIRADI (har bir akkaunt uchun alohida):
 *
 *   0) Bazadagi holat — akkaunt cheklangan deb belgilanganmi.
 *   1) Raqam akkauntning O'ZINIKI emasmi — bunda kod ataylab null
 *      qaytaradi va bu "topilmadi" bo'lib ko'rinadi.
 *   2) contacts.ResolvePhone — xato kodi bilan.
 *   3) contacts.ImportContacts — `imported`, `retryContacts` va `users`
 *      ro'yxatlarining UZUNLIGI bilan. Aynan shu uchtasi bir-biridan
 *      butunlay boshqa sabablarni ajratadi.
 *
 * DIQQAT: bu HAQIQIY so'rovlar yuboradi (har akkauntdan bittadan) va
 * Telegram uchun ular oddiy qidiruv sifatida sanaladi. Kontakt
 * qo'shilsa — darhol o'chiriladi.
 */

const { StringSession } = sessions;

interface Natija {
  akkaunt: string;
  bazadaHolat: string;
  ozRaqami: boolean;
  resolvePhone: string;
  importContacts: string;
  xulosa: string;
}

async function probe(account: {
  label: string;
  phone: string;
  apiId: number;
  apiHash: string;
  session: string | null;
  status: string;
  spamStatus: string;
  floodWaitUntil: Date | null;
  isEnabled: boolean;
  proxy: { host: string; port: number; username: string | null; password: string | null } | null;
}, targetPhone: string): Promise<Natija> {
  const bare = targetPhone.replace(/\D/g, '');
  const bazadaHolat =
    `${account.status}/${account.spamStatus}` +
    (account.isEnabled ? '' : ' O\'CHIRILGAN') +
    (account.floodWaitUntil && account.floodWaitUntil > new Date() ? ' FLOOD-WAIT' : '');

  // Kod `pickUserById()` da `self` foydalanuvchini ATAYLAB null qiladi:
  // akkaunt o'zini mijoz sifatida qaytarmasligi kerak. Raqam akkauntning
  // o'ziniki bo'lsa natija "topilmadi" bo'lib ko'rinadi — sabab esa
  // butunlay boshqa.
  const ozRaqami = account.phone.replace(/\D/g, '') === bare;

  if (!account.session) {
    return { akkaunt: account.label, bazadaHolat, ozRaqami,
      resolvePhone: '—', importContacts: '—', xulosa: 'SESSIYA YO\'Q' };
  }

  const client = new TelegramClient(
    new StringSession(account.session),
    account.apiId,
    account.apiHash,
    { connectionRetries: 3, autoReconnect: false, proxy: toSocksProxy(account.proxy) },
  );
  client.setLogLevel('error' as never);
  await client.connect();

  let resolvePhone = '';
  let importContacts = '';
  let topildi = false;

  try {
    // ─── 1-bosqich: ResolvePhone ────────────────────────────────────────
    try {
      const r = (await client.invoke(
        new Api.contacts.ResolvePhone({ phone: bare }),
      )) as Api.contacts.ResolvedPeer;

      const peerId = r.peer instanceof Api.PeerUser ? String(r.peer.userId) : null;
      const users = (r.users ?? []).filter((u): u is Api.User => u instanceof Api.User);
      const mos = users.find((u) => String(u.id) === peerId);

      resolvePhone =
        `peer=${peerId ?? 'yo\'q'} users=${users.length}` +
        (mos ? ` self=${Boolean(mos.self)}` : ' MOS KELUVCHI YO\'Q');
      if (mos && !mos.self) topildi = true;
    } catch (err) {
      // Xato KODI kerak — matn emas. Kod `errorMessage` maydonida keladi.
      resolvePhone = `XATO: ${errorHaystack(err).split('\n')[0] || 'noma\'lum'}`;
    }

    // ─── 2-bosqich: ImportContacts ──────────────────────────────────────
    try {
      const r = (await client.invoke(
        new Api.contacts.ImportContacts({
          contacts: [
            new Api.InputPhoneContact({
              clientId: bigInt(Date.now()),
              phone: bare,
              firstName: 'Probe',
              lastName: bare.slice(-4),
            }),
          ],
        }),
      )) as Api.contacts.ImportedContacts;

      const users = (r.users ?? []).filter((u): u is Api.User => u instanceof Api.User);
      const importedId = r.imported?.[0]?.userId ? String(r.imported[0]!.userId) : null;
      const mos = users.find((u) => String(u.id) === importedId);

      importContacts =
        `imported=${r.imported?.length ?? 0} retry=${r.retryContacts?.length ?? 0} ` +
        `users=${users.length}` +
        (importedId ? ` id=${importedId} self=${Boolean(mos?.self)}` : '');
      if (mos && !mos.self) topildi = true;

      // Kontaktlar ro'yxatini toza qoldiramiz — ishlab turgan kod ham shunday.
      if (mos) {
        await client
          .invoke(new Api.contacts.DeleteContacts({
            id: [new Api.InputUser({ userId: mos.id, accessHash: mos.accessHash ?? bigInt(0) })],
          }))
          .catch(() => undefined);
      }
    } catch (err) {
      importContacts = `XATO: ${errorHaystack(err).split('\n')[0] || 'noma\'lum'}`;
    }
  } finally {
    await client.disconnect().catch(() => undefined);
  }

  const xulosa = topildi
    ? 'TOPILDI'
    : ozRaqami
      ? 'TOPILMADI (raqam akkauntning O\'ZINIKI — kod buni ataylab yashiradi)'
      : 'TOPILMADI';

  return { akkaunt: account.label, bazadaHolat, ozRaqami, resolvePhone, importContacts, xulosa };
}

async function main(): Promise<void> {
  const targetPhone = process.argv[2];
  const onlyLabel = process.argv[3] ?? null;

  if (!targetPhone) {
    throw new Error('Telefon raqami kerak: npm run probe-lookup --workspace=server -- +998901234567');
  }

  const repo = new PgTelegramAccountRepository();
  const all = await repo.list();
  const targets = onlyLabel ? all.filter((a) => a.label === onlyLabel) : all;

  if (!targets.length) throw new Error('Akkaunt topilmadi');

  logger.info({ raqam: targetPhone, akkauntlar: targets.length }, 'Qidiruv tekshiruvi boshlandi');

  const natijalar: Natija[] = [];
  for (const account of targets) {
    const n = await probe(account, targetPhone).catch((err) => ({
      akkaunt: account.label,
      bazadaHolat: `${account.status}/${account.spamStatus}`,
      ozRaqami: false,
      resolvePhone: '—',
      importContacts: '—',
      xulosa: `ULANIB BO'LMADI: ${err instanceof Error ? err.message : String(err)}`,
    }));
    natijalar.push(n);
    logger.info(n, `${n.akkaunt}: ${n.xulosa}`);
  }

  console.log('\n─── Xulosa ───────────────────────────────────────────────');
  for (const n of natijalar) {
    console.log(`\n${n.akkaunt}  [${n.bazadaHolat}]`);
    console.log(`  ResolvePhone   : ${n.resolvePhone}`);
    console.log(`  ImportContacts : ${n.importContacts}`);
    console.log(`  → ${n.xulosa}`);
  }
  console.log('');
}

main()
  .catch((err) => {
    logger.error({ err }, 'Tekshiruv xatosi');
    process.exitCode = 1;
  })
  .finally(() => void closePool());
