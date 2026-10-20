import { NomalumMijozAgenti, AGENT_JAVOB_CHEGARASI, MATN_HUJJAT_ESLATMA } from '@/application/services/NomalumMijozAgenti';
import { NOMALUM_SABAB_TASDIQ, type NomalumSuhbat } from '@/domain/entities/NomalumSuhbat';
import type { Conversation } from '@/domain/entities/Conversation';
import type { Message } from '@/domain/entities/Message';
import type { ITuzilganLlm, TuzilganSorov } from '@/domain/services/ITuzilganLlm';

/**
 * Qo'lda ishga tushiriladi: npm run test:nomalum-agent --workspace=server
 *
 * Telegramga ham, bazaga ham, modelga ham chiqmaydi (hammasi soxta).
 *
 * NEGA KERAK: noma'lum odamga model javob yozadi. Holat darvozalari (agent
 * o'chiq, kill switch, 6 javob chegarasi, tasdiq kutilmoqda) buzilsa, notanish
 * odamga cheksiz yoki keraksiz xabar ketadi.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

const ID = 'c1';

interface Opts {
  holat?: NomalumSuhbat['holat'];
  javoblar?: number;
  llm?: (s: TuzilganSorov) => Promise<unknown>;
  nomalumAgent?: boolean;
  findKech?: Promise<void>;
  killSwitch?: boolean;
  agentAutoReply?: boolean;
  /** Suhbat maydonlari (`canAgentReply` darvozasi uchun). */
  conv?: Partial<Conversation>;
  /** Noma'lum suhbat qatorining qo'shimcha maydonlari. */
  suhbat?: Partial<NomalumSuhbat>;
}

function qur(o: Opts = {}) {
  let suhbat: NomalumSuhbat = {
    conversationId: ID, holat: o.holat ?? 'kutilmoqda', agentJavoblari: o.javoblar ?? 0, urinishlar: 0, topilmagan: 0,
    shartnomaRaqami: null, topilganClientId: null, telegramTelefon: null, sabab: null,
    createdAt: new Date(), updatedAt: new Date(), ...o.suhbat,
  };
  const k = {
    llmChaqiruv: 0, yuborilgan: [] as Array<Record<string, unknown>>,
    convPatches: [] as Array<Record<string, unknown>>, tekshir: [] as string[], events: 0,
    sorovlar: [] as TuzilganSorov[],
    get suhbat() { return suhbat; },
  };
  const llm: ITuzilganLlm = {
    generate: async (s) => {
      k.llmChaqiruv += 1;
      k.sorovlar.push(s);
      return (o.llm ?? (async () => ({ reply: 'Assalomu alaykum, shartnoma raqamingizni yozing', shartnomaRaqami: null, maqsad: 'tolov', operatorga: false })))(s);
    },
  };
  const agent = new NomalumMijozAgenti({
    llm,
    nomalum: {
      ensure: async () => suhbat,
      find: async () => { if (o.findKech) await o.findKech; return suhbat; },
      update: async (_id, patch) => { suhbat = { ...suhbat, ...patch }; return suhbat; },
      holatniAlmashtir: async (_id, eski, yangi) => {
        if (suhbat.holat !== eski) return false;
        suhbat = { ...suhbat, holat: yangi };
        return true;
      },
    },
    conversations: {
      findById: async () => ({
        id: ID, agentEnabled: true, needsHuman: false, humanReason: null, humanKind: null, state: 'new', ...o.conv,
      } as unknown as Conversation),
      update: async (_id: string, patch: Record<string, unknown>) => { k.convPatches.push(patch); return {} as Conversation; },
    } as never,
    messages: {
      recentByConversation: async () => [
        { direction: 'in', body: 'Salom', transcript: null, media: null },
      ] as unknown as Message[],
    },
    dispatcher: { send: async (opt: Record<string, unknown>) => { k.yuborilgan.push(opt); return {} as Message; } } as never,
    settings: { get: async () => ({ nomalumAgent: o.nomalumAgent ?? true, killSwitch: o.killSwitch ?? false, agentAutoReply: o.agentAutoReply ?? true, sotuvRaqami: '71 200 74 00' }) } as never,
    events: { publish: () => { k.events += 1; }, subscribe: () => () => undefined },
    personaName: async () => 'Madina',
    boglovchi: { tekshir: async (_id, raqam) => { k.tekshir.push(raqam); } },
  });
  return { agent, k };
}

