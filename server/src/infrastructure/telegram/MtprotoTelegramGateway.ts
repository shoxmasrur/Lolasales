import { Api, TelegramClient, client as tgClient, errors, events, password, sessions } from 'teleproto';
import bigInt from 'big-integer';

import type { TelegramAccount } from '@/domain/entities/TelegramAccount';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type {
  AccountProbe,
  ChannelComment,
  ChannelCommentsResult,
  ChannelInfo,
  ChannelPost,
  IncomingMessage,
  GateOptions,
  ITelegramGateway,
  LoginConfirmResult,
  LoginStartResult,
  QrLoginStartResult,
  MessagesReadEvent,
  OutgoingFile,
  PhoneLookupResult,
  RawTelegramMessage,
  ResolvedPeer,
  SentMessage,
  SpamCheckResult,
  TelegramDialog,
  TelegramHistoryMessage,
  TelegramPeerKind,
  TelegramPeerRef,
} from '@/domain/services/ITelegramGateway';
import type { AccountGate } from '@/infrastructure/telegram/AccountGate';
import { mediaFromMessage } from '@/infrastructure/telegram/mediaFromMessage';
import { parseSpamBotReply } from '@/infrastructure/telegram/spamBotReply';
import { pickUserById } from '@/infrastructure/telegram/peerSelection';
import { kiruvchigaQabul, peerKindOf } from '@/infrastructure/telegram/kiruvchiFiltr';
import {
  errorHaystack,
  isMessageNotModified,
  isOwnAccountDeactivated,
  isPasswordNeeded,
  isTargetDeactivated,
} from '@/infrastructure/telegram/telegramErrors';
import { proxyErrorMessage, toSocksProxy } from '@/infrastructure/telegram/proxyConfig';
import { tgAuditOrnat, tgHodisaYoz } from '@/infrastructure/telegram/tgAudit';
import { tgTana } from '@/infrastructure/telegram/tgSanitize';
import {
  sessiyaIzi,
  type OchilishSababi,
  type TelegramSessiyasi,
} from '@/infrastructure/telegram/sessiyaIzi';
import { createHash } from 'node:crypto';
import { AppError, NotFoundError, TelegramError } from '@/shared/errors';
import { sleep } from '@/shared/datetime';
import type { IEventBus } from '@/domain/services/support';
import { classifyLoginToken, isSamePhone, qrRefreshDelayMs, type QrTokenResult } from '@/infrastructure/telegram/qrLogin';
import { formatPhone, normalizePhone } from '@/shared/phone';

/** Telegramning rasmiy anti-spam boti. */
const SPAM_BOT = '@SpamBot';
const SPAM_POLL_ATTEMPTS = 6;
const SPAM_POLL_DELAY_MS = 1200;
import { childLogger } from '@/shared/logger';
import { izohMuallifi, type IzohFromId, type IzohUser } from '@/infrastructure/telegram/izohMuallifi';

const log = childLogger('telegram');

const { StringSession } = sessions;
const { MessageRead, NewMessage, Raw } = events;
const { computeCheck } = password;

/** MTProto kutubxonasining o'z logi juda "shovqinli" — faqat xatolar. */
const MTPROTO_LOG_LEVEL = 'error' as Parameters<TelegramClient['setLogLevel']>[0];

/**
 * Telegramga `initConnection` da aytiladigan "kim ekanimiz" — MTProto'dagi
 * User-Agent o'rni. Bitta joyda: klientga ham, sessiya jurnaliga ham shu ketadi.
 */
const KLIENT_IMZOSI = {
  deviceModel: 'LolaSales',
  systemVersion: 'macOS',
  appVersion: '1.0',
} as const;

/** Unix soniyani ISO vaqtga; nol yoki bo'sh bo'lsa `null`. */
function unixIso(v: unknown): string | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
}

/** QR kutishning umumiy muddati — undan keyin akkaunt "Kirilmagan" ga qaytadi. */
const QR_TOTAL_MS = 120_000;
/**
 * Token eskirishidan shuncha oldin yangilanadi. Navbat (`AccountGate`)
 * chaqiruvlar orasiga tanaffus qo'yadi — zaxira shu kechikishni yopadi.
 */
const QR_REFRESH_MARGIN_MS = 5_000;


interface Connection {
  client: TelegramClient;
  account: TelegramAccount;
  /** auth.SendCode natijasi — kodni tasdiqlashda kerak. */
  pendingPhoneCodeHash?: string;
  detachHandler?: () => void;
  /** QR tsikli ishlayotgan bo'lsa — to'xtatish uchun. */
  qr?: { abort: AbortController; detachUpdate: () => void };
  /**
   * Login QR orqali boshlangan. Parol bosqichida ham raqam tekshirilishi
   * uchun `qr` dan alohida: `qr` skanerlangach o'chadi, bu esa yo'q.
   */
  viaQr?: boolean;
}

type IncomingHandler = (msg: IncomingMessage) => Promise<void>;

/**
 * MTProto (teleproto/GramJS) ustidagi adapter.
 * Domen qatlami faqat ITelegramGateway'ni ko'radi — MTProto turlari
 * shu fayldan tashqariga chiqmaydi.
 */
export class MtprotoTelegramGateway implements ITelegramGateway {
  private readonly connections = new Map<string, Connection>();
  private readonly handlers = new Set<IncomingHandler>();
  /** Jonli kuzatuv obunachilari — agent mantiqidan mustaqil. */
  private readonly rawHandlers = new Set<(msg: RawTelegramMessage) => void>();
  private readonly readHandlers = new Set<(e: MessagesReadEvent) => Promise<void>>();

  constructor(
    private readonly accounts: ITelegramAccountRepository,
    /**
     * Akkaunt navbati. Har bir Telegram chaqiruvi shu yerdan o'tadi —
     * shuning uchun keyin yozilgan kod ham uni chetlab o'tolmaydi.
     */
    private readonly gate: AccountGate,
    /** QR login fonda yangilanadi — natija HTTP javobidan keyin keladi. */
    private readonly events: IEventBus,
  ) {}

  /**
   * Bir necha chaqiruvni BITTA bo'lak sifatida bajaradi.
   *
   * Xabar yuborish aslida uchta chaqiruv: o'qildi → yozmoqda → yubordi.
   * Ular orasiga boshqa operatsiya (masalan kontakt qidiruvi) tushsa,
   * tabiiy ketma-ketlik buziladi va tashqaridan bot ishlagandek ko'rinadi.
   */
  async runExclusive<T>(accountId: string, options: GateOptions, fn: () => Promise<T>): Promise<T> {
    return this.gate.run(accountId, options, fn);
  }

  async bootstrap(): Promise<void> {
    const all = await this.accounts.list();
    sessiyaIzi.jarayon('boshlandi', {
      akkauntlar: all.length,
      ulanadigan: all.filter((a) => a.session && a.isEnabled).length,
    });
    for (const account of all) {
      // QR kutish tsikli xotirada yashaydi: server qayta ishga tushsa u
      // o'ladi, DB'da esa `awaiting_qr` qoladi. Hech kim uni tuzatmasa,
      // operator QR'ni qayta boshlay olmaydi. Sessiyasi bor akkauntni
      // quyida `connect` o'zi to'g'ri holatga o'tkazadi.
      if (account.status === 'awaiting_qr') {
        await this.accounts.setStatus(account.id, 'logged_out', {
          statusMessage: 'QR kutish server qayta ishga tushganda to\'xtadi',
        });
      }
      if (!account.session || !account.isEnabled) continue;
      try {
        await this.connect(account, 'bootstrap');
        log.info({ account: account.label }, 'Telegram akkaunt ulandi');
      } catch (err) {
        log.error({ account: account.label, err }, 'Telegram akkauntni ulab bo\'lmadi');
        await this.accounts.setStatus(account.id, 'error', {
          statusMessage: err instanceof Error ? err.message : 'Ulanish xatosi',
        });
      }
    }
  }

  async reconnect(accountId: string): Promise<void> {
    return this.gate.run(
      accountId,
      { kind: 'other', priority: 'manual', label: 'reconnect' },
      () => this.reconnectIchki(accountId),
    );
  }

  private async reconnectIchki(accountId: string): Promise<void> {
    // QR tsikli o'z ulanishini ushlab turadi: uni to'xtatmasak, ulanish
    // uzilgach tsikl xato bilan tugaydi, `endQr` begona ulanishni ko'rib
    // jim qaytadi va DB'da `awaiting_qr` qolib ketadi. To'xtatilgan tsikl
    // holatni o'zi yozmaydi, shuning uchun sessiyasiz akkauntda (pastdagi
    // erta qaytish) `logged_out` ni shu yerda o'zimiz qo'yamiz.
    const qrStopped = await this.stopQr(accountId);
    const account = await this.requireAccount(accountId);

    const existing = this.connections.get(accountId);
    if (existing) {
      existing.detachHandler?.();
      sessiyaIzi.ozimizYopdik(existing.account.label, 'reconnect', false);
      await existing.client.disconnect().catch(() => undefined);
      this.connections.delete(accountId);
    }

    // Sessiyasiz yoki o'chirilgan akkauntni ulashga urinmaymiz —
    // `bootstrap` bilan bir xil shart.
    if (!account.session || !account.isEnabled) {
      if (qrStopped) {
        await this.accounts.setStatus(accountId, 'logged_out', { statusMessage: null });
        this.events.publish({ type: 'telegram.status', accountId, status: 'logged_out' });
      }
      return;
    }

    try {
      await this.connect(account, 'reconnect');
      log.info({ account: account.label }, 'Telegram akkaunt qayta ulandi');
    } catch (err) {
      log.error({ account: account.label, err }, 'Qayta ulanmadi');
      await this.accounts.setStatus(account.id, 'error', {
        statusMessage: err instanceof Error ? err.message : 'Ulanish xatosi',
      });
    }
  }

  // ─── Login ────────────────────────────────────────────────────────────────

  async startLogin(accountId: string): Promise<LoginStartResult> {
    return this.gate.run(
      accountId,
      { kind: 'other', priority: 'manual', label: 'startLogin' },
      () => this.startLoginIchki(accountId),
    );
  }

