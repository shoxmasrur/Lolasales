import { StartConversationUseCase } from '@/application/usecases/messaging/StartConversationUseCase';
import { ClientTelegramResolver } from '@/application/services/ClientTelegramResolver';
import { uniqueBuzildimi, PROFIL_BAND } from '@/shared/pgErrors';

/** Qo'lda ishga tushiriladi: npm run test:lead-boshlash --workspace=server (bazasiz). */
let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

const HOZIR = new Date('2026-10-20T08:00:00Z');
const akkaunt = {
  id: 'a1', label: 'Sotuv 1', isEnabled: true, status: 'connected', spamStatus: 'clean', floodWaitUntil: null,
  spamUntil: null, counterDate: '2026-10-20', sentToday: 0, dailyLimit: 30, lookupsToday: 0, lookupLimit: 50,
};

function mijoz(o: Record<string, unknown> = {}) {
  return {
    id: 'c1', fullName: 'Ali Valiyev', firstName: null, phone: '+998901112233', extraPhones: [], doNotContact: false,
    telegramStatus: 'unknown', telegramUserId: null, telegramAccessHash: null, telegramHashAccountId: null,
    telegramUsername: null, telegramName: null, telegramAccountId: 'a1', ...o,
  };
}

function qur(c: Record<string, unknown>, opts: { identityXato?: boolean } = {}) {
  const iz = { lookup: 0, firstContact: 0, identity: 0, statuslar: [] as string[], contacts: 0 };
  const clients = {
    findById: async () => c,
    setTelegramStatus: async (_id: string, s: string) => { iz.statuslar.push(s); return c; },
    setTelegramName: async () => {},
    setTelegramIdentity: async () => {
      iz.identity += 1;
      if (opts.identityXato) throw Object.assign(new Error('dup'), { code: '23505' });
      return c;
    },
  };
  const resolver = new ClientTelegramResolver(
    clients as never,
    { findById: async () => akkaunt, incrementLookupsToday: async () => {} } as never,
    {
      lookupByPhone: async () => {
        iz.lookup += 1;
        return { kind: 'found', peer: { telegramUserId: '777', accessHash: 'h', username: 'ali', firstName: 'Ali', lastName: 'Valiyev' } };
      },
    } as never,
    { now: () => HOZIR, todayIso: () => '2026-10-20' } as never,
    { ensureAssigned: async () => 'a1' } as never,
  );
  const uc = new StartConversationUseCase(
    clients as never,
    {
      findByClientId: async () => null,
      create: async (d: Record<string, unknown>) => ({ id: 'cv1', state: 'new', ...d }),
      update: async (id: string, p: Record<string, unknown>) => ({ id, state: 'new', ...p }),
      findById: async (id: string) => ({ id, state: 'new' }),
    } as never,
    resolver,
    { firstContact: async () => { iz.firstContact += 1; return { sent: true, reply: 'Salom' }; } } as never,
    { record: async () => {} } as never,
    { publish: () => {} } as never,
    { saveContact: async () => { iz.contacts += 1; } } as never,
    { hasPossiblyDeliveredOutbound: async () => false } as never,
  );
  return { uc, iz };
}

(async () => {
  {
    const { uc, iz } = qur(mijoz());
    const r = await uc.execute('c1');
    check('raqam leadi (shartnomasiz): firstContact chaqirildi', [r.status, iz.firstContact, iz.lookup, iz.contacts], ['started', 1, 1, 1]);
  }
  {
    const { uc, iz } = qur(mijoz({ doNotContact: true }));
    const r = await uc.execute('c1');
    check('do_not_contact: o\'tkazib yuboriladi', [r.status, iz.firstContact, iz.lookup], ['skipped', 0, 0]);
  }
  {
    const { uc, iz } = qur(mijoz({ telegramStatus: 'blocked', telegramUserId: '777' }));
    check('blocked: o\'tkazib yuboriladi', [(await uc.execute('c1')).status, iz.firstContact], ['skipped', 0]);
  }
  {
    const { uc, iz } = qur(mijoz({
      phone: null, telegramStatus: 'found', telegramUserId: '777', telegramAccessHash: 'h', telegramHashAccountId: 'a1',
    }));
    const r = await uc.execute('c1');
    check('guruh/reklama leadi (peer found): telefon qidiruvisiz firstContact', [r.status, iz.lookup, iz.firstContact], ['started', 0, 1]);
  }
  {
    const { uc, iz } = qur(mijoz(), { identityXato: true });
    const r = await uc.execute('c1');
    check('23505: profil boshqa mijozda — skipped, firstContact yo\'q, name_mismatch belgisi',
      [r.status, r.status === 'skipped' ? r.reason : null, iz.firstContact, iz.statuslar.includes('name_mismatch'), iz.lookup],
      ['skipped', PROFIL_BAND, 0, true, 1]);
  }
  check('uniqueBuzildimi', [uniqueBuzildimi({ code: '23505' }), uniqueBuzildimi({ code: '23503' }), uniqueBuzildimi(null)], [true, false, false]);
  process.exitCode = failed ? 1 : 0;
})();
