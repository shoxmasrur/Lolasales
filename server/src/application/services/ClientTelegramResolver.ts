import type { Client } from '@/domain/entities/Client';
import { allPhones } from '@/domain/entities/Client';
import type { TelegramAccount } from '@/domain/entities/TelegramAccount';
import { canLookup, canSend } from '@/domain/entities/TelegramAccount';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { ITelegramGateway, ResolvedPeer } from '@/domain/services/ITelegramGateway';
import type { IClock } from '@/domain/services/support';
import { cachedPeerUsable } from '@/domain/services/peerCache';
import type { AccountAssigner } from '@/application/services/AccountAssigner';
import { TelegramError } from '@/shared/errors';
import { matchesClientName } from '@/shared/nameMatch';
import { childLogger } from '@/shared/logger';
import { kontekst } from '@/shared/logContext';

const log = childLogger('tg-resolver');

export interface ResolvedClientPeer {
  readonly accountId: string;
  readonly peer: ResolvedPeer;
  /**
   * Ism mos kelmadi, lekin operator ruxsati bilan davom etildi va bu
   * AYNAN SHU qidiruvda aniqlandi.
   *
   * NEGA KERAK: chaqiruvchi mijozning holatiga qarab jurnal yozadi, lekin
   * qidiruv boshlanganda holat hali `name_mismatch` emas edi — u shu
   * yerda, hozir bo'ldi. Bu bayroqsiz bunday yuborish jurnalga umuman
   * tushmasdi va "bu begona odamga nega yozilgan?" degan savolga javob
   * faqat ilova logida qolardi.
   */
  readonly nameMismatchOverridden?: boolean;
  /** Telegramdagi ism — jurnalda mijozning ismi yoniga yoziladi. */
  readonly telegramName?: string;
}

export type ResolveOutcome =
  | { kind: 'ok'; value: ResolvedClientPeer }
  | { kind: 'no_phone' }
  | { kind: 'not_on_telegram' }
  | { kind: 'privacy_restricted' }
  /**
   * Raqam bo'yicha odam topildi, lekin uning Telegramdagi ismi mijozning
   * ismiga umuman mos kelmadi — raqam boshqa odamga o'tgan bo'lishi mumkin.
   * Xabar YUBORILMAYDI, operator o'zi tekshiradi.
   */
  | { kind: 'name_mismatch'; telegramName: string; phone: string }
  /** Tizimda umuman yaroqli Telegram akkaunt yo'q. */
  | { kind: 'no_account' }
  /**
   * Mijozga akkaunt biriktirilmagan va chaqiruvchi avtomatik biriktirishni
   * o'chirgan (`noAutoAssign`) — ya'ni akkauntni operator tanlagan, lekin bu
   * mijoz taqsimotga tushmagan. `no_account` dan ataylab ajratilgan: sabab
   * ham, yechim ham boshqacha ("akkauntlarni qayta taqsimlang", "akkaunt
   * qo'shing" emas).
   */
  | { kind: 'not_assigned' }
  /** Mijozning akkaunti bor, lekin hozir yubora olmaydi (limit, flood, spam). */
  | { kind: 'account_unavailable'; reason: string };

export interface ResolveOptions {
  /**
   * Saqlangan natijani chetlab o'tib, qidiruvni qaytadan bajarish
   * (xodim qo'lda "Telegramdan qidirish" tugmasini bosganda).
   */
  readonly force?: boolean;
  /**
   * Ism mos kelmasa ham davom etish.
   *
   * DIQQAT: bu himoyani ochib beradi — raqam boshqa odamga o'tgan bo'lsa,
   * begona odam mijozning to'lovi haqidagi xabarni oladi. Faqat operator
   * dashboardda ogohlantirishni ko'rib, ataylab tasdiqlaganda `true`
   * bo'ladi. Mijozning holati `name_mismatch` bo'lib QOLADI — hech narsa
   * tekshirilmadi, shunchaki yuborishga ruxsat berildi.
   */
  readonly allowNameMismatch?: boolean;
  /**
   * Akkaunti yo'q mijozni AVTOMATIK biriktirmaslik.
   *
   * NEGA: ommaviy suhbat boshlashda operator qaysi akkauntlardan
   * yozilishini o'zi tanlaydi va taqsimlash tsikldan oldin bir marta
   * bajariladi. Shundan keyin ham `ensureAssigned` ishlab tursa, u
   * operatorning tanlovini bilmagani uchun HAMMA yaroqli akkaunt orasidan
   * tanlaydi — natijada mijoz tanlanmagan akkauntdan xabar olardi.
   *
   * Bunday mijoz haqiqatan uchraydi: `AccountAssigner.reassignFrom`
   * akkauntning hamma mijozini bo'shatadi, keyingi `assignUnassigned` esa
   * bir martada faqat `BATCH` (2000) tasini qaytaradi — qolganlari
   * `telegram_account_id IS NULL` bo'lib turaveradi. Chiquvchi xabari
   * borligi uchun ular rejaga ham kirmaydi (`findReassignableForBulkStart`).
   *
   * `true` bo'lsa bunday mijoz `no_account` bilan o'tkazib yuboriladi —
   * operator progressda ko'radi va akkauntlarni qayta taqsimlaydi.
   */
  readonly noAutoAssign?: boolean;
  /**
   * Nima uchun aniqlanyapti — XABAR kvotasi tekshirilishi shunga bog'liq.
   *
   *   'outreach' — suhbat boshlash oldidan. Xabar kvotasi ham
   *     tekshiriladi: kvota tugagan bo'lsa qidirishning ma'nosi yo'q,
   *     bekorga `importContacts` chaqirilardi.
   *   'lookup' — faqat aniqlash (ommaviy yoki qo'lda qidirish). Xabar
   *     kvotasi tekshirilmaydi.
   *
   * QIDIRUV kvotasi bunga bog'liq EMAS — u ikkala maqsadda ham, faqat
   * haqiqatan qidiruv bajarilishidan oldin tekshiriladi (pastda).
   */
  readonly purpose?: 'outreach' | 'lookup';
}

