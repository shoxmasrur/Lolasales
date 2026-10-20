/**
 * Qo'lda ishga tushiriladi: npm run test:debounce-crm --workspace=server
 *
 * Bazaga ham, CRM'ga ham chiqmaydi — hamma port soxta.
 *
 * Nimani qo'riqlaydi: CRM javob bermaganda mijozning xabari YO'QOLMASLIGI
 * kerak. Bufer tashlansa, mijoz yozgan gap hech qachon javob olmaydi va
 * buni hech kim sezmaydi — na operator, na jurnal. Shuning uchun uchta
 * tartib shu yerda qotib qoladi: bufer saqlanadi, urinish soni chegarasi
 * bor, mijozning yangi xabari kutishdan USTUN turadi.
 *
 * Taymer oynalari test uchun qisqartiriladi (`config` `Object.freeze` bilan
 * yopiq, shuning uchun muhit o'zgaruvchilari import'dan OLDIN qo'yiladi).
 */
import type { AgentRunner } from '@/application/services/AgentRunner';

const KUTISH_MS = 120;
process.env.CRM_RETRY_MS = String(KUTISH_MS);
process.env.CRM_RETRY_MAX = '3';

const { ReplyDebouncer } = await import('@/application/services/ReplyDebouncer');
const { config } = await import('@/shared/config');
const { CrmUnavailableError } = await import('@/shared/errors');

/** Debounce oynasi — CRM kutishidan ancha qisqa, farqi ko'rinib tursin. */
const DEBOUNCE_MS = 5;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

let failed = 0;
const check = (name: string, ok: boolean, hint = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${hint}`}`);
};

/**
 * Soxta agent: har chaqiruvda ssenariydan keyingi natijani oladi.
 *
 * Har chaqiruvning MATNI va VAQTI yoziladi — bufer butunligini ham,
 * qaysi oyna ishlaganini ham shu yerdan tekshiramiz.
 */
class FakeAgent {
  calls: Array<{ text: string; at: number }> = [];
  aborts = 0;

  constructor(private readonly ssenariy: Array<'crm' | 'ok'>) {}

  async reply(_conversationId: string, text: string): Promise<void> {
    this.calls.push({ text, at: Date.now() });
    if (this.ssenariy.shift() === 'crm') throw new CrmUnavailableError();
  }

  abort(): void {
    this.aborts += 1;
  }
}

const asAgent = (a: FakeAgent): AgentRunner => a as unknown as AgentRunner;

interface Xato {
  conversationId: string;
  err: unknown;
}

check(
  `sozlama test qiymatini oldi (CRM_RETRY_MS=${config.CRM_RETRY_MS}, MAX=${config.CRM_RETRY_MAX})`,
  config.CRM_RETRY_MS === KUTISH_MS && config.CRM_RETRY_MAX === 3,
  'muhit o\'zgaruvchisi o\'tmadi — test oynalari haqiqiy 5 daqiqaga teng',
);

// ── 1. CRM tinmay yiqiladi: 3 marta urinadi, keyin operatorga ───────────
{
  const agent = new FakeAgent(['crm', 'crm', 'crm']);
  const xatolar: Xato[] = [];
  const debouncer = new ReplyDebouncer(asAgent(agent), DEBOUNCE_MS, async (conversationId, err) => {
    xatolar.push({ conversationId, err });
  });

  debouncer.push('cv1', 'salom');

  // Birinchi urinishdan keyin bufer joyida turishi kerak — mijozning gapi
  // hali javob olmagan.
  await sleep(DEBOUNCE_MS + 40);
  check('1-urinishdan keyin bufer saqlandi', debouncer.hasPending('cv1'));
  check('1-urinishdan keyin operatorga chiqarilmadi', xatolar.length === 0);

  await sleep(KUTISH_MS * 2 + 120);

  check('agent aynan 3 marta chaqirildi', agent.calls.length === 3, JSON.stringify(agent.calls));
  check(
    'har urinishda matn o\'zgarmadi',
    agent.calls.every((c) => c.text === 'salom'),
    JSON.stringify(agent.calls),
  );
  const boshlandi = agent.calls[0]?.at ?? 0;
  check(
    'urinishlar orasida kutildi (darhol emas)',
    agent.calls.length === 3 && (agent.calls[2]?.at ?? 0) - boshlandi >= KUTISH_MS,
    JSON.stringify(agent.calls.map((c) => c.at - boshlandi)),
  );
  check('3-urinishdan keyin operatorga chiqarildi', xatolar.length === 1, String(xatolar.length));
  check(
    'operatorga aynan CRM xatosi berildi',
    xatolar[0]?.err instanceof CrmUnavailableError,
    String(xatolar[0]?.err),
  );
  check(
    'chegaradan keyin bufer bo\'shatildi (cheksiz urinish yo\'q)',
    !debouncer.hasPending('cv1'),
  );

  // Chegaradan keyin yangi urinish boshlanmasligini ham tekshiramiz.
  await sleep(KUTISH_MS + 60);
  check('chegaradan keyin qo\'shimcha chaqiruv bo\'lmadi', agent.calls.length === 3, String(agent.calls.length));
}

