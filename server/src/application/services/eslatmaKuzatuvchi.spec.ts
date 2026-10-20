import { EslatmaKuzatuvchi } from '@/application/services/EslatmaKuzatuvchi';
import type { EslatmaNomzodi } from '@/domain/repositories/IConversationRepository';

/**
 * Qo'lda: npm run test:eslatma-kuzatuvchi --workspace=server
 * Soxta repozitoriylar bilan — bazaga ham, Telegramga ham chiqmaydi.
 */
let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};

// 2026-11-05 (payshanba) 12:00 Toshkent — ish oynasi ichida; 02:00 — tashqarida.
const ICHIDA = new Date('2026-11-05T07:00:00Z');
const TASHQARIDA = new Date('2026-11-04T21:00:00Z');
const OXIRGI = new Date('2026-11-04T05:00:00Z'); // 26 soat oldin

const nomzod: EslatmaNomzodi = {
  conversationId: 'c1', clientId: 'k1', purchaseId: 'p1', stage: 'qiziqdi',
  remindedStages: [], lastOutboundAt: OXIRGI, lastInboundAt: null,
};

interface Sozlama { eslatmaYoqilgan: boolean; killSwitch: boolean }

function yasa(opts: { now: Date; sozlama?: Partial<Sozlama>; nomzodlar?: EslatmaNomzodi[]; kvotaTugagan?: boolean; qayta?: 'javob' | 'oddiy' }) {
  const log: string[] = [];
  const nomzodlar = opts.nomzodlar ?? [nomzod];
  const conv = (n: EslatmaNomzodi) => ({
    id: n.conversationId, telegramAccountId: 'a1', agentEnabled: true, needsHuman: false, humanKind: null, state: 'active',
    lastOutboundAt: n.lastOutboundAt,
    lastInboundAt: opts.qayta === 'javob' ? new Date(n.lastOutboundAt.getTime() + 1000) : n.lastInboundAt,
  });
  const reminded = new Set<string>();
  const conversations = {
    findEslatmaNomzodlari: async () => nomzodlar,
    findById: async (id: string) => {
      const n = nomzodlar.find((x) => x.conversationId === id);
      return n ? conv(n) : null;
    },
  };
  const purchases = {
    addRemindedStage: async (id: string, stage: string) => { log.push(`mark:${id}:${stage}`); reminded.add(id); },
  };
  const xarid = {
    joriyXarid: async (clientId: string) => {
      const n = nomzodlar.find((x) => x.clientId === clientId);
      return n ? { id: n.purchaseId, stage: n.stage, remindedStages: n.remindedStages } : null;
    },
  };
  const agent = { nudge: async (id: string, stage: string) => { log.push(`nudge:${id}:${stage}`); return { sent: true, reply: 'x', escalated: false, cardSent: false }; } };
  const settings = {
    get: async () => ({
      eslatmaYoqilgan: true, killSwitch: false, eslatmaSoat: 24, windowStart: '09:00', windowEnd: '19:00',
      weekdays: [1, 2, 3, 4, 5, 6], minDelaySec: 1, maxDelaySec: 2, ...opts.sozlama,
    }),
  };
  const accounts = {
    findById: async () => ({
      id: 'a1', isEnabled: true, status: 'connected', floodWaitUntil: null, spamStatus: 'clean', spamUntil: null,
      counterDate: '2026-11-05', sentToday: opts.kvotaTugagan ? 40 : 3, dailyLimit: 40,
    }),
  };
  const audit = { record: async () => undefined };
  const clock = { now: () => opts.now, todayIso: () => '2026-11-05' };
  const w = new EslatmaKuzatuvchi(
    conversations as never, agent as never, xarid as never, purchases as never,
    settings as never, audit as never, clock, accounts as never, async () => undefined,
  );
  return { w, log };
}

async function main(): Promise<void> {
  {
    const { w, log } = yasa({ now: ICHIDA, sozlama: { eslatmaYoqilgan: false } });
    check('o\'chirilgan sozlama -> 0', await w.tekshir(), 0);
    check('  hech narsa chaqirilmagan', log, []);
  }
  {
    const { w, log } = yasa({ now: ICHIDA, sozlama: { killSwitch: true } });
    check('kill switch -> 0', await w.tekshir(), 0);
    check('  hech narsa chaqirilmagan', log, []);
  }
  {
    const { w, log } = yasa({ now: TASHQARIDA });
    check('oyna tashqarisida -> 0', await w.tekshir(), 0);
    check('  hech narsa chaqirilmagan', log, []);
  }
  {
    const { w, log } = yasa({ now: ICHIDA });
    check('oyna ichida -> 1', await w.tekshir(), 1);
    check('  bosqich nudge\'dan OLDIN belgilanadi', log, ['mark:p1:qiziqdi', 'nudge:c1:qiziqdi']);
  }
  {
    const { w, log } = yasa({ now: ICHIDA, qayta: 'javob' });
    check('qayta o\'qishda mijoz javob bergan -> o\'tkaziladi', await w.tekshir(), 0);
    check('  belgilanmagan ham, yuborilmagan ham', log, []);
  }
  {
    const { w, log } = yasa({ now: ICHIDA, nomzodlar: [{ ...nomzod, remindedStages: ['qiziqdi'] }] });
    check('qayta o\'qishda bosqich allaqachon belgilangan -> o\'tkaziladi', await w.tekshir(), 0);
    check('  hech narsa chaqirilmagan', log, []);
  }
  {
    const { w, log } = yasa({ now: ICHIDA, kvotaTugagan: true });
    check('akkaunt kvotasi tugagan -> 0', await w.tekshir(), 0);
    check('  belgilanmagan, nudge chaqirilmagan', log, []);
  }
  console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
  process.exitCode = failed ? 1 : 0;
}
void main();
