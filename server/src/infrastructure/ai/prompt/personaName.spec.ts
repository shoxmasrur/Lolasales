import type { TelegramAccount } from '@/domain/entities/TelegramAccount';
import { personaNameOf } from '@/domain/entities/TelegramAccount';
import type { AgentKnowledgeBlocks } from '@/domain/services/IAgentEngine';
import { buildSystemPrompt, DEFAULT_PERSONA } from '@/infrastructure/ai/prompt/systemPrompt';

/**
 * Qo'lda ishga tushiriladi: npm run test:persona-name --workspace=server
 *
 * Ism zanjiri: akkaunt → umumiy sozlama → koddagi standart. Bu zanjir
 * buzilsa mijoz noto'g'ri ism bilan xabar oladi yoki ismsiz qoladi —
 * ikkalasi ham suhbatni boshidanoq buzadi.
 */

const NOW = new Date('2026-08-07T10:00:00Z');

function account(personaName: string | null): TelegramAccount {
  return {
    id: 'a1', label: 'Sinov', phone: '+998901112233', apiId: 1, apiHash: '', session: null,
    status: 'connected', statusMessage: null, tgUserId: null, tgUsername: null,
    personaName,
    dailyLimit: 40, sentToday: 0, lookupLimit: 50, lookupsToday: 0, counterDate: null, floodWaitUntil: null, floodWaitSince: null, peerFloodSince: null,
    spamStatus: 'clean', spamCheckedAt: null, spamMessage: null, spamUntil: null,
    proxy: null,
    isEnabled: true, styleVersion: 'v1', llmModelId: null, premiumUntil: null, premiumEslatildi: null, createdAt: NOW, updatedAt: NOW,
  };
}

const GLOBAL = 'Lola';

const NAME_CASES: Array<{ holat: string; acc: TelegramAccount | null; kutilgan: string }> = [
  { holat: 'akkauntda ism bor', acc: account('Shoxsanam'), kutilgan: 'Shoxsanam' },
  { holat: 'akkauntda ism yo\'q (null)', acc: account(null), kutilgan: GLOBAL },
  { holat: 'akkauntda bo\'sh satr', acc: account(''), kutilgan: GLOBAL },
  { holat: 'akkauntda faqat probel', acc: account('   '), kutilgan: GLOBAL },
  { holat: 'ism atrofida probel bor', acc: account('  Go\'zal  '), kutilgan: 'Go\'zal' },
  { holat: 'suhbatda akkaunt yo\'q', acc: null, kutilgan: GLOBAL },
];

let failed = 0;

for (const c of NAME_CASES) {
  const actual = personaNameOf(c.acc, GLOBAL);
  const ok = actual === c.kutilgan;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${c.holat}: "${actual}"` + (ok ? '' : `  (kutilgan: "${c.kutilgan}")`));
}

// ─── {ism} o'rnini bosuvchi ────────────────────────────────────────────

const knowledge = (personaName: string): AgentKnowledgeBlocks => ({
  rules: 'Misol: "Men {ism}, kurslar bo\'yicha yozyapman."',
  lessons: 'Saboq: {ism} nomidan yozilgan xabarlar yaxshi ishlaydi.',
  clientMemory: 'Mijoz {ism} bilan avval gaplashgan.',
  personaName,
});

function checkPrompt(holat: string, kutilgan: (p: string) => boolean, prompt: string): void {
  const ok = kutilgan(prompt);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${holat}`);
}

const shoxsanam = buildSystemPrompt(DEFAULT_PERSONA, 'SMM Akademiya', knowledge('Shoxsanam'));

checkPrompt(
  'qoidalar blokidagi {ism} almashdi',
  (p) => p.includes('Men Shoxsanam, kurslar bo\'yicha yozyapman.'),
  shoxsanam,
);
checkPrompt(
  'saboqlar blokidagi {ism} almashdi',
  (p) => p.includes('Saboq: Shoxsanam nomidan'),
  shoxsanam,
);
checkPrompt(
  'mijoz xotirasidagi {ism} almashdi',
  (p) => p.includes('Mijoz Shoxsanam bilan avval gaplashgan.'),
  shoxsanam,
);
checkPrompt(
  'promptda bironta {ism} qolmadi',
  (p) => !p.includes('{ism}'),
  shoxsanam,
);
checkPrompt(
  'ism sarlavhada ham to\'g\'ri',
  (p) => p.includes('Siz Shoxsanamsiz, SMM Akademiya kompaniyasining sotuv menejeri.'),
  shoxsanam,
);

const standart = buildSystemPrompt(DEFAULT_PERSONA, '  ', knowledge(''));
checkPrompt(
  'personaName bo\'sh bo\'lsa DEFAULT_PERSONA ishlatiladi',
  (p) => p.includes('Siz Lolasiz') && !p.includes('{ism}'),
  standart,
);
checkPrompt(
  'kompaniya nomi bo\'sh bo\'lsa standart nom',
  (p) => p.includes('LolaSales kompaniyasining sotuv menejeri'),
  standart,
);
checkPrompt(
  'bo\'limlar tartibi: qoidalar → sotuv bosqichlari → taqiqlar → saboqlar → format',
  (p) => {
    const i = ['Misol:', '## SOTUV BOSQICHLARI', '## QAT\'IY TAQIQLAR', 'Saboq:', 'Mijoz Shoxsanam', '## TIL VA ALIFBO', '## OHANG', '## JAVOB FORMATI'].map((x) => p.indexOf(x));
    return i.every((v, k) => v >= 0 && (k === 0 || v > i[k - 1]!));
  },
  shoxsanam,
);
checkPrompt(
  'qarzga oid bosqich va bosim yo\'q',
  (p) => !/undir|bosim vosita|ESKALATSIYA BOSQICHI/i.test(p),
  shoxsanam,
);

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
