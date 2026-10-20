import { AccountChecker } from '@/application/services/AccountChecker';
import type { SpamStatusWatcher } from '@/application/services/SpamStatusWatcher';
import type { TelegramAccount } from '@/domain/entities/TelegramAccount';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { ITelegramAccountRepository } from '@/domain/repositories/ITelegramAccountRepository';
import type { AccountProbe, ITelegramGateway } from '@/domain/services/ITelegramGateway';
import { AppError } from '@/shared/errors';

/**
 * Qo'lda ishga tushiriladi: npm run test:account-checker
 *
 * Tekshiruvning O'ZI Telegram uchun harakat — @SpamBot ga xabar
 * yuboriladi. Shuning uchun ikkita xatti-harakat alohida qimmatli:
 *
 *   • Cooldown — tugmani ketma-ket bosish tekshiruvning o'zini
 *     akkauntni cheklashga olib keladigan signalga aylantirardi.
 *   • @SpamBot javob bermasligi tekshiruvni YIQITMASLIGI kerak:
 *     bazadagi cheklovlar baribir eng ishonchli dalil va ular
 *     ko'rsatilishi shart.
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

interface Muhit {
  checker: AccountChecker;
  clearedPeerFlood: string[];
  spamCalls: number;
}

function muhit(options: {
  acc?: TelegramAccount;
  probe?: AccountProbe;
  spamThrows?: boolean;
  spamResult?: Partial<TelegramAccount>;
  notFound?: number;
}): Muhit {
  const acc = options.acc ?? account();
  const clearedPeerFlood: string[] = [];
  let spamCalls = 0;

  const accounts = {
    findById: async () => acc,
    list: async () => [acc],
    clearPeerFlood: async (id: string) => {
      clearedPeerFlood.push(id);
    },
  } as unknown as ITelegramAccountRepository;

  const clients = {
    countNotFoundByAccount: async () => [{ accountId: acc.id, count: options.notFound ?? 0 }],
  } as unknown as IClientRepository;

  const gateway = {
    probeAccount: async (): Promise<AccountProbe> =>
      options.probe ?? { ok: true, tgUserId: '1', username: null },
  } as unknown as ITelegramGateway;

  const spamWatcher = {
    checkOne: async (): Promise<TelegramAccount> => {
      spamCalls += 1;
      if (options.spamThrows) throw new Error('SpamBot javob bermadi');
      return { ...acc, ...options.spamResult };
    },
  } as unknown as SpamStatusWatcher;

  return {
    checker: new AccountChecker(accounts, clients, gateway, spamWatcher, () => NOW),
    clearedPeerFlood,
    get spamCalls() {
      return spamCalls;
    },
  };
}

let failed = 0;
function check(nom: string, shart: boolean): void {
  if (!shart) failed += 1;
  console.log(`${shart ? '✓' : '✗'} ${nom}`);
}

async function run(): Promise<void> {
  // ─── Cooldown ────────────────────────────────────────────────────────────
  {
    const m = muhit({});
    await m.checker.check('a1');
    let xato: unknown = null;
    await m.checker.check('a1').catch((e) => {
      xato = e;
    });
    check(
      'ketma-ket tekshiruv 429 bilan to\'xtatiladi',
      xato instanceof AppError && xato.statusCode === 429,
    );
  }

  {
    // Ommaviy tekshiruv o'zi pauza bilan ishlaydi — cooldown unga tegmasligi
    // kerak, aks holda ro'yxatdagi akkauntlar tekshirilmay o'tib ketardi.
    const m = muhit({});
    await m.checker.check('a1');
    let xato: unknown = null;
    await m.checker.check('a1', { force: true }).catch((e) => {
      xato = e;
    });
    check('force cooldownni chetlab o\'tadi', xato === null);
  }

  // ─── @SpamBot yiqilsa ────────────────────────────────────────────────────
  {
    const m = muhit({
      spamThrows: true,
      acc: account({ peerFloodSince: new Date('2026-08-09T10:00:00Z') }),
    });
    const report = await m.checker.check('a1');
    check('SpamBot yiqilsa tekshiruv baribir natija beradi', report.spam.status === 'check_failed');
    check(
      'SpamBot yiqilsa ham bazadagi cheklov ko\'rsatiladi',
      report.restrictions.some((r) => r.kind === 'peer_flood'),
    );
  }

  // ─── Sessiya o'lgan bo'lsa @SpamBot bezovta qilinmaydi ───────────────────
  {
    const m = muhit({
      probe: { ok: false, reason: 'session_dead', seconds: null, message: 'Sessiya bekor qilingan' },
    });
    const report = await m.checker.check('a1');
    check('sessiya o\'lgan bo\'lsa SpamBot chaqirilmaydi', m.spamCalls === 0);
    check(
      'sessiya o\'lgani cheklov sifatida ko\'rinadi',
      report.restrictions.some((r) => r.kind === 'session_dead'),
    );
  }

  // ─── FLOOD_WAIT da @SpamBot baribir so'raladi ────────────────────────────
  {
    // Flood-wait metod bo'yicha: probe yiqilgani @SpamBot bilan
    // yozishishga to'sqinlik qilmasligi mumkin, PEER_FLOOD haqidagi
    // yagona ma'lumot esa aynan o'sha yerdan keladi.
    const m = muhit({
      probe: { ok: false, reason: 'flood_wait', seconds: 300, message: '300 soniya' },
    });
    await m.checker.check('a1');
    check('flood-wait da SpamBot baribir so\'raladi', m.spamCalls === 1);
  }

  // ─── Toza javob peer-flood belgisini tozalaydi ───────────────────────────
  {
    const m = muhit({
      acc: account({ peerFloodSince: new Date('2026-08-09T10:00:00Z') }),
      spamResult: { spamStatus: 'clean' },
    });
    await m.checker.check('a1');
    check('toza javobda peer-flood belgisi tozalanadi', m.clearedPeerFlood.includes('a1'));
  }

  {
    const m = muhit({ spamResult: { spamStatus: 'limited' } });
    await m.checker.check('a1');
    check('cheklangan javobda belgi tozalanmaydi', m.clearedPeerFlood.length === 0);
  }

  // ─── Topilmagan raqamlar ─────────────────────────────────────────────────
  {
    const m = muhit({ notFound: 14 });
    const report = await m.checker.check('a1');
    check('topilmagan raqamlar soni hisobotda', report.notFoundLookups === 14);
  }

  console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
  process.exitCode = failed ? 1 : 0;
}

void run();