/**
 * Mijozni telefon raqami orqali Telegramdan topadi va natijani keshlaydi
 * (clients.telegram_user_id). Ikkinchi marta qidirish so'rovi yuborilmaydi —
 * ortiqcha `importContacts` chaqiruvlari akkauntni spam filtriga yaqinlashtiradi.
 */
export class ClientTelegramResolver {
  constructor(
    private readonly clients: IClientRepository,
    private readonly accounts: ITelegramAccountRepository,
    private readonly gateway: ITelegramGateway,
    private readonly clock: IClock,
    private readonly assigner: AccountAssigner,
  ) {}

  async resolve(client: Client, options: ResolveOptions = {}): Promise<ResolveOutcome> {
    const { force = false, allowNameMismatch = false, noAutoAssign = false, purpose = 'outreach' } = options;

    // Mijozga biriktirilgan akkaunt — u O'ZGARMAYDI.
    //
    // Akkaunti bo'lmasa odatda shu yerda avtomatik biriktiriladi. Lekin
    // chaqiruvchi akkauntlarni O'ZI tanlagan bo'lsa (`noAutoAssign`), bu
    // fallback o'chiriladi: aks holda operator tanlamagan akkauntdan
    // xabar ketardi.
    if (!client.telegramAccountId && noAutoAssign) {
      log.warn(
        { clientId: client.id },
        'Mijozga akkaunt biriktirilmagan, avtomatik biriktirish o\'chirilgan — o\'tkazib yuborildi',
      );
      return { kind: 'not_assigned' };
    }
    const accountId = client.telegramAccountId ?? (await this.assigner.ensureAssigned(client.id));
    if (!accountId) return { kind: 'no_account' };

    const availability = await this.checkAccount(accountId, purpose);
    if (!availability.ok) return { kind: 'account_unavailable', reason: availability.reason };
    const account = accountId;
    const tgAccount = availability.account;

    // Ism mos kelmagan mijozda ham identifikator SAQLANGAN bo'ladi (xodim
    // ko'rib tasdiqlashi uchun), lekin u TASDIQLANMAGUNCHA ishlatilmaydi —
    // aks holda begona odamga xabar ketardi.
    //
    // `force` — xodim "qaytadan qidirish" tugmasini bosganda: o'shanda
    // qidiruv baribir bajariladi (raqam tuzatilgan bo'lishi mumkin).
    if (client.telegramStatus === 'name_mismatch' && !force && !allowNameMismatch) {
      return {
        kind: 'name_mismatch',
        telegramName: client.telegramName ?? '',
        phone: client.phone ?? '',
      };
    }

    // Allaqachon topilgan bo'lsa — qayta qidirmaymiz (xodim majburlamasa).
    //
    // LEKIN kesh faqat uni TOPGAN akkaunt uchun yaroqli: `access_hash`
    // (akkaunt, peer) juftligiga bog'langan. Mijoz boshqa akkauntga
    // o'tkazilgan bo'lsa (ommaviy suhbat boshlashda operator akkaunt
    // tanlaganda shunday bo'ladi), eski hash bilan yozish `PEER_ID_INVALID`
    // beradi va suhbat boshlanmaydi. Bunday holatda keshni chetlab o'tib,
    // pastdagi qidiruvga tushamiz — yangi akkaunt o'zi uchun hash oladi.
    if (cachedPeerUsable(client, account) && !force) {
      return {
        kind: 'ok',
        value: {
          accountId: account,
          peer: {
            telegramUserId: client.telegramUserId,
            accessHash: client.telegramAccessHash,
            username: client.telegramUsername,
            firstName: client.fullName,
            lastName: null,
          },
        },
      };
    }

    const phones = allPhones(client);
    if (!phones.length) {
      await this.clients.setTelegramStatus(client.id, 'not_found');
      return { kind: 'no_phone' };
    }

    // Qidiruv kvotasi AYNAN SHU YERDA tekshiriladi — pastdagi tsikl
    // `importContacts` chaqiradigan yagona joy.
    //
    // NEGA `checkAccount` ichida emas: u `resolve()` ning boshida, ya'ni
    // keshlangan peer uchun erta qaytishdan ham, `name_mismatch` dan ham
    // OLDIN ishlaydi. Tekshiruv o'sha yerda turganda qidiruv kvotasi
    // qidiruv umuman bo'lmaydigan yo'llarni ham to'sardi: operator avval
    // ommaviy qidiruvni bajarib kvotani tugatsa, keyin xabar kvotasi
    // 30/30 tegilmagan turgani holda birorta ham suhbat boshlanmasdi —
    // hatto `telegram_user_id` allaqachon saqlangan mijozlar uchun ham.
    //
    // Tekshiruvni kvota SARFLANADIGAN joyga qo'yish shu xatoni takrorlash
    // imkoniyatini yo'q qiladi: bayroq uzatilmaydi, ikkita joy bir-biridan
    // ajralib ketmaydi.
    if (!canLookup(tgAccount, this.clock.now(), this.clock.todayIso())) {
      return {
        kind: 'account_unavailable',
        reason: `"${tgAccount.label}" kunlik qidiruv chegarasini to'ldirgan`,
      };
    }

    await this.clients.setTelegramStatus(client.id, 'searching');
    let sawPrivacy = false;

    for (const phone of phones) {
      try {
        // Hisoblagich so'rovdan OLDIN oshadi.
        //
        // NEGA oldin: natijadan qat'i nazar Telegram uchun so'rovning o'zi
        // signal, topilmagan raqam ham xuddi shunday sanaladi. So'rovdan
        // keyin oshirilsa, xato bo'lgan urinishlar hisobga tushmaydi —
        // `TelegramError` qayta otiladi, qolgan xatolar yutiladi. Bu esa
        // hisob eng muhim bo'lgan paytda (FLOOD_WAIT / PEER_FLOOD, ya'ni
        // akkaunt allaqachon cheklanayotganda) kam sanardi.
        //
        // `try/finally` ham shu natijani berardi, lekin oldin oshirish
        // qisqaroq va bir xil ishonchli: kam sanashdan ko'ra ortiq
        // sanash xavfsizroq — hisoblagichning maqsadi akkauntni himoya
        // qilish.
        await this.accounts.incrementLookupsToday(account, this.clock.todayIso());
        const result = await this.gateway.lookupByPhone(account, phone);

        if (result.kind === 'found') {
          // Raqamlar qo'ldan qo'lga o'tadi: mijoz raqamini o'zgartirgan bo'lsa,
          // o'sha raqam boshqa odamda bo'lishi mumkin. To'lov haqida begona
          // odamga yozish — shaxsiy ma'lumotni oshkor qilish demakdir.
          const telegramName = [result.peer.firstName, result.peer.lastName]
            .filter(Boolean)
            .join(' ')
            .trim();
          const verdict = matchesClientName(client.fullName, telegramName);

          if (verdict === 'mismatch') {
            // Topilgan profilni TO'LIQ saqlaymiz (id, access hash, username,
            // ism), lekin holat `name_mismatch` bo'lib qoladi va xabar
            // yuborilmaydi.
            //
            // Nega to'liq saqlaymiz: odamlar Telegramda ismini o'zgacha
            // qo'yadi ("Ulug'bek", "SANJAR zarb sadosi"), shuning uchun
            // mos kelmaslik har doim ham begona odam degani emas. Xodim
            // profilni ko'rib, o'zi tasdiqlashi mumkin — o'shanda
            // identifikator allaqachon joyida bo'lsin, qayta qidirish
            // shart bo'lmasin.
            await this.clients.setTelegramIdentity(
              client.id,
              {
                telegramUserId: result.peer.telegramUserId,
                telegramUsername: result.peer.username,
                telegramAccessHash: result.peer.accessHash,
                telegramName: telegramName || null,
                telegramHashAccountId: account,
              },
              'name_mismatch',
            );
            if (allowNameMismatch) {
              log.warn(
                { clientId: client.id, phone, mijoz: client.fullName, telegramda: telegramName },
                'Ism mos kelmadi, lekin operator ruxsati bilan yuborilyapti',
              );
              return {
                kind: 'ok',
                value: {
                  accountId: account,
                  peer: result.peer,
                  nameMismatchOverridden: true,
                  telegramName,
                },
              };
            }

            log.warn(
              { clientId: client.id, phone, mijoz: client.fullName, telegramda: telegramName },
              'Telegramdagi ism mijozning ismiga mos kelmadi — odam tekshirishi kerak',
            );
            return { kind: 'name_mismatch', telegramName, phone };
          }

          await this.clients.setTelegramIdentity(
            client.id,
            {
              telegramUserId: result.peer.telegramUserId,
              telegramUsername: result.peer.username,
              telegramAccessHash: result.peer.accessHash,
              telegramName: telegramName || null,
              telegramHashAccountId: account,
            },
            'found',
          );
          log.info(
            { ...kontekst({ akkaunt: tgAccount.label, mijoz: client.fullName }), clientId: client.id, phone, nameCheck: verdict },
            'Mijoz Telegramdan topildi',
          );
          return { kind: 'ok', value: { accountId: account, peer: result.peer } };
        }

        if (result.kind === 'privacy_restricted') sawPrivacy = true;
      } catch (err) {
        if (err instanceof TelegramError) throw err;
        log.warn(
          { ...kontekst({ akkaunt: tgAccount.label, mijoz: client.fullName }), clientId: client.id, phone, err },
          'Telefon bo\'yicha qidirish xatosi',
        );
      }
    }

    // Bu safar hech kim topilmadi — oldingi qidiruvdan qolgan ismni ham
    // tozalaymiz, aks holda kartada eskirgan ism ko'rinib, xodimni
    // chalg'itadi ("Telegramda: Ulug'bek", holat esa "Telegramda yo'q").
    await this.clients.setTelegramName(client.id, null);
    await this.clients.setTelegramStatus(client.id, sawPrivacy ? 'privacy_restricted' : 'not_found');
    return sawPrivacy ? { kind: 'privacy_restricted' } : { kind: 'not_on_telegram' };
  }