// ── 2. CRM tiklandi: hisoblagich tozalanadi ─────────────────────────────
//
// Ko'zgu holat. Sanoq muvaffaqiyatli javobdan keyin nolga qaytmasa,
// keyingi hafta CRM bir marta yiqilishi bilan suhbat darhol operatorga
// chiqib ketardi — va buning sababi jurnalda ko'rinmasdi.
{
  const agent = new FakeAgent(['crm', 'ok', 'crm', 'crm', 'ok']);
  const xatolar: Xato[] = [];
  const debouncer = new ReplyDebouncer(asAgent(agent), DEBOUNCE_MS, async (conversationId, err) => {
    xatolar.push({ conversationId, err });
  });

  debouncer.push('cv1', 'birinchi');
  await sleep(DEBOUNCE_MS + KUTISH_MS + 80);

  check('yiqilishdan keyingi urinish o\'tdi', agent.calls.length === 2, JSON.stringify(agent.calls));
  check('javob ketgach bufer bo\'shadi', !debouncer.hasPending('cv1'));

  // Ikkinchi xabar: yana ikki marta yiqiladi va uchinchisida o'tadi.
  // Sanoq tozalangan bo'lsa, chegara (3) ga YETMAYDI.
  debouncer.push('cv1', 'ikkinchi');
  await sleep(DEBOUNCE_MS + KUTISH_MS * 2 + 140);

  check('ikkinchi xabar ham javob oldi', agent.calls.length === 5, JSON.stringify(agent.calls));
  check(
    'sanoq tozalangani uchun operatorga chiqarilmadi',
    xatolar.length === 0,
    JSON.stringify(xatolar.map((x) => String(x.err))),
  );
  check(
    'ikkinchi xabarning matni ham yo\'qolmadi',
    agent.calls.slice(2).every((c) => c.text === 'ikkinchi'),
    JSON.stringify(agent.calls),
  );
}

// ── 3. Kutish paytida mijoz yozadi — odatdagi debounce USTUN ────────────
//
// CRM kutishi 5 daqiqa. Mijoz shu oraliqda yana yozsa va biz kutishda
// qolib ketsak, u javobni besh daqiqa kutardi — holbuki yangi xabar
// baribir yangi chaqiruvni talab qiladi.
{
  const agent = new FakeAgent(['crm', 'ok']);
  const xatolar: Xato[] = [];
  const debouncer = new ReplyDebouncer(asAgent(agent), DEBOUNCE_MS, async (conversationId, err) => {
    xatolar.push({ conversationId, err });
  });

  debouncer.push('cv1', 'salom');
  await sleep(DEBOUNCE_MS + 30); // 1-urinish yiqildi, CRM kutishi qo'yildi
  check('kutishdan oldin bitta urinish bo\'ldi', agent.calls.length === 1, String(agent.calls.length));

  const yozilganVaqt = Date.now();
  debouncer.push('cv1', 'to\'ladim');
  await sleep(DEBOUNCE_MS + 40);

  check('yangi xabar kelgach darhol javob berildi', agent.calls.length === 2, JSON.stringify(agent.calls));
  const ikkinchiOraliq = agent.calls[1] ? agent.calls[1].at - yozilganVaqt : -1;
  check(
    'javob CRM kutishini KUTMADI',
    agent.calls.length === 2 && ikkinchiOraliq >= 0 && ikkinchiOraliq < KUTISH_MS,
    String(ikkinchiOraliq),
  );
  check(
    'ikkala xabar birga berildi (birinchisi yo\'qolmadi)',
    agent.calls[1]?.text === 'salom\nto\'ladim',
    JSON.stringify(agent.calls),
  );
  check('operatorga chiqarilmadi', xatolar.length === 0);
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