  private async startLoginIchki(accountId: string): Promise<LoginStartResult> {
    await this.stopQr(accountId);
    const account = await this.requireAccount(accountId);
    const client = await this.openClient(account, true, 'login-kod');

    try {
      const result = await client.invoke(
        new Api.auth.SendCode({
          phoneNumber: account.phone,
          apiId: account.apiId,
          apiHash: account.apiHash,
          settings: new Api.CodeSettings({}),
        }),
      );

      const phoneCodeHash = (result as Api.auth.SentCode).phoneCodeHash;
      if (!phoneCodeHash) throw new AppError('Telegram kod yubormadi', 502, 'TELEGRAM_NO_CODE');

      this.connections.set(accountId, { client, account, pendingPhoneCodeHash: phoneCodeHash });
      await this.accounts.setStatus(accountId, 'awaiting_code', { statusMessage: 'Kod yuborildi' });

      return { phoneCodeHash, status: 'code_sent' };
    } catch (err) {
      throw this.translateError(err, accountId);
    }
  }

  async confirmCode(accountId: string, phoneCodeHash: string, code: string): Promise<LoginConfirmResult> {
    return this.gate.run(
      accountId,
      { kind: 'other', priority: 'manual', label: 'confirmCode' },
      () => this.confirmCodeIchki(accountId, phoneCodeHash, code),
    );
  }

  private async confirmCodeIchki(accountId: string, phoneCodeHash: string, code: string): Promise<LoginConfirmResult> {
    const conn = this.connections.get(accountId);
    if (!conn) throw new AppError('Avval "Kod yuborish" tugmasini bosing', 409, 'LOGIN_NOT_STARTED');

    try {
      const result = await conn.client.invoke(
        new Api.auth.SignIn({
          phoneNumber: conn.account.phone,
          phoneCodeHash: phoneCodeHash || conn.pendingPhoneCodeHash || '',
          phoneCode: code,
        }),
      );
      return await this.finishLogin(accountId, conn, result);
    } catch (err) {
      if (isPasswordNeeded(err)) {
        await this.accounts.setStatus(accountId, 'awaiting_password', {
          statusMessage: 'Ikki bosqichli parol talab qilinadi',
        });
        return { status: 'password_required' };
      }
      throw this.translateError(err, accountId);
    }
  }

  async confirmPassword(accountId: string, plainPassword: string): Promise<LoginConfirmResult> {
    return this.gate.run(
      accountId,
      { kind: 'other', priority: 'manual', label: 'confirmPassword' },
      () => this.confirmPasswordIchki(accountId, plainPassword),
    );
  }

  private async confirmPasswordIchki(accountId: string, plainPassword: string): Promise<LoginConfirmResult> {
    const conn = this.connections.get(accountId);
    if (!conn) throw new AppError('Login sessiyasi tugagan — qaytadan boshlang', 409, 'LOGIN_EXPIRED');

    try {
      const pwdInfo = await conn.client.invoke(new Api.account.GetPassword());
      const srp = await computeCheck(pwdInfo, plainPassword);
      const result = await conn.client.invoke(new Api.auth.CheckPassword({ password: srp }));
      return await this.finishLogin(accountId, conn, result);
    } catch (err) {
      throw this.translateError(err, accountId);
    }
  }

  private async finishLogin(accountId: string, conn: Connection, result: unknown): Promise<LoginConfirmResult> {
    const user = (result as Api.auth.Authorization | undefined)?.user as Api.User | undefined;
    if (conn.viaQr && !isSamePhone(user?.phone, conn.account.phone)) {
      await this.rejectForeignQr(accountId, conn, user?.phone ?? null);
    }
    const session = (conn.client.session as InstanceType<typeof StringSession>).save();

    await this.accounts.saveSession(accountId, session);
    const updated = await this.accounts.setStatus(accountId, 'connected', {
      statusMessage: null,
      tgUserId: user?.id ? String(user.id) : null,
      tgUsername: user?.username ?? null,
    });

    conn.account = updated;
    const usul = conn.viaQr ? 'qr' : 'kod';
    delete conn.pendingPhoneCodeHash;
    delete conn.viaQr;
    this.attachHandler(accountId, conn);

    sessiyaIzi.kirdi(updated.label, usul, {
      tgUserId: user?.id ? String(user.id) : null,
      username: user?.username ?? null,
      dc: conn.client.session.dcId ?? null,
      kalitIzi: kalitIzi(conn.client),
    });
    await this.sessiyaSurati(conn);

    log.info({ account: updated.label, username: user?.username }, 'Telegram login muvaffaqiyatli');
    return { status: 'connected', tgUserId: user?.id ? String(user.id) : '', username: user?.username ?? null };
  }

  async logout(accountId: string): Promise<void> {
    return this.gate.run(
      accountId,
      { kind: 'other', priority: 'manual', label: 'logout' },
      () => this.logoutIchki(accountId),
    );
  }

  private async logoutIchki(accountId: string): Promise<void> {
    await this.stopQr(accountId);
    const conn = this.connections.get(accountId);
    if (conn) {
      conn.detachHandler?.();
      sessiyaIzi.ozimizYopdik(conn.account.label, 'operator "Chiqish" bosdi', true);
      await conn.client.invoke(new Api.auth.LogOut()).catch(() => undefined);
      await conn.client.disconnect().catch(() => undefined);
      this.connections.delete(accountId);
    }
    await this.accounts.setStatus(accountId, 'logged_out', { statusMessage: null });
  }

  // ─── QR orqali kirish ─────────────────────────────────────────────────────

  async startQrLogin(accountId: string): Promise<QrLoginStartResult> {
    await this.stopQr(accountId);
    const account = await this.requireAccount(accountId);
    const client = await this.gate.run(
      accountId,
      { kind: 'other', priority: 'manual', label: 'qrLogin' },
      () => this.openClient(account, true, 'login-qr'),
    );
    const conn: Connection = { client, account, viaQr: true };
    this.connections.set(accountId, conn);

    let first: QrTokenResult;
    try {
      first = await this.exportQrToken(accountId, conn);
    } catch (err) {
      await this.dropConnection(accountId, conn);
      throw this.translateError(err, accountId);
    }
    if (first.kind !== 'token') {
      await this.dropConnection(accountId, conn);
      throw new AppError(`Telegram QR bermadi (${first.kind})`, 502, 'TELEGRAM_QR_UNEXPECTED');
    }

    // Tinglovchi birinchi tokendan KEYIN emas, tsikldan oldin ulanadi:
    // tez skanerlansa `UpdateLoginToken` yo'qolmasin.
    let markScanned!: () => void;
    const scanned = new Promise<void>((resolve) => (markScanned = resolve));
    const onUpdate = (update: unknown): void => {
      if (update instanceof Api.UpdateLoginToken) markScanned();
    };
    const rawEvent = new Raw({});
    client.addEventHandler(onUpdate, rawEvent);
    const abort = new AbortController();
    conn.qr = { abort, detachUpdate: () => client.removeEventHandler(onUpdate, rawEvent) };

    await this.accounts.setStatus(accountId, 'awaiting_qr', { statusMessage: 'QR skanerlanishini kutyapti' });
    // Fonda ishlaydi; tsiklning o'z catch'i ham DB'ga yozadi — u yiqilsa
    // ushlanmagan rejection butun jarayonni o'ldirmasligi uchun.
    void this.runQrLoop(accountId, conn, first.expiresAt, scanned, abort.signal).catch((err) =>
      log.error({ accountId, err }, 'QR tsikli kutilmaganda yiqildi'),
    );
    return { status: 'qr_ready', url: first.url, expiresAt: first.expiresAt };
  }

  async cancelQrLogin(accountId: string): Promise<boolean> {
    const stopped = await this.stopQr(accountId);
    if (stopped) {
      await this.accounts.setStatus(accountId, 'logged_out', { statusMessage: null });
    }
    return stopped;
  }

  /**
   * QR tsikli. Kutish navbatdan TASHQARIDA — 2 daqiqa davomida akkaunt
   * navbatini band qilmaslik uchun; faqat Telegram chaqiruvlari navbatda.
   * Har `await` dan keyin `signal` tekshiriladi: bekor qilingan tsikl
   * holatga tegmasligi kerak (uni allaqachon boshqa oqim o'zgartirgan).
   */
  private async runQrLoop(
    accountId: string,
    conn: Connection,
    firstExpiresAt: Date,
    scanned: Promise<void>,
    signal: AbortSignal,
  ): Promise<void> {
    const deadline = Date.now() + QR_TOTAL_MS;
    let expiresAt = firstExpiresAt;
    let lastUrl: string | null = null; // birinchi tokenning havolasini tsikl bilmaydi
    let sameAsPrevious = false;
    let wasScanned = false;
    void scanned.then(() => (wasScanned = true));

    try {
      for (;;) {
        const now = Date.now();
        if (now >= deadline) {
          await this.endQr(accountId, conn, 'logged_out', 'QR muddati tugadi');
          return;
        }
        const untilRefresh = qrRefreshDelayMs(expiresAt, now, sameAsPrevious, QR_REFRESH_MARGIN_MS);
        const wait = new AbortController();
        const stopWait = (): void => wait.abort();
        signal.addEventListener('abort', stopWait, { once: true });
        void scanned.then(stopWait);
        await sleep(Math.min(untilRefresh, deadline - now), wait.signal);
        signal.removeEventListener('abort', stopWait);
        if (signal.aborted) return;
        if (!wasScanned && Date.now() >= deadline) continue;

        // Skanerlangandan keyin ham, oddiy yangilashda ham bir xil chaqiruv:
        // Telegram skanerlangan bo'lsa `LoginTokenSuccess` / `MigrateTo`
        // qaytaradi, `UpdateLoginToken` yo'qolgan bo'lsa ham.
        const result = await this.exportQrToken(accountId, conn);
        if (signal.aborted) return;
        if (result.kind === 'token') {
          // Muddatdan oldin Telegram o'sha tokenni qaytaradi: bu holda
          // qayta e'lon qilmaymiz, keyingi so'rov muddat tugagach ketadi.
          sameAsPrevious = result.expiresAt.getTime() === expiresAt.getTime();
          const changed = !sameAsPrevious || (lastUrl !== null && result.url !== lastUrl);
          expiresAt = result.expiresAt;
          lastUrl = result.url;
          if (changed) {
            this.events.publish({
              type: 'telegram.qr',
              accountId,
              url: result.url,
              expiresAt: result.expiresAt.toISOString(),
            });
          }
          continue;
        }
        await this.completeQr(accountId, conn, result);
        return;
      }
    } catch (err) {
      if (signal.aborted) return;
      if (err instanceof AppError && err.code === 'QR_FOREIGN_ACCOUNT') return; // `rejectForeignQr` tozalagan
      if (isPasswordNeeded(err)) {
        conn.qr?.detachUpdate();
        delete conn.qr;
        await this.accounts.setStatus(accountId, 'awaiting_password', {
          statusMessage: 'Ikki bosqichli parol talab qilinadi',
        });
        this.events.publish({ type: 'telegram.status', accountId, status: 'awaiting_password' });
        return;
      }
      const message = err instanceof AppError ? err.message : this.translateError(err, accountId).message;
      log.warn({ accountId, err }, 'QR login yiqildi');
      await this.endQr(accountId, conn, 'error', message);
    }
  }