  /**
   * Mijozning akkaunti hozir umuman ishlay oladimi (ulangan, bloklanmagan,
   * flood-wait'da emas) va — `outreach` bo'lsa — xabar kvotasi bormi.
   * Yubora olmasa BOSHQA AKKAUNTGA O'TILMAYDI — mijoz uchun suhbat
   * bir odam bilan ketayotgandek qolishi kerak.
   *
   * Qidiruv kvotasi bu yerda TEKSHIRILMAYDI — u `resolve()` ichida, qidiruv
   * tsikli boshlanadigan joyda tekshiriladi (sababi o'sha yerda yozilgan).
   * Shu sababli muvaffaqiyatli javob akkauntning o'zini ham qaytaradi:
   * bir xil ma'lumot uchun bazaga ikki marta bormasligimiz kerak.
   */
  private async checkAccount(
    accountId: string,
    purpose: 'outreach' | 'lookup',
  ): Promise<{ ok: true; account: TelegramAccount } | { ok: false; reason: string }> {
    const account = await this.accounts.findById(accountId);
    if (!account) return { ok: false, reason: 'Biriktirilgan akkaunt topilmadi' };

    if (!account.isEnabled) return { ok: false, reason: `"${account.label}" o'chirilgan` };
    if (account.status !== 'connected') {
      return { ok: false, reason: `"${account.label}" ulanmagan (${account.status})` };
    }
    if (account.spamStatus === 'banned') {
      return { ok: false, reason: `"${account.label}" bloklangan — mijozlarni qayta taqsimlang` };
    }
    if (account.spamStatus === 'limited') {
      return { ok: false, reason: `"${account.label}" spam filtrida (cheklangan)` };
    }

    const now = this.clock.now();
    if (account.floodWaitUntil && account.floodWaitUntil.getTime() > now.getTime()) {
      return { ok: false, reason: `"${account.label}" flood-wait holatida` };
    }
    // Suhbat boshlash oldidan xabar kvotasi ham tekshiriladi: kvota
    // tugagan bo'lsa qidirishning ma'nosi yo'q.
    //
    // Bu tekshiruv ATAYLAB shu yerda — keshlangan peer uchun erta
    // qaytishdan oldin: xabar kvotasi tugagan bo'lsa, peer allaqachon
    // ma'lum bo'lsa ham suhbat boshlanmaydi, ya'ni bu foydali erta chiqish.
    if (purpose === 'outreach' && !canSend(account, now, this.clock.todayIso())) {
      return { ok: false, reason: `"${account.label}" kunlik limitini to'ldirgan` };
    }

    return { ok: true, account };
  }
}
