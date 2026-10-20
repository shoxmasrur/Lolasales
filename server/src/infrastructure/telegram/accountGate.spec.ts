import { AccountGate, type GateDelays } from '@/infrastructure/telegram/AccountGate';

/**
 * Qo'lda: npm run test:account-gate --workspace=server
 *
 * Vaqt ham, tasodif ham tashqaridan beriladi: sinov real soniyalarni
 * kutmaydi va natija har safar bir xil chiqadi.
 */
const KECHIKISH: GateDelays = {
  messageMinSec: 5,
  messageMaxSec: 20,
  otherMinSec: 1,
  otherMaxSec: 4,
};

let failed = 0;
const check = (name: string, ok: boolean, extra = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${extra}`}`);
};

/** Soxta soat: `sleep` vaqtni oldinga suradi, real kutish yo'q. */
function qurilma(random = () => 0.5) {
  let hozir = 0;
  const gate = new AccountGate({
    delays: async () => KECHIKISH,
    now: () => hozir,
    random,
    sleep: async (ms) => { hozir += ms; },
  });
  return { gate, soat: () => hozir, sur: (ms: number) => { hozir += ms; } };
}

const kut = (): Promise<void> => new Promise((r) => setImmediate(r));

// ── 1. Bitta akkauntda ikki operatsiya ketma-ket ketadi ──────────────────
{
  const { gate } = qurilma();
  const iz: string[] = [];

  const ish = (nom: string) => gate.run('A', { kind: 'other', label: nom }, async () => {
    iz.push(`${nom}:boshlandi`);
    await kut();
    iz.push(`${nom}:tugadi`);
  });

  await Promise.all([ish('bir'), ish('ikki')]);

  check(
    'bitta akkaunt — ustma-ust ishlamaydi',
    iz.join(' ') === 'bir:boshlandi bir:tugadi ikki:boshlandi ikki:tugadi',
    iz.join(' '),
  );
}

// ── 2. Turli akkauntlar bir-birini kutmaydi ─────────────────────────────
{
  const { gate } = qurilma();
  const iz: string[] = [];

  const ish = (akkaunt: string) => gate.run(akkaunt, { kind: 'other', label: akkaunt }, async () => {
    iz.push(`${akkaunt}:boshlandi`);
    await kut();
    iz.push(`${akkaunt}:tugadi`);
  });

  await Promise.all([ish('A'), ish('B')]);

  check(
    'turli akkauntlar parallel ketadi',
    iz.join(' ') === 'A:boshlandi B:boshlandi A:tugadi B:tugadi',
    iz.join(' '),
  );
}

// ── 3. Mijoz javobi fon ishidan oldin o'tadi ────────────────────────────
{
  const { gate } = qurilma();
  const iz: string[] = [];

  const ish = (nom: string, priority: 'reply' | 'manual' | 'background') =>
    gate.run('A', { kind: 'other', label: nom, priority }, async () => {
      iz.push(nom);
      await kut();
    });

  // Birinchisi darhol qulfni oladi; qolgan uchtasi navbatda turadi.
  const band = ish('band', 'background');
  await kut();
  const fon1 = ish('fon1', 'background');
  const javob = ish('javob', 'reply');
  const fon2 = ish('fon2', 'background');
  await Promise.all([band, fon1, javob, fon2]);

  check(
    'javob navbatda oldinga o\'tdi',
    iz.join(' ') === 'band javob fon1 fon2',
    iz.join(' '),
  );
}

// ── 4. Operatsiyalar orasida tasodifiy tanaffus bor ─────────────────────
{
  // random = 0.5 → xabar uchun (5 + 0.5 × 15) = 12,5 s
  const { gate, soat } = qurilma(() => 0.5);

  await gate.run('A', { kind: 'message', label: 'bir' }, async () => undefined);
  const birinchidanKeyin = soat();
  await gate.run('A', { kind: 'message', label: 'ikki' }, async () => undefined);

  check('xabarlar orasida 12,5 s kutildi', soat() - birinchidanKeyin === 12_500, String(soat()));
}

// ── 5. Qidiruv uchun tanaffus qisqaroq ──────────────────────────────────
{
  // random = 0 → eng past chegara: 1 s
  const { gate, soat } = qurilma(() => 0);

  await gate.run('A', { kind: 'other', label: 'bir' }, async () => undefined);
  const birinchidanKeyin = soat();
  await gate.run('A', { kind: 'other', label: 'ikki' }, async () => undefined);

  check('qidiruvlar orasida 1 s kutildi', soat() - birinchidanKeyin === 1000, String(soat()));
}

// ── 6. Xato ham navbatni bo'shatadi ─────────────────────────────────────
{
  const { gate } = qurilma();
  let ikkinchisiKetdi = false;

  await gate.run('A', { kind: 'other', label: 'yiqiladi' }, async () => {
    throw new Error('sinov');
  }).catch(() => undefined);

  await gate.run('A', { kind: 'other', label: 'keyingi' }, async () => {
    ikkinchisiKetdi = true;
  });

  check('xatodan keyin navbat ochiq qoldi', ikkinchisiKetdi);
}

// ── 7. Ichki chaqiruv o'zini o'zi bloklamaydi ───────────────────────────
{
  const { gate } = qurilma();
  let ichkarigaYetdi = false;

  // Mantiqiy operatsiya ichidagi API chaqiruvlari (o'qildi → yozmoqda →
  // yubordi) qayta navbat kutmasligi kerak.
  await gate.run('A', { kind: 'message', label: 'tashqi' }, async () => {
    await gate.run('A', { kind: 'other', label: 'ichki' }, async () => {
      ichkarigaYetdi = true;
    });
  });

  check('ichki chaqiruv qulfni qayta kutmadi', ichkarigaYetdi);
}

// ── 8. Osilib qolgan chaqiruv navbatni abadiy to'smaydi ─────────────────
{
  let hozir = 0;
  const gate = new AccountGate({
    delays: async () => KECHIKISH,
    now: () => hozir,
    random: () => 0,
    sleep: async (ms) => { hozir += ms; },
    timeoutMs: 5,
  });

  let osilganTugadi = false;
  let keyingisiKetdi = false;

  const osilgan = gate.run('A', { kind: 'other', label: 'osilgan' }, async () => {
    await new Promise((r) => setTimeout(r, 40));
    osilganTugadi = true;
  });

  // Chegara o'tgach navbat bo'shaydi va keyingisi kuta olmay qolmaydi.
  await new Promise((r) => setTimeout(r, 20));
  await gate.run('A', { kind: 'other', label: 'keyingi' }, async () => {
    keyingisiKetdi = true;
  });

  check('chegaradan keyin keyingisi o\'tdi', keyingisiKetdi && !osilganTugadi);
  await osilgan;
}

console.log(failed ? `\n${failed} ta tekshiruv yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