  private async exportQrToken(accountId: string, conn: Connection): Promise<QrTokenResult> {
    const result = await this.gate.run(
      accountId,
      { kind: 'other', priority: 'manual', label: 'qrLogin' },
      () =>
        conn.client.invoke(
          new Api.auth.ExportLoginToken({
            apiId: conn.account.apiId,
            apiHash: conn.account.apiHash,
            exceptIds: [],
          }),
        ),
    );
    return classifyLoginToken(result);
  }

  /** Skanerlangan token: kerak bo'lsa boshqa DC ga o'tib import qiladi. */
  private async completeQr(accountId: string, conn: Connection, result: QrTokenResult): Promise<void> {
    let final = result;
    if (result.kind === 'migrate') {
      const imported = await this.gate.run(
        accountId,
        { kind: 'other', priority: 'manual', label: 'qrLogin' },
        async () => {
          await conn.client._switchDC(result.dcId);
          return conn.client.invoke(new Api.auth.ImportLoginToken({ token: result.token }));
        },
      );
      final = classifyLoginToken(imported);
    }
    if (final.kind !== 'success') {
      throw new AppError(`Telegram QR javobi kutilmagan (${final.kind})`, 502, 'TELEGRAM_QR_UNEXPECTED');
    }
    conn.qr?.detachUpdate();
    delete conn.qr;
    await this.finishLogin(accountId, conn, final.authorization);
    this.events.publish({ type: 'telegram.status', accountId, status: 'connected' });
  }

  /**
   * QR'ni boshqa akkaunt skanerladi. Yaratilgan sessiya Telegramda
   * "Qurilmalar" ro'yxatida qolib ketmasligi uchun darhol LogOut.
   */
  private async rejectForeignQr(accountId: string, conn: Connection, scannedPhone: string | null): Promise<never> {
    sessiyaIzi.ozimizYopdik(conn.account.label, 'QR begona raqam bilan skanerlandi', true);
    await this.gate
      .run(accountId, { kind: 'other', priority: 'manual', label: 'qrLogin' }, () =>
        conn.client.invoke(new Api.auth.LogOut()),
      )
      .catch(() => undefined);
    const scanned = normalizePhone(scannedPhone);
    const message =
      `QR boshqa akkaunt bilan skanerlandi (${scanned ? formatPhone(scanned) : 'raqam noma\'lum'}). ` +
      `${formatPhone(conn.account.phone)} raqamli telefondan skanerlang.`;
    await this.endQr(accountId, conn, 'error', message);
    throw new AppError(message, 409, 'QR_FOREIGN_ACCOUNT');
  }

  /** QR tsiklini yakunlaydi. Ulanish allaqachon almashtirilgan bo'lsa — holatga tegmaydi. */
  private async endQr(
    accountId: string,
    conn: Connection,
    status: 'logged_out' | 'error',
    message: string,
  ): Promise<void> {
    conn.qr?.detachUpdate();
    delete conn.qr;
    if (this.connections.get(accountId) !== conn) return;
    await this.dropConnection(accountId, conn);
    await this.accounts.setStatus(accountId, status, { statusMessage: message });
    this.events.publish({ type: 'telegram.status', accountId, status });
  }

  /** Ishlayotgan QR tsiklini to'xtatadi. To'xtatilgan bo'lsa `true`. */
  private async stopQr(accountId: string): Promise<boolean> {
    const conn = this.connections.get(accountId);
    if (!conn?.qr) return false;
    conn.qr.abort.abort();
    conn.qr.detachUpdate();
    delete conn.qr;
    await this.dropConnection(accountId, conn);
    return true;
  }

  private async dropConnection(accountId: string, conn: Connection): Promise<void> {
    if (this.connections.get(accountId) === conn) this.connections.delete(accountId);
    sessiyaIzi.ozimizYopdik(conn.account.label, 'QR login tugamadi', false);
    await conn.client.disconnect().catch(() => undefined);
  }

  // ─── Mijozni telefon raqami orqali topish ────────────────────────────────

  /**
   * Ikki bosqich:
   *  1) contacts.resolvePhone — kontaktga qo'shmaydi, "toza" usul;
   *  2) agar u ishlamasa — contacts.importContacts (raqam vaqtincha kontaktga
   *     qo'shiladi va darhol o'chiriladi).
   * Foydalanuvchi raqamini yashirgan bo'lsa ikkalasi ham bo'sh qaytaradi.
   */
  async lookupByPhone(accountId: string, phoneE164: string): Promise<PhoneLookupResult> {
    return this.gate.run(
      accountId,
      { kind: 'other', priority: 'background', label: 'lookupByPhone' },
      () => this.lookupByPhoneIchki(accountId, phoneE164),
    );
  }

  private async lookupByPhoneIchki(accountId: string, phoneE164: string): Promise<PhoneLookupResult> {
    const client = this.requireClient(accountId);
    const bare = phoneE164.replace(/\D/g, '');

    try {
      const resolved = (await client.invoke(
        new Api.contacts.ResolvePhone({ phone: bare }),
      )) as Api.contacts.ResolvedPeer;

      // `users` — javobga ALOQADOR foydalanuvchilar ro'yxati, u yerda
      // so'ralgan raqamga tegishli bo'lmaganlari ham bo'ladi. Shuning uchun
      // `peer` ko'rsatgan aynan o'sha id qidiriladi.
      const peer = resolved.peer;
      if (peer instanceof Api.PeerUser) {
        const users = resolved.users?.filter((u): u is Api.User => u instanceof Api.User);
        const user = pickUserById(users, peer.userId);
        if (user) return { kind: 'found', peer: toResolvedPeer(user) };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('PHONE_NOT_OCCUPIED')) return { kind: 'not_found' };
      if (/FLOOD_WAIT|PEER_FLOOD|USER_DEACTIVATED|USER_BANNED/.test(message)) {
        throw this.translateError(err, accountId);
      }
      // Boshqa xatolarda ikkinchi usulga o'tamiz.
    }

    try {
      const imported = (await client.invoke(
        new Api.contacts.ImportContacts({
          contacts: [
            new Api.InputPhoneContact({
              clientId: bigInt(Date.now()),
              phone: bare,
              firstName: 'Lead',
              lastName: bare.slice(-4),
            }),
          ],
        }),
      )) as Api.contacts.ImportedContacts;

      // MUHIM: `users` ro'yxatidan birinchisini olish MUMKIN EMAS. Telegram
      // u yerga javobga aloqador boshqa foydalanuvchilarni ham qo'shadi, va
      // raqam umuman ro'yxatdan o'tmagan bo'lsa ham ro'yxat bo'sh
      // bo'lmasligi mumkin — natijada BEGONA odam "topildi" deb qaytardi.
      //
      // Haqiqiy natija faqat `imported` da: unda so'ralgan raqamning
      // `userId` si bo'ladi. Shu id bo'yicha qidiramiz.
      const users = imported.users?.filter((u): u is Api.User => u instanceof Api.User);
      const user = pickUserById(users, imported.imported?.[0]?.userId);

      if (!user) {
        return { kind: imported.retryContacts?.length ? 'privacy_restricted' : 'not_found' };
      }

      // Kontaktlar ro'yxatini toza saqlaymiz — access_hash baribir bizda qoladi.
      await client
        .invoke(
          new Api.contacts.DeleteContacts({
            id: [new Api.InputUser({ userId: user.id, accessHash: user.accessHash ?? bigInt(0) })],
          }),
        )
        .catch(() => undefined);

      return { kind: 'found', peer: toResolvedPeer(user) };
    } catch (err) {
      throw this.translateError(err, accountId);
    }
  }

  // ─── Kontaktga qo'shish ───────────────────────────────────────────────────

  /**
   * Mijozni kontaktga qo'shadi.
   *
   * NEGA `AddContact`, `ImportContacts` EMAS: bizda allaqachon
   * `access_hash` bor, ya'ni telefon raqamini qaytadan yuborish shart
   * emas. Ommaviy import qatoriga ham tushmaydi — u naqshning o'zi
   * spam signali bo'lardi.
   *
   * `addPhonePrivacyException` ATAYLAB `false`: `true` bo'lsa BIZNING
   * raqamimiz mijozga ochiladi.
   */
  async saveContact(
    accountId: string,
    peer: ResolvedPeer,
    firstName: string,
    lastName: string,
  ): Promise<void> {
    return this.gate.run(
      accountId,
      { kind: 'other', priority: 'background', label: 'saveContact' },
      () => this.saveContactIchki(accountId, peer, firstName, lastName),
    );
  }

  private async saveContactIchki(
    accountId: string,
    peer: ResolvedPeer,
    firstName: string,
    lastName: string,
  ): Promise<void> {
    const client = this.requireClient(accountId);
    try {
      await client.invoke(
        new Api.contacts.AddContact({
          // `toInputPeer` EMAS: `AddContact` `InputUser` kutadi. Shu
          // faylda `DeleteContacts` ham aynan shu shaklni ishlatadi.
          id: new Api.InputUser({
            userId: bigInt(peer.telegramUserId),
            accessHash: bigInt(peer.accessHash ?? '0'),
          }),
          firstName,
          lastName,
          phone: '',
          addPhonePrivacyException: false,
        }),
      );
    } catch (err) {
      throw this.translateError(err, accountId);
    }
  }