async function main(): Promise<void> {
  {
    const { agent, k } = qur();
    const n = await agent.reply(ID, 'Salom');
    check('1: bitta xabar, author=agent', k.yuborilgan.length === 1 && k.yuborilgan[0]!.author === 'agent' && n.yuborildi);
    check('1: agentJavoblari 1 ga oshdi', k.suhbat.agentJavoblari === 1);
    check('1: prompt tarixni oladi', k.sorovlar[0]!.user.includes('Mijoz: Salom'));
  }
  {
    const { agent, k } = qur({ holat: 'tasdiq_kutilmoqda' });
    await agent.reply(ID, 'Salom');
    check('2: tasdiq_kutilmoqda — llm ham, yuborish ham yo\'q', k.llmChaqiruv === 0 && k.yuborilgan.length === 0);
  }
  {
    const { agent, k } = qur({ javoblar: AGENT_JAVOB_CHEGARASI });
    await agent.reply(ID, 'Salom');
    check('3: chegara — llm chaqirilmadi', k.llmChaqiruv === 0 && k.yuborilgan.length === 0);
    check('3: holat=operatorda', k.suhbat.holat === 'operatorda');
    check('3: needsHuman + humanReason', k.convPatches.some((p) => p.needsHuman === true && typeof p.humanReason === 'string'));
  }
  {
    const { agent, k } = qur({ llm: async () => ({ reply: 'Sotuv: 71 200 74 00', shartnomaRaqami: null, maqsad: 'xarid', operatorga: false }) });
    await agent.reply(ID, 'Kvartira olmoqchiman');
    check('4: xarid — yuborildi, holat=mijoz_emas', k.yuborilgan.length === 1 && k.suhbat.holat === 'mijoz_emas');
  }
  {
    const { agent, k } = qur({ llm: async () => ({ reply: 'Mutaxassisimiz javob beradi', shartnomaRaqami: null, maqsad: 'boshqa', operatorga: true }) });
    await agent.reply(ID, '???');
    check('5: operatorga — holat=operatorda + needsHuman', k.suhbat.holat === 'operatorda' && k.convPatches.some((p) => p.needsHuman === true) && k.events > 0);
  }
  {
    const { agent, k } = qur({ llm: async () => ({ reply: 'Rahmat, tekshiryapman', shartnomaRaqami: ' 1234 abc56de', maqsad: 'tolov', operatorga: false }) });
    const n = await agent.reply(ID, '1234 abc56de');
    check('6: boglovchi.tekshir tozalangan raqam bilan', k.tekshir.length === 1 && k.tekshir[0] === '1234ABC56DE');
    check('6: raqam saqlandi', k.suhbat.shartnomaRaqami === '1234ABC56DE' && n.shartnomaRaqami === '1234ABC56DE');
  }
  {
    const { agent, k } = qur({ llm: async () => { throw new Error('model yiqildi'); } });
    let tashladi = false;
    try { await agent.reply(ID, 'Salom'); } catch { tashladi = true; }
    check('7: llm xatosi — tashlamaydi, yuborilmaydi, operatorda', !tashladi && k.yuborilgan.length === 0 && k.suhbat.holat === 'operatorda');
  }
  {
    const { agent, k } = qur({ nomalumAgent: false });
    await agent.reply(ID, 'Salom');
    check('8a: nomalumAgent=false — llm yo\'q, holat=operatorda', k.llmChaqiruv === 0 && k.yuborilgan.length === 0 && k.suhbat.holat === 'operatorda');
  }
  {
    const { agent, k } = qur({ killSwitch: true });
    await agent.reply(ID, 'Salom');
    check('8b: killSwitch — llm yo\'q, yuborilmaydi', k.llmChaqiruv === 0 && k.yuborilgan.length === 0);
  }
  {
    // To'xtatish: ketayotgan so'rov signali uziladi, holat o'zgarmaydi, xabar ketmaydi.
    let signal: AbortSignal | undefined;
    const { agent, k } = qur({
      llm: (s) => new Promise((_, rej) => {
        signal = s.signal;
        s.signal?.addEventListener('abort', () => rej(new Error('abort')));
      }),
    });
    const p = agent.reply(ID, 'Salom');
    await new Promise((r) => setTimeout(r, 10));
    const soni = agent.abort(ID, 'stale');
    const n = await p;
    check('9: abort 1 qaytaradi, signal uzildi', soni === 1 && signal?.aborted === true);
    check('9: uzilgan navbat yubormaydi, holat o\'zgarmaydi', !n.yuborildi && k.yuborilgan.length === 0 && k.suhbat.holat === 'kutilmoqda');
    check('9: ikkinchi abort 0', agent.abort(ID, 'stale') === 0);
  }

  {
    // find kutib turganda abort: model chaqirilmaydi, xabar ketmaydi.
    let och!: () => void;
    const kech = new Promise<void>((r) => { och = r; });
    const { agent, k } = qur({ findKech: kech });
    const p = agent.reply(ID, 'Salom');
    await new Promise((r) => setTimeout(r, 5));
    const soni = agent.abort(ID, 'operator');
    och();
    const n = await p;
    check('10: find paytidagi abort — 1, model yo\'q, yuborilmadi', soni === 1 && k.llmChaqiruv === 0 && k.yuborilgan.length === 0 && !n.yuborildi);
  }
  {
    // Ikki ustma-ust navbat: ikkalasi ham uziladi.
    const { agent } = qur({ llm: (s) => new Promise((_, rej) => { s.signal?.addEventListener('abort', () => rej(new Error('abort'))); }) });
    const p1 = agent.reply(ID, 'a');
    const p2 = agent.reply(ID, 'b');
    await new Promise((r) => setTimeout(r, 10));
    const soni = agent.abort(ID, 'stale');
    await Promise.all([p1, p2]);
    check('11: ikki navbat — abort 2 qaytaradi', soni === 2);
    check('11: keyin 0', agent.abort(ID, 'stale') === 0);
  }

  // ── Asosiy agent bilan bir xil yuborish darvozalari (I2) ──
  for (const [nom, conv] of [
    ['operator qo\'lga olgan (needsHuman)', { needsHuman: true, humanReason: 'Operator' }],
    ['agent o\'chirilgan', { agentEnabled: false }],
    ['suhbat yopilgan', { state: 'closed' }],
  ] as Array<[string, Partial<Conversation>]>) {
    const { agent, k } = qur({ conv });
    const n = await agent.reply(ID, 'Salom');
    check(`12: ${nom} — model yo'q, yuborilmadi`, k.llmChaqiruv === 0 && k.yuborilgan.length === 0 && !n.yuborildi);
    check(`12: ${nom} — holat o'zgarmadi`, k.suhbat.holat === 'kutilmoqda' && k.convPatches.length === 0 && k.suhbat.agentJavoblari === 0);
  }
  {
    // Qo'lda tasdiqlash rejimi: notanishga qoralama ham yozilmaydi, operator javob beradi.
    const { agent, k } = qur({ agentAutoReply: false });
    await agent.reply(ID, 'Salom');
    check('13: agentAutoReply=false — model yo\'q, yuborilmadi', k.llmChaqiruv === 0 && k.yuborilgan.length === 0);
    check('13: holat=operatorda + needsHuman', k.suhbat.holat === 'operatorda'
      && k.convPatches.some((p) => p.needsHuman === true && typeof p.humanReason === 'string'));
  }

  // ── Hujjat kutilmoqda: model chaqirilmaydi, faqat tayyor eslatma ──
  {
    const { agent, k } = qur({ holat: 'hujjat_kutilmoqda', javoblar: 2 });
    const n = await agent.reply(ID, 'Nega kerak? Raqamni yozdim-ku');
    check('14: hujjat_kutilmoqda — model chaqirilmadi', k.llmChaqiruv === 0);
    check('14: eslatma matni aynan', k.yuborilgan.length === 1 && k.yuborilgan[0]!.body === MATN_HUJJAT_ESLATMA
      && MATN_HUJJAT_ESLATMA === 'Iltimos, pasportingiz yoki shartnomangizning birinchi beti rasmini yuboring.', JSON.stringify(k.yuborilgan));
    const meta = k.yuborilgan[0]?.meta as Record<string, unknown> | undefined;
    check('14: author=agent, meta nomalum+tayyorMatn', k.yuborilgan[0]?.author === 'agent' && meta?.nomalum === true && meta?.tayyorMatn === true);
    check('14: agentJavoblari +1', k.suhbat.agentJavoblari === 3 && n.yuborildi, String(k.suhbat.agentJavoblari));
    check('14: holat o\'zgarmadi, operator chaqirilmadi', k.suhbat.holat === 'hujjat_kutilmoqda'
      && !k.convPatches.some((p) => p.needsHuman === true));
    check('14: boglovchi chaqirilmadi', k.tekshir.length === 0);
    check('14: eslatmada "qarz" yo\'q', !/qarz/i.test(MATN_HUJJAT_ESLATMA));
  }
  // Hujjat kutilayotganda chegara yoki agent o'chiq: operatorga, lekin bir
  // bosishli tasdiq yo'qolmaydi — holat `tasdiq_kutilmoqda`, topilgan mijoz qoladi.
  const hujjatSuhbat: Partial<NomalumSuhbat> = { topilganClientId: 'real7', shartnomaRaqami: 'AB1', sabab: 'Telegram raqami yashirin' };
  for (const [nom, o] of [
    ['chegara', { javoblar: AGENT_JAVOB_CHEGARASI }],
    ['nomalumAgent=false', { nomalumAgent: false }],
    ['agentAutoReply=false', { agentAutoReply: false }],
  ] as Array<[string, Opts]>) {
    const { agent, k } = qur({ holat: 'hujjat_kutilmoqda', suhbat: hujjatSuhbat, ...o });
    await agent.reply(ID, 'Salom');
    check(`15 (${nom}): yuborilmadi, model yo'q`, k.llmChaqiruv === 0 && k.yuborilgan.length === 0);
    check(`15 (${nom}): holat tasdiq_kutilmoqda, topilgan/raqam/sabab saqlandi`, k.suhbat.holat === 'tasdiq_kutilmoqda'
      && k.suhbat.topilganClientId === 'real7' && k.suhbat.shartnomaRaqami === 'AB1' && k.suhbat.sabab === 'Telegram raqami yashirin',
    JSON.stringify(k.suhbat));
    check(`15 (${nom}): needsHuman + tasdiq sababi`, k.convPatches.some((p) => p.needsHuman === true
      && p.humanReason === NOMALUM_SABAB_TASDIQ), JSON.stringify(k.convPatches));
  }
  {
    // Darvozalar hujjat holatida ham amal qiladi: operator qo'lga olgan bo'lsa jim.
    const { agent, k } = qur({ holat: 'hujjat_kutilmoqda', conv: { needsHuman: true } });
    await agent.reply(ID, 'Salom');
    check('16: hujjat_kutilmoqda + needsHuman — yuborilmadi', k.yuborilgan.length === 0 && k.suhbat.agentJavoblari === 0);
  }
  {
    const { agent, k } = qur({ holat: 'hujjat_kutilmoqda', killSwitch: true });
    await agent.reply(ID, 'Salom');
    check('17: hujjat_kutilmoqda + killSwitch — yuborilmadi', k.yuborilgan.length === 0 && k.suhbat.agentJavoblari === 0);
  }

  if (failed > 0) {
    console.error(`\n${failed} ta tekshiruv yiqildi`);
    process.exit(1);
  }
  console.log('\nHammasi o\'tdi');
}

void main();