  // ─── Xabar yuborish ───────────────────────────────────────────────────────

  async sendMessage(accountId: string, peer: ResolvedPeer, text: string): Promise<SentMessage> {
    return this.gate.run(
      accountId,
      { kind: 'message', label: 'sendMessage' },
      () => this.sendMessageIchki(accountId, peer, text),
    );
  }

  private async sendMessageIchki(accountId: string, peer: ResolvedPeer, text: string): Promise<SentMessage> {
    const client = this.requireClient(accountId);
    try {
      const sent = await client.sendMessage(this.toInputPeer(peer), { message: text });
      return { telegramMsgId: Number(sent.id), sentAt: new Date() };
    } catch (err) {
      throw this.translateError(err, accountId);
    }
  }

  async sendMedia(accountId: string, peer: ResolvedPeer, file: OutgoingFile): Promise<SentMessage> {
    return this.gate.run(
      accountId,
      { kind: 'message', label: 'sendMedia' },
      () => this.sendMediaIchki(accountId, peer, file),
    );
  }

  private async sendMediaIchki(accountId: string, peer: ResolvedPeer, file: OutgoingFile): Promise<SentMessage> {
    const client = this.requireClient(accountId);

    try {
      // CustomFile buferdan yuborishga imkon beradi — faylni diskka
      // yozib, keyin yo'lini berish shart emas.
      const custom = new tgClient.uploads.CustomFile(
        file.fileName,
        file.data.byteLength,
        '',
        file.data,
      );

      const sent = await client.sendFile(this.toInputPeer(peer), {
        file: custom,
        caption: file.caption || undefined,
        forceDocument: file.asDocument ?? false,
      });

      return { telegramMsgId: Number(sent.id), sentAt: new Date() };
    } catch (err) {
      throw this.translateError(err, accountId);
    }
  }

  async editMessage(
    accountId: string,
    peer: ResolvedPeer,
    telegramMsgId: number,
    text: string,
  ): Promise<void> {
    return this.gate.run(
      accountId,
      { kind: 'message', label: 'editMessage' },
      () => this.editMessageIchki(accountId, peer, telegramMsgId, text),
    );
  }

  private async editMessageIchki(
    accountId: string,
    peer: ResolvedPeer,
    telegramMsgId: number,
    text: string,
  ): Promise<void> {
    const client = this.requireClient(accountId);
    try {
      await client.editMessage(this.toInputPeer(peer), { message: telegramMsgId, text });
    } catch (err) {
      // Matn o'zgarmagan bo'lsa Telegram rad etadi, lekin bu xato emas:
      // operator hech narsa o'zgartirmay saqlagan, natija esa xuddi
      // o'zgartirgandek — mijozda kerakli matn turibdi.
      if (isMessageNotModified(err)) return;
      throw this.translateError(err, accountId);
    }
  }

  async deleteMessage(accountId: string, peer: ResolvedPeer, telegramMsgId: number): Promise<void> {
    return this.gate.run(
      accountId,
      { kind: 'message', label: 'deleteMessage' },
      () => this.deleteMessageIchki(accountId, peer, telegramMsgId),
    );
  }

  private async deleteMessageIchki(
    accountId: string,
    peer: ResolvedPeer,
    telegramMsgId: number,
  ): Promise<void> {
    const client = this.requireClient(accountId);
    try {
      await client.deleteMessages(this.toInputPeer(peer), [telegramMsgId], { revoke: true });
    } catch (err) {
      throw this.translateError(err, accountId);
    }
  }

  async sendTyping(accountId: string, peer: ResolvedPeer): Promise<void> {
    return this.gate.run(
      accountId,
      { kind: 'other', label: 'sendTyping' },
      () => this.sendTypingIchki(accountId, peer),
    );
  }

  private async sendTypingIchki(accountId: string, peer: ResolvedPeer): Promise<void> {
    const client = this.requireClient(accountId);
    await client
      .invoke(
        new Api.messages.SetTyping({
          peer: this.toInputPeer(peer),
          action: new Api.SendMessageTypingAction(),
        }),
      )
      .catch(() => undefined);
  }

  async markRead(accountId: string, peer: ResolvedPeer): Promise<void> {
    return this.gate.run(
      accountId,
      { kind: 'other', label: 'markRead' },
      () => this.markReadIchki(accountId, peer),
    );
  }

  private async markReadIchki(accountId: string, peer: ResolvedPeer): Promise<void> {
    const client = this.requireClient(accountId);
    await client.markAsRead(this.toInputPeer(peer)).catch(() => undefined);
  }

  // ─── Spam holatini tekshirish ─────────────────────────────────────────────

  /**
   * @SpamBot ga `/start` yuborib, javobini o'qiydi. Bu Telegramning o'zi
   * taklif qilgan yagona rasmiy yo'l — boshqa usul yo'q.
   */
  async checkSpamStatus(accountId: string): Promise<SpamCheckResult> {
    return this.gate.run(
      accountId,
      { kind: 'message', priority: 'background', label: 'checkSpamStatus' },
      () => this.checkSpamStatusIchki(accountId),
    );
  }

  private async checkSpamStatusIchki(accountId: string): Promise<SpamCheckResult> {
    const client = this.requireClient(accountId);

    try {
      const sentAt = Math.floor(Date.now() / 1000) - 2;
      await client.sendMessage(SPAM_BOT, { message: '/start' });

      // Bot javobni BIR NECHA xabarda yuborishi mumkin: birinchisi hukm
      // ("Good news…" yoki "I'm very sorry…"), keyingilari umumiy tushuntirish.
      // Faqat oxirgisini o'qish noto'g'ri xulosaga olib keladi — hammasini yig'amiz.
      for (let attempt = 0; attempt < SPAM_POLL_ATTEMPTS; attempt += 1) {
        await sleep(SPAM_POLL_DELAY_MS);

        const messages = await client.getMessages(SPAM_BOT, { limit: 10 });
        const replies = messages
          .filter((m) => !m.out && Number(m.date) >= sentAt && (m.message?.trim().length ?? 0) > 0)
          .sort((a, b) => Number(a.date) - Number(b.date))
          .map((m) => m.message!.trim());

        if (replies.length) {
          // Oxirgi urinishgacha kutamiz — bot ikkinchi xabarni kechroq yuborishi mumkin.
          const isLastAttempt = attempt === SPAM_POLL_ATTEMPTS - 1;
          if (replies.length < 2 && !isLastAttempt) continue;

          const combined = replies.join('\n\n');
          const result = parseSpamBotReply(combined);
          log.info(
            { accountId, status: result.status, parts: replies.length, until: result.until },
            'SpamBot javobi olindi',
          );
          return result;
        }
      }

      log.warn({ accountId }, 'SpamBot javob bermadi');
      return { status: 'check_failed', message: null, until: null };
    } catch (err) {
      // Xato AVVAL tarjima qilinadi: shu yerdagi FLOOD_WAIT ham
      // `flood_wait_until` ga yozilishi kerak. Ilgari `catch` uni
      // shundoq yutib yuborardi va akkaunt cheklanganini hech kim
      // bilmay qolardi — tekshiruv esa "javob kelmadi" deb ko'rinardi.
      const translated = this.translateError(err, accountId);
      log.error({ accountId, err }, 'SpamBot tekshiruvi xatosi');
      return { status: 'check_failed', message: translated.message, until: null };
    }
  }

  /**
   * Akkaunt nomidan eng arzon so'rovni yuboradi va nima qaytganini aytadi.
   *
   * `users.getFullUser(self)` tanlandi: u hech kimga xabar yubormaydi,
   * kontakt qo'shmaydi va spam filtri uchun signal emas — ya'ni tekshiruv
   * o'zi akkauntga zarar keltirmaydi.
   *
   * Xatolar `translateError()` orqali o'tadi, shuning uchun bu yerdagi
   * FLOOD_WAIT bazaga ham yozilib qoladi — tekshiruv natijasi yo'qolmaydi.
   */
  async probeAccount(accountId: string): Promise<AccountProbe> {
    return this.gate.run(
      accountId,
      { kind: 'other', priority: 'background', label: 'probeAccount' },
      () => this.probeAccountIchki(accountId),
    );
  }

  private async probeAccountIchki(accountId: string): Promise<AccountProbe> {
    let client: TelegramClient;
    try {
      client = this.requireClient(accountId);
    } catch {
      return {
        ok: false,
        reason: 'not_connected',
        seconds: null,
        message: 'Akkaunt ulanmagan — avval tizimga kiring',
      };
    }

    try {
      const full = await client.invoke(
        new Api.users.GetFullUser({ id: new Api.InputUserSelf() }),
      );
      const me = full.users.find((u) => u instanceof Api.User) as Api.User | undefined;
      return {
        ok: true,
        tgUserId: String(full.fullUser.id),
        username: me?.username ?? null,
      };
    } catch (err) {
      const translated = this.translateError(err, accountId);

      // DIQQAT: `code` emas, `telegramCode`. `TelegramError.code` har doim
      // 'TELEGRAM_ERROR' — Telegramning o'z kodi alohida maydonda turadi.
      if (translated instanceof TelegramError) {
        if (translated.telegramCode === 'FLOOD_WAIT') {
          return {
            ok: false,
            reason: 'flood_wait',
            seconds: translated.retryAfterSec ?? null,
            message: translated.message,
          };
        }
        if (translated.telegramCode === 'BANNED') {
          return { ok: false, reason: 'banned', seconds: null, message: translated.message };
        }
        if (translated.telegramCode === 'SESSION_DEAD') {
          return { ok: false, reason: 'session_dead', seconds: null, message: translated.message };
        }
      }

      return { ok: false, reason: 'error', seconds: null, message: translated.message };
    }
  }

  // ─── Kiruvchi xabarlar ────────────────────────────────────────────────────

  onIncomingMessage(handler: IncomingHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  /**
   * Akkaunt HOZIR ishlatilishga yaroqlimi.
   *
   * NEGA `connections.has()` YETARLI EMAS: proksi uzilganda `teleproto`
   * qayta ulanishga urinadi va taslim bo'lsa klient `disconnected`
   * holatida qoladi — LEKIN obyekt xaritada turaveradi. Shu paytgacha bu
   * metod "ulangan" deb yolg'on gapirardi va har bir amal kutubxonaning
   * `Cannot send requests while disconnected` xatosi bilan yiqilardi
   * (2026-08-09 dagi nosozlik).
   *
   * `connected` — `boolean | undefined`. `undefined` "hali aniq emas"
   * degani va u ULANMAGAN deb hisoblanadi: yarim holatda xabar
   * yuborishga urinishdan ko'ra kuzatuvchi keyingi tsiklda qayta
   * ulagani yaxshi.
   */
  isConnected(accountId: string): boolean {
    return this.connections.get(accountId)?.client.connected === true;
  }

  async shutdown(): Promise<void> {
    sessiyaIzi.jarayon('toxtayapti', { ulanishlar: this.connections.size });
    for (const [id, conn] of this.connections) {
      conn.detachHandler?.();
      sessiyaIzi.ozimizYopdik(conn.account.label, 'jarayon to\'xtayapti', false);
      await conn.client.disconnect().catch(() => undefined);
      this.connections.delete(id);
    }
  }

  // ─── Ichki ────────────────────────────────────────────────────────────────

  private async connect(account: TelegramAccount, sabab: OchilishSababi): Promise<Connection> {
    const client = await this.openClient(account, false, sabab);
    const conn: Connection = { client, account };
    this.connections.set(account.id, conn);
    this.attachHandler(account.id, conn);

    if (await client.isUserAuthorized()) {
      await this.accounts.setStatus(account.id, 'connected', { statusMessage: null });
      await this.sessiyaSurati(conn);
    } else {
      await this.accounts.setStatus(account.id, 'logged_out', { statusMessage: 'Sessiya eskirgan' });
    }
    return conn;
  }

  /**
   * Telegram tomonidagi "Qurilmalar" ro'yxatini jurnalga oladi: bizning
   * sessiya qaysi IP'dan, qanday qurilma nomi bilan ko'rinyapti va egasi
   * uni tasdiqlaganmi. Sessiya o'lgach buni so'rab bo'lmaydi — shuning
   * uchun ulanish va login paytida olinadi, o'lim hisobotiga oxirgisi tushadi.
   *
   * Yiqilsa jim: bu faqat diagnostika, ulanishni to'xtatmasligi kerak.
   */
  private async sessiyaSurati(conn: Connection): Promise<void> {
    try {
      const r = await conn.client.invoke(new Api.account.GetAuthorizations());
      const sessiyalar: TelegramSessiyasi[] = r.authorizations.map((a) => ({
        joriy: Boolean(a.current),
        rasmiyIlova: Boolean(a.officialApp),
        tasdiqlanmagan: Boolean(a.unconfirmed),
        parolKutilmoqda: Boolean(a.passwordPending),
        qurilma: a.deviceModel,
        platforma: a.platform,
        tizim: a.systemVersion,
        apiId: a.apiId,
        ilova: `${a.appName} ${a.appVersion}`.trim(),
        yaratilgan: unixIso(a.dateCreated),
        faol: unixIso(a.dateActive),
        ip: a.ip,
        mamlakat: a.country,
        hudud: a.region,
      }));
      sessiyaIzi.telegramKorinishi(conn.account.label, sessiyalar);
    } catch (err) {
      log.debug({ account: conn.account.label, err }, 'Sessiyalar ro\'yxatini olib bo\'lmadi');
    }
  }

  /**
   * Sessiya bizdan tashqari uzildi. `translateError` faqat O'ZIMIZ
   * yuborgan so'rovlarni ko'radi; kutubxonaning ichki chaqiruvida
   * (`updates.GetState`) sezilgan o'lim esa panelda "Ulangan" bo'lib
   * turaverardi — shuning uchun holat shu yerda ham yoziladi.
   */
  private sessiyaYoqoldi(account: TelegramAccount, kod: string, ogohlantir: boolean): void {
    // Bloklangan akkauntning holatini `translateError` o'zi `banned` qiladi.
    if (!kod.startsWith('USER_DEACTIVATED')) {
      void this.accounts
        .setStatus(account.id, 'logged_out', { statusMessage: 'Sessiya bekor qilingan — akkauntni qayta ulang' })
        .then(() => this.events.publish({ type: 'telegram.status', accountId: account.id, status: 'logged_out' }))
        .catch((err) => log.error({ account: account.label, err }, 'Sessiya holatini yozib bo\'lmadi'));
    }
    if (!ogohlantir) return;
    this.events.publish({
      type: 'telegram.session_lost',
      accountId: account.id,
      label: account.label,
      phone: account.phone,
      kod,
    });
  }

  private async openClient(account: TelegramAccount, fresh: boolean, sabab: OchilishSababi): Promise<TelegramClient> {
    const existing = this.connections.get(account.id);
    if (existing && !fresh) return existing.client;
    if (existing) {
      existing.detachHandler?.();
      sessiyaIzi.ozimizYopdik(existing.account.label, `yangi ulanish (${sabab})`, false);
      await existing.client.disconnect().catch(() => undefined);
      this.connections.delete(account.id);
    }

    const session = new StringSession(fresh ? '' : (account.session ?? ''));
    const client = new TelegramClient(session, account.apiId, account.apiHash, {
      connectionRetries: 5,
      retryDelay: 2000,
      autoReconnect: true,
      ...KLIENT_IMZOSI,
      // Proksi berilgan bo'lsa BUTUN MTProto trafigi shu tunnel orqali
      // ketadi. `autoReconnect` uzilganda ham proksi orqali qayta
      // ulanadi va to'g'ridan-to'g'ri ulanishga HECH QACHON o'tmaydi —
      // ya'ni server IP'si sizib chiqmaydi.
      proxy: toSocksProxy(account.proxy),
    });

    client.setLogLevel(MTPROTO_LOG_LEVEL);
    // O'ram `connect()` dan OLDIN: ulanish paytidagi chaqiruvlar
    // (`initConnection`, `auth.*`) ham izga tushsin. Undan keyin
    // qo'yilsa, aynan eng ko'p muammo chiqadigan bosqich ko'rinmay
    // qolardi.
    // Oldin ham o'lik bo'lgan sessiya har restartda qayta "o'ladi" —
    // u haqda bir marta xabar berilgan, takrorlamaymiz. Yangi login esa
    // (`fresh`) har doim tirik sessiya bilan tugaydi.
    const ogohlantir = fresh || (account.status !== 'logged_out' && account.status !== 'banned');
    tgAuditOrnat(client, account.label, {
      kuzat: (metod, xatoKod) => {
        const kod = sessiyaIzi.sorov(account.label, metod, xatoKod);
        if (kod) this.sessiyaYoqoldi(account, kod, ogohlantir);
      },
    });
    const ochilish = (): Parameters<typeof sessiyaIzi.ochildi>[1] => {
      const init = (client as unknown as { _initRequest?: Record<string, unknown> })._initRequest;
      const matn = (v: unknown): string | null => (typeof v === 'string' ? v : null);
      return {
        sabab,
        yangi: fresh,
        apiId: account.apiId,
        imzo: {
          deviceModel: matn(init?.deviceModel) ?? KLIENT_IMZOSI.deviceModel,
          systemVersion: matn(init?.systemVersion) ?? KLIENT_IMZOSI.systemVersion,
          appVersion: matn(init?.appVersion) ?? KLIENT_IMZOSI.appVersion,
          langCode: matn(init?.langCode),
          systemLangCode: matn(init?.systemLangCode),
        },
        proksi: account.proxy ? `${account.proxy.host}:${account.proxy.port}` : null,
        dc: client.session.dcId ?? null,
        dcManzil: client.session.serverAddress ? `${client.session.serverAddress}:${client.session.port}` : null,
        kalitIzi: kalitIzi(client),
      };
    };
    sessiyaIzi.ochilmoqda(account.label, ochilish());
    try {
      await client.connect();
      // Ulanishdan KEYIN: DC va kalit shundagina aniq (yangi sessiyada
      // kalit ulanish paytida yaratiladi).
      sessiyaIzi.ochildi(account.label, ochilish());
    } catch (err) {
      // Proksi nosozligi alohida ajratiladi: `bootstrap` bu xabarni
      // akkauntning `status_message` iga yozadi va operator panelning
      // o'zidan qaysi proksi yiqilganini ko'radi.
      const proxyMsg = account.proxy ? proxyErrorMessage(err, account.proxy) : null;
      if (proxyMsg) throw new Error(proxyMsg);
      throw err;
    }
    return client;
  }

  /**
   * Username bo'yicha foydalanuvchini topish.
   *
   * Mijoz bergan raqami bilan Telegramda o'tirmasligi mumkin.
   * Bunday holatda xodim username'ni qo'lda kiritadi va aloqa shu orqali
   * ketadi.
   */
  async lookupByUsername(accountId: string, username: string): Promise<PhoneLookupResult> {
    return this.gate.run(
      accountId,
      { kind: 'other', priority: 'background', label: 'lookupByUsername' },
      () => this.lookupByUsernameIchki(accountId, username),
    );
  }

  private async lookupByUsernameIchki(accountId: string, username: string): Promise<PhoneLookupResult> {
    const client = this.requireClient(accountId);
    const clean = username.trim().replace(/^@/, '');
    if (!clean) return { kind: 'not_found' };

    try {
      const resolved = (await client.invoke(
        new Api.contacts.ResolveUsername({ username: clean }),
      )) as Api.contacts.ResolvedPeer;

      const peer = resolved.peer;
      if (!(peer instanceof Api.PeerUser)) {
        // Kanal yoki guruh — mijoz emas.
        return { kind: 'not_found' };
      }

      const users = resolved.users?.filter((u): u is Api.User => u instanceof Api.User);
      const user = pickUserById(users, peer.userId);
      if (!user) return { kind: 'not_found' };

      return { kind: 'found', peer: toResolvedPeer(user) };
    } catch (err) {
      const haystack = errorHaystack(err);
      if (haystack.includes('USERNAME_NOT_OCCUPIED') || haystack.includes('USERNAME_INVALID')) {
        return { kind: 'not_found' };
      }
      throw this.translateError(err, accountId);
    }
  }

  // ─── Akkauntning Telegramdagi yozishmalarini ko'rish ─────────────────────

  /**
   * Suhbatlar ro'yxati — Telegramning o'zidan, bizning bazamizdan emas.
   *
   * Shuning uchun bu yerda mijoz bo'lmagan shaxsiy suhbatlar, guruhlar va
   * kanallar ham ko'rinadi: operator akkaunt nima bilan band ekanini biladi.
   */
  async listDialogs(accountId: string, options?: { limit?: number }): Promise<TelegramDialog[]> {
    return this.gate.run(
      accountId,
      { kind: 'other', priority: 'manual', label: 'listDialogs' },
      () => this.listDialogsIchki(accountId, options),
    );
  }

  private async listDialogsIchki(accountId: string, options?: { limit?: number }): Promise<TelegramDialog[]> {
    const client = this.requireClient(accountId);
    const dialogs = await client.getDialogs({ limit: options?.limit ?? 100 });

    return dialogs
      .filter((d) => d.entity)
      .map((d): TelegramDialog => {
        const entity = d.entity!;
        const user = entity instanceof Api.User ? entity : null;
        const message = d.message;

        return {
          peerId: String(entity.id),
          accessHash: 'accessHash' in entity && entity.accessHash ? String(entity.accessHash) : null,
          kind: dialogKind(entity),
          title: d.name || d.title || 'Nomsiz',
          username: user?.username ?? null,
          phone: user?.phone ? `+${user.phone.replace(/\D/g, '')}` : null,
          isBot: Boolean(user?.bot),
          unreadCount: d.unreadCount ?? 0,
          lastMessage: message
            ? {
                id: Number(message.id),
                text: message.message ?? '',
                out: Boolean(message.out),
                date: new Date(Number(message.date) * 1000),
              }
            : null,
        };
      });
  }

  /**
   * Uzilishda o'tkazib yuborilgan kiruvchi xabarlar.
   *
   * Suhbatlar oxirgi faoliyat bo'yicha tartiblangan, shuning uchun
   * `since` dan eski suhbatga yetganda TO'XTAYMIZ — butun ro'yxatni
   * aylanib chiqish har bir akkaunt uchun o'nlab keraksiz so'rov bo'lardi.
   *
   * Bot va guruhlar tashlab ketiladi: jonli oqimdagi filtr ham shunday
   * (`sender instanceof Api.User && !sender.bot`), ikkalasi bir xil
   * bo'lishi shart — aks holda tiklashda bazaga jonli rejimda hech qachon
   * tushmaydigan xabarlar kirib kelardi.
   */
  async fetchMissed(
    accountId: string,
    options: { since: Date; dialogLimit?: number; perDialog?: number },
  ): Promise<IncomingMessage[]> {
    return this.gate.run(
      accountId,
      { kind: 'other', priority: 'background', label: 'fetchMissed' },
      () => this.fetchMissedIchki(accountId, options),
    );
  }

  private async fetchMissedIchki(
    accountId: string,
    options: { since: Date; dialogLimit?: number; perDialog?: number },
  ): Promise<IncomingMessage[]> {
    const client = this.requireClient(accountId);
    const sinceMs = options.since.getTime();

    const dialogs = await client.getDialogs({ limit: options.dialogLimit ?? 100 });
    const out: IncomingMessage[] = [];

    for (const dialog of dialogs) {
      const entity = dialog.entity;
      if (
        !(entity instanceof Api.User) ||
        !kiruvchigaQabul({
          peerKind: 'user',
          senderIsUser: true,
          senderIsBot: Boolean(entity.bot),
          senderId: String(entity.id),
        })
      ) {
        continue;
      }

      // Suhbatdagi oxirgi harakat `since` dan eski — undan keyingilari
      // ham eski (ro'yxat vaqt bo'yicha tartiblangan).
      const lastDate = dialog.message ? Number(dialog.message.date) * 1000 : 0;
      if (lastDate && lastDate < sinceMs) break;

      const messages = await client.getMessages(entity, { limit: options.perDialog ?? 30 });

      for (const message of messages) {
        if (message.out) continue;
        const at = new Date(Number(message.date) * 1000);
        if (at.getTime() < sinceMs) break;

        out.push({
          telegramAccountId: accountId,
          telegramUserId: String(entity.id),
          accessHash: entity.accessHash ? String(entity.accessHash) : null,
          username: entity.username ?? null,
          fullName:
            [entity.firstName, entity.lastName].filter(Boolean).join(' ').trim() || 'Noma\'lum',
          phone: entity.phone ? `+${entity.phone.replace(/\D/g, '')}` : null,
          telegramMsgId: Number(message.id),
          text: message.message ?? '',
          media: mediaFromMessage(client, message),
          receivedAt: at,
          xizmatHisobi: Boolean(entity.support || entity.verified),
        });
      }
    }

    // Eng eskisidan yangisiga: suhbat tarixi to'g'ri tartibda tiklansin.
    return out.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
  }

  async getHistory(
    accountId: string,
    peer: TelegramPeerRef,
    options?: { limit?: number; offsetId?: number },
  ): Promise<TelegramHistoryMessage[]> {
    return this.gate.run(
      accountId,
      { kind: 'other', priority: 'manual', label: 'getHistory' },
      () => this.getHistoryIchki(accountId, peer, options),
    );
  }

  private async getHistoryIchki(
    accountId: string,
    peer: TelegramPeerRef,
    options?: { limit?: number; offsetId?: number },
  ): Promise<TelegramHistoryMessage[]> {
    const client = this.requireClient(accountId);
    const entity = toInputPeer(peer);

    const messages = await client.getMessages(entity, {
      limit: options?.limit ?? 50,
      ...(options?.offsetId ? { offsetId: options.offsetId } : {}),
    });

    // Telegram eng yangisidan beradi — ekranda eskisidan yangisiga o'qiladi.
    return messages
      .map((m): TelegramHistoryMessage => {
        const sender = m.sender instanceof Api.User ? m.sender : null;
        return {
          id: Number(m.id),
          text: m.message ?? '',
          out: Boolean(m.out),
          date: new Date(Number(m.date) * 1000),
          senderName: sender
            ? [sender.firstName, sender.lastName].filter(Boolean).join(' ').trim() || null
            : null,
          mediaLabel: mediaLabel(m),
        };
      })
      .reverse();
  }

  async openWebApp(accountId: string, bot: TelegramPeerRef): Promise<string> {
    return this.gate.run(
      accountId,
      { kind: 'other', priority: 'manual', label: 'webApp' },
      async () => {
        const client = this.requireClient(accountId);
        const peer = toInputPeer(bot);
        const natija = await client.invoke(
          new Api.messages.RequestMainWebView({ peer, bot: peer, platform: 'android' }),
        );
        if (!(natija instanceof Api.WebViewResultUrl)) {
          throw new Error('Bot mini-ilova URL\'ini qaytarmadi');
        }
        return natija.url;
      },
    );
  }

  // ─── Kanal izohlari (faqat O'QISH) ───────────────────────────────────────
  //
  // QATTIQ QOIDA: bu bo'limdagi hech bir chaqiruv kanal yoki guruhga
  // yozmaydi, qo'shilmaydi, reaksiya qo'ymaydi — faqat GetFullChannel,
  // getMessages va GetReplies (o'qish so'rovlari).

  async listCommentChannels(accountId: string): Promise<ChannelInfo[]> {
    return this.gate.run(
      accountId,
      { kind: 'other', priority: 'manual', label: 'izohlar' },
      () => this.listCommentChannelsIchki(accountId),
    );
  }

  private async listCommentChannelsIchki(accountId: string): Promise<ChannelInfo[]> {
    const client = this.requireClient(accountId);
    const dialogs = await client.getDialogs({ limit: 300 });
    // A'zolik dialoglar bo'yicha: muhokama guruhi dialoglar ichida bo'lsa — a'zo.
    const dialogIds = new Set(dialogs.filter((d) => d.entity).map((d) => String(d.entity!.id)));
    const kanallar = dialogs
      .map((d) => d.entity)
      .filter((e): e is Api.Channel => e instanceof Api.Channel && Boolean(e.broadcast));

    const out: ChannelInfo[] = [];
    for (const [i, kanal] of kanallar.entries()) {
      if (i > 0) await sleep(300);
      let full: Api.messages.ChatFull;
      try {
        full = await client.invoke(new Api.channels.GetFullChannel({ channel: kanal }));
      } catch (err) {
        const t = this.translateError(err, accountId);
        // FLOOD_WAIT: shu paytgacha topilganini qaytaramiz, qolganini keyin.
        if (t instanceof TelegramError && t.telegramCode === 'FLOOD_WAIT' && out.length) {
          log.warn({ accountId, topildi: out.length }, 'Kanallar ro\'yxati FLOOD_WAIT bilan qisqartirildi');
          break;
        }
        if (t instanceof TelegramError) throw t;
        // Bitta kanalning xatosi (masalan CHANNEL_PRIVATE) butun ro'yxatni to'xtatmasin.
        log.debug({ accountId, kanal: String(kanal.id), err: t.message }, 'GetFullChannel o\'tkazib yuborildi');
        continue;
      }
      const fullChat = full.fullChat;
      const linked = fullChat instanceof Api.ChannelFull && fullChat.linkedChatId
        ? String(fullChat.linkedChatId)
        : null;
      if (!linked) continue;
      const linkedChat = full.chats.find((c) => String(c.id) === linked);
      const azo = dialogIds.has(linked)
        || (linkedChat instanceof Api.Channel && !linkedChat.left && !linkedChat.min);
      out.push({
        peer: {
          peerId: String(kanal.id),
          accessHash: kanal.accessHash ? String(kanal.accessHash) : null,
          kind: 'channel',
        },
        title: kanal.title || 'Nomsiz kanal',
        linkedChatId: linked,
        memberOfLinked: azo,
      });
    }
    return out;
  }

  async listChannelPosts(
    accountId: string,
    channel: TelegramPeerRef,
    options: { limit: number; sinceDays?: number },
  ): Promise<ChannelPost[]> {
    return this.gate.run(
      accountId,
      { kind: 'other', priority: 'manual', label: 'izohlar' },
      () => this.listChannelPostsIchki(accountId, channel, options),
    );
  }

  private async listChannelPostsIchki(
    accountId: string,
    channel: TelegramPeerRef,
    options: { limit: number; sinceDays?: number },
  ): Promise<ChannelPost[]> {
    const client = this.requireClient(accountId);
    const sinceMs = options.sinceDays ? Date.now() - options.sinceDays * 86_400_000 : 0;
    let messages: Api.Message[];
    try {
      messages = await client.getMessages(toInputPeer(channel), { limit: Math.max(1, Math.min(options.limit, 200)) });
    } catch (err) {
      throw this.translateError(err, accountId);
    }
    return messages
      .filter((m) => m instanceof Api.Message && Boolean(m.post))
      .map((m): ChannelPost => ({
        id: Number(m.id),
        date: new Date(Number(m.date) * 1000),
        text: m.message ?? '',
        repliesCount: m.replies?.replies ?? 0,
      }))
      .filter((p) => p.date.getTime() >= sinceMs);
  }

  async getComments(
    accountId: string,
    channel: TelegramPeerRef,
    postId: number,
    options: { limit: number },
  ): Promise<ChannelCommentsResult> {
    return this.gate.run(
      accountId,
      { kind: 'other', priority: 'manual', label: 'izohlar' },
      () => this.getCommentsIchki(accountId, channel, postId, options),
    );
  }

  private async getCommentsIchki(
    accountId: string,
    channel: TelegramPeerRef,
    postId: number,
    options: { limit: number },
  ): Promise<ChannelCommentsResult> {
    const client = this.requireClient(accountId);
    const peer = toInputPeer(channel);
    const limit = Math.max(1, options.limit);
    const out: ChannelCommentsResult = [];
    let offsetId = 0;

    while (out.length < limit) {
      const sorov = Math.min(100, limit - out.length);
      let res: Api.messages.TypeMessages;
      try {
        res = await client.invoke(new Api.messages.GetReplies({
          peer, msgId: postId, offsetId, offsetDate: 0, addOffset: 0,
          limit: sorov, maxId: 0, minId: 0, hash: bigInt(0),
        }));
      } catch (err) {
        const t = this.translateError(err, accountId);
        if (t instanceof TelegramError && t.telegramCode === 'FLOOD_WAIT' && out.length) {
          out.partial = { reason: t.message, retryAfterSec: t.retryAfterSec ?? null };
          return out;
        }
        throw t;
      }
      if (res instanceof Api.messages.MessagesNotModified) break;

      const users = new Map<string, IzohUser>();
      const selfIds = new Set<string>();
      for (const u of res.users) {
        if (!(u instanceof Api.User)) continue;
        if (u.self) selfIds.add(String(u.id));
        users.set(String(u.id), {
          id: String(u.id),
          // `min` foydalanuvchining hash'i shaxsiy xabar uchun yaroqsiz.
          accessHash: u.accessHash && !u.min ? String(u.accessHash) : null,
          username: u.username ?? null,
          firstName: u.firstName ?? null,
          lastName: u.lastName ?? null,
          bot: Boolean(u.bot),
        });
      }
      const chats = new Map<string, { title: string }>();
      for (const c of res.chats) {
        if (c instanceof Api.Channel || c instanceof Api.Chat) chats.set(String(c.id), { title: c.title });
      }

      const batch = res.messages.filter((m): m is Api.Message => m instanceof Api.Message);
      for (const m of batch) {
        const fromId = izohFromId(m.fromId);
        // O'zimizning akkauntimiz yozgan izoh — lead emas.
        if (fromId.kind === 'user' && selfIds.has(fromId.id)) continue;
        const author = izohMuallifi(fromId, users, chats);
        if (!author) continue;
        const izoh: ChannelComment = {
          id: Number(m.id),
          postId,
          date: new Date(Number(m.date) * 1000),
          text: m.message ?? '',
          author,
        };
        out.push(izoh);
        if (out.length >= limit) break;
      }

      if (res.messages.length < sorov || !res.messages.length) break;
      offsetId = Math.min(...res.messages.map((m) => Number(m.id)));
      await sleep(400);
    }
    return out;
  }

  onRawMessage(handler: (msg: RawTelegramMessage) => void): () => void {
    this.rawHandlers.add(handler);
    return () => this.rawHandlers.delete(handler);
  }

  onMessagesRead(handler: (event: MessagesReadEvent) => Promise<void>): () => void {
    this.readHandlers.add(handler);
    return () => this.readHandlers.delete(handler);
  }

  private attachHandler(accountId: string, conn: Connection): void {
    conn.detachHandler?.();

    const handler = async (event: { message?: Api.Message }): Promise<void> => {
      try {
        const message = event.message;
        if (!message || message.out) return;

        const sender = await message.getSender();
        if (
          !kiruvchigaQabul({
            peerKind: peerKindOf(message.peerId),
            senderIsUser: sender instanceof Api.User,
            senderIsBot: sender instanceof Api.User && Boolean(sender.bot),
            senderId: sender instanceof Api.User ? String(sender.id) : '',
          })
        ) {
          return;
        }
        if (!(sender instanceof Api.User)) return;

        const payload: IncomingMessage = {
          telegramAccountId: accountId,
          telegramUserId: String(sender.id),
          accessHash: sender.accessHash ? String(sender.accessHash) : null,
          username: sender.username ?? null,
          fullName: [sender.firstName, sender.lastName].filter(Boolean).join(' ').trim() || 'Noma\'lum',
          phone: sender.phone ? `+${sender.phone.replace(/\D/g, '')}` : null,
          telegramMsgId: Number(message.id),
          // Media bo'lsa `message.message` — bu caption (izoh).
          text: message.message ?? '',
          media: mediaFromMessage(conn.client, message),
          receivedAt: new Date(Number(message.date) * 1000),
          // Telegram bayroqlari — noma'lum mijoz ochishdan oldin tekshiriladi.
          xizmatHisobi: Boolean(sender.support || sender.verified),
        };

        for (const h of this.handlers) {
          await h(payload).catch((err) => log.error({ err }, 'Kiruvchi xabar ishlovchisi xatosi'));
        }
      } catch (err) {
        log.error({ err }, 'Kiruvchi xabarni o\'qishda xato');
      }
    };

    const filter = new NewMessage({ incoming: true });
    conn.client.addEventHandler(handler as never, filter);

    // Jonli kuzatuv oqimi: filtrsiz — chiquvchi xabar ham, bot ham, guruh ham.
    const rawHandler = (event: { message?: Api.Message }): void => {
      const message = event.message;
      if (!message) return;

      // Audit izi obunachilardan OLDIN: `rawHandlers` bo'sh bo'lsa ham
      // (dashboardda hech kim jonli kuzatmayotgan bo'lsa) xabar kelgani
      // jurnalda qolishi kerak.
      tgHodisaYoz(conn.account.label, 'NewMessage', message);

      if (!this.rawHandlers.size) return;

      try {
        const sender = message.sender instanceof Api.User ? message.sender : null;
        const peer = message.peerId;
        const kind = peerKindOf(peer);
        // Noma'lum peer turi — jonli ko'rinishga ham chiqarilmaydi.
        if (!kind) return;
        const payload: RawTelegramMessage = {
          telegramAccountId: accountId,
          peerId: String(peerIdOf(peer)),
          kind,
          messageId: Number(message.id),
          text: message.message ?? '',
          out: Boolean(message.out),
          date: new Date(Number(message.date) * 1000),
          senderName: sender
            ? [sender.firstName, sender.lastName].filter(Boolean).join(' ').trim() || null
            : null,
          mediaLabel: mediaLabel(message),
        };
        for (const h of this.rawHandlers) h(payload);
      } catch (err) {
        log.debug({ err }, 'Xom xabar hodisasini o\'qib bo\'lmadi');
      }
    };

    const rawFilter = new NewMessage({});
    conn.client.addEventHandler(rawHandler as never, rawFilter);

    /**
     * Mijoz bizning xabarlarimizni o'qigani.
     *
     * `MessageRead` sukut bo'yicha aynan shuni beradi: BOSHQALAR bizning
     * xabarimizni o'qigani (`outbox`). `inbox: true` esa aksincha — biz
     * o'qiganimiz, u bu yerda kerak emas.
     *
     * Telegram har bir xabar uchun alohida emas, "shu id gacha hammasi
     * o'qildi" deb xabar beradi.
     */
    const readHandler = async (event: events.MessageReadEvent): Promise<void> => {
      tgHodisaYoz(conn.account.label, 'MessageRead', event.originalUpdate);

      if (!this.readHandlers.size || !event.outbox) return;

      const update = event.originalUpdate;
      if (!(update instanceof Api.UpdateReadHistoryOutbox)) return;

      try {
        const payload: MessagesReadEvent = {
          telegramAccountId: accountId,
          peerId: String(peerIdOf(update.peer)),
          maxMessageId: Number(update.maxId),
          // Telegram o'qilgan VAQTNI bermaydi — faqat "o'qildi" faktini.
          // Yangilanish deyarli darhol keladi, shuning uchun qabul qilingan
          // vaqt yoziladi. Bu taxminiy ekani interfeysda ham nazarda tutilgan.
          readAt: new Date(),
        };
        for (const h of this.readHandlers) {
          await h(payload).catch((err) => log.error({ err }, 'O\'qildi ishlovchisi xatosi'));
        }
      } catch (err) {
        log.debug({ err }, 'O\'qildi yangilanishini o\'qib bo\'lmadi');
      }
    };

    const readFilter = new MessageRead({});
    conn.client.addEventHandler(readHandler as never, readFilter);

    // Telegramning xavfsizlik hodisalari: akkauntga boshqa qurilmadan
    // kirilgani va xizmat xabarlari. Sessiya o'limidan oldin nima
    // bo'lganini ko'rsatadigan yagona tashqi signal.
    const xavfsizlikHandler = (update: unknown): void => {
      if (update instanceof Api.UpdateNewAuthorization) {
        sessiyaIzi.xizmatHodisasi(conn.account.label, 'UpdateNewAuthorization', {
          tasdiqlanmagan: Boolean(update.unconfirmed),
          qurilma: update.device ?? null,
          joy: update.location ?? null,
          vaqt: unixIso(update.date),
        });
      } else if (update instanceof Api.UpdateServiceNotification) {
        sessiyaIzi.xizmatHodisasi(conn.account.label, 'UpdateServiceNotification', {
          tur: update.type,
          matn: tgTana(update.message),
        });
      }
    };
    const xavfsizlikFilter = new Raw({});
    conn.client.addEventHandler(xavfsizlikHandler, xavfsizlikFilter);

    conn.detachHandler = () => {
      conn.client.removeEventHandler(xavfsizlikHandler, xavfsizlikFilter);
      conn.client.removeEventHandler(handler as never, filter);
      conn.client.removeEventHandler(rawHandler as never, rawFilter);
      conn.client.removeEventHandler(readHandler as never, readFilter);
    };
  }

  private requireClient(accountId: string): TelegramClient {
    const conn = this.connections.get(accountId);
    if (!conn) throw new AppError('Telegram akkaunt ulanmagan', 409, 'TELEGRAM_NOT_CONNECTED');
    // O'lik klient ham "ulanmagan": chaqiruvchi uchun ikkalasi bir xil —
    // hozir ishlatib bo'lmaydi. Aks holda kutubxonaning ichki xatosi
    // domen xatosi o'rniga yuqoriga chiqib ketardi.
    if (conn.client.connected !== true) {
      throw new AppError('Telegram akkaunt ulanmagan', 409, 'TELEGRAM_NOT_CONNECTED');
    }
    return conn.client;
  }

  private async requireAccount(accountId: string): Promise<TelegramAccount> {
    const account = await this.accounts.findById(accountId);
    if (!account) throw new NotFoundError('Telegram akkaunt', accountId);
    return account;
  }

  private toInputPeer(peer: ResolvedPeer): Api.InputPeerUser {
    return new Api.InputPeerUser({
      userId: bigInt(peer.telegramUserId),
      accessHash: bigInt(peer.accessHash ?? '0'),
    });
  }

  /** MTProto xatolarini domen xatosiga aylantiradi (FLOOD_WAIT alohida). */
  private translateError(err: unknown, accountId: string): Error {
    if (err instanceof errors.FloodWaitError) {
      const seconds = Number(err.seconds ?? 0);
      void this.accounts.setFloodWait(accountId, new Date(Date.now() + seconds * 1000));
      log.warn({ accountId, seconds }, 'Telegram FLOOD_WAIT');
      return new TelegramError(`Telegram ${seconds} soniya kutishni so'radi`, 'FLOOD_WAIT', seconds);
    }

    const message = err instanceof Error ? err.message : String(err);
    // Kod xatoning MATNIDA emas, `errorMessage` maydonida keladi —
    // `telegramErrors.ts` izohiga qarang.
    const haystack = errorHaystack(err);

    const flood = /FLOOD_WAIT_(\d+)/.exec(haystack);
    if (flood) {
      const seconds = Number(flood[1]);
      void this.accounts.setFloodWait(accountId, new Date(Date.now() + seconds * 1000));
      return new TelegramError(`Telegram ${seconds} soniya kutishni so'radi`, 'FLOOD_WAIT', seconds);
    }

    if (haystack.includes('PEER_FLOOD')) {
      void this.accounts.setStatus(accountId, 'error', {
        statusMessage: 'PEER_FLOOD — akkaunt notanish odamlarga yozishdan vaqtincha cheklangan',
      });
      // Boshlanish vaqti — cheklov qancha davom etayotganini ko'rsatish
      // uchun. Takroriy xatoda tegilmaydi (`COALESCE` repozitoriyda).
      void this.accounts.markPeerFlood(accountId);
      return new TelegramError(
        'Akkaunt spam filtriga tushdi (PEER_FLOOD). Yuborishni to\'xtating va bir necha kun kuting.',
        'PEER_FLOOD',
      );
    }

    // MIJOZNING akkaunti o'chirilgan — bizning akkauntimizga aloqasi yo'q.
    // Bu tekshiruv `isOwnAccountDeactivated` dan OLDIN turishi shart:
    // `INPUT_USER_DEACTIVATED` ichida `USER_DEACTIVATED` satri bor.
    if (isTargetDeactivated(err)) {
      return new TelegramError(
        'Mijozning Telegram akkaunti o\'chirilgan',
        'USER_DEACTIVATED_TARGET',
      );
    }

    if (isOwnAccountDeactivated(err)) {
      void this.accounts.setStatus(accountId, 'banned', { statusMessage: message });
      return new TelegramError('Telegram akkaunt bloklangan', 'BANNED');
    }

    // Sessiya bekor qilingan: boshqa qurilmadan chiqarilgan yoki Telegram
    // o'zi uzgan. Akkaunt "xato" emas, "chiqib ketgan" — operator uni
    // qayta ulashi kerak, kutishi emas.
    if (
      haystack.includes('AUTH_KEY_UNREGISTERED') ||
      haystack.includes('SESSION_REVOKED') ||
      haystack.includes('SESSION_EXPIRED')
    ) {
      void this.accounts.setStatus(accountId, 'logged_out', {
        statusMessage: 'Sessiya bekor qilingan — akkauntni qayta ulang',
      });
      return new TelegramError('Telegram sessiyasi bekor qilingan', 'SESSION_DEAD');
    }

    if (haystack.includes('PHONE_CODE_INVALID')) return new AppError('Kod noto\'g\'ri', 400, 'PHONE_CODE_INVALID');
    if (haystack.includes('PHONE_CODE_EXPIRED')) return new AppError('Kod muddati tugadi', 400, 'PHONE_CODE_EXPIRED');
    if (haystack.includes('PASSWORD_HASH_INVALID')) {
      return new AppError('Parol noto\'g\'ri', 400, 'PASSWORD_INVALID');
    }
    if (haystack.includes('USER_PRIVACY_RESTRICTED')) {
      return new TelegramError('Mijoz notanish odamlardan xabar qabul qilmaydi', 'USER_PRIVACY_RESTRICTED');
    }
    if (haystack.includes('USER_IS_BLOCKED')) {
      return new TelegramError('Mijoz akkauntimizni bloklagan', 'USER_IS_BLOCKED');
    }

    return err instanceof Error ? err : new Error(message);
  }
}

/**
 * Auth kalitining qisqa izi (SHA-256 ning boshi). Kalitning o'zi emas —
 * faqat "login paytidagi kalit bilan o'lgan kalit bir xilmi" degan savolga
 * javob berish uchun.
 */
function kalitIzi(client: TelegramClient): string | null {
  try {
    const kalit = client.session.authKey?.getKey();
    return kalit ? createHash('sha256').update(kalit).digest('hex').slice(0, 8) : null;
  } catch {
    return null;
  }
}

/** Telegram obyekti qaysi turdagi suhbat ekanini aniqlaydi. */
function dialogKind(entity: { className?: string }): TelegramPeerKind {
  if (entity instanceof Api.User) return 'user';
  if (entity instanceof Api.Chat || entity instanceof Api.ChatForbidden) return 'group';
  if (entity instanceof Api.Channel) return entity.megagroup ? 'group' : 'channel';
  return 'user';
}

function peerIdOf(peer: Api.TypePeer): string {
  if (peer instanceof Api.PeerUser) return String(peer.userId);
  if (peer instanceof Api.PeerChat) return String(peer.chatId);
  if (peer instanceof Api.PeerChannel) return String(peer.channelId);
  return '';
}

/** Izoh muallifining `fromId` si — kutubxona turidan sof shaklga. */
function izohFromId(peer: Api.TypePeer | undefined): IzohFromId {
  if (peer instanceof Api.PeerUser) return { kind: 'user', id: String(peer.userId) };
  if (peer instanceof Api.PeerChannel) return { kind: 'channel', id: String(peer.channelId) };
  if (peer instanceof Api.PeerChat) return { kind: 'channel', id: String(peer.chatId) };
  return { kind: 'none', id: '' };
}

/**
 * Suhbatni ochish uchun `InputPeer`.
 *
 * `accessHash` shart: usiz Telegram begona suhbatni ochishga ruxsat bermaydi
 * (dialoglar ro'yxatidan olinadi).
 */
function toInputPeer(peer: TelegramPeerRef): Api.TypeInputPeer {
  const id = bigInt(peer.peerId);
  const hash = bigInt(peer.accessHash ?? '0');

  if (peer.kind === 'group') return new Api.InputPeerChat({ chatId: id });
  if (peer.kind === 'channel') return new Api.InputPeerChannel({ channelId: id, accessHash: hash });
  return new Api.InputPeerUser({ userId: id, accessHash: hash });
}

/** Matndan tashqari nima borligini bir so'z bilan aytadi. */
function mediaLabel(message: Api.Message): string | null {
  const media = message.media;
  if (!media) return null;
  if (media instanceof Api.MessageMediaPhoto) return 'rasm';
  if (media instanceof Api.MessageMediaContact) return 'kontakt';
  if (media instanceof Api.MessageMediaGeo || media instanceof Api.MessageMediaGeoLive) return 'joylashuv';
  if (media instanceof Api.MessageMediaDocument) {
    const doc = media.document;
    if (!(doc instanceof Api.Document)) return 'fayl';
    for (const attr of doc.attributes) {
      if (attr instanceof Api.DocumentAttributeAudio) return attr.voice ? 'ovozli xabar' : 'audio';
      if (attr instanceof Api.DocumentAttributeVideo) return attr.roundMessage ? 'video xabar' : 'video';
      if (attr instanceof Api.DocumentAttributeSticker) return 'stiker';
    }
    return 'fayl';
  }
  return 'media';
}

function toResolvedPeer(user: Api.User): ResolvedPeer {
  return {
    telegramUserId: String(user.id),
    accessHash: user.accessHash ? String(user.accessHash) : null,
    username: user.username ?? null,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
  };
}
