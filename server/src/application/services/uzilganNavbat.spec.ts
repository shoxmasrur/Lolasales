import { ReplyDebouncer } from '@/application/services/ReplyDebouncer';
import type { AgentRunner } from '@/application/services/AgentRunner';
import type { AgentTurnResult } from '@/application/services/AgentRunner';
import { StaleTurnError } from '@/shared/errors';

/**
 * Qo'lda ishga tushiriladi: npm run test:uzilgan-navbat --workspace=server
 *
 * Telegramga ham, bazaga ham, modelga ham chiqmaydi.
 *
 * NEGA KERAK: model 40 soniyagacha ishlaydi. Shu orada mijoz yana yozsa,
 * ketayotgan navbat ikki tomondan ham foydasiz bo'lib qoladi — javobi
 * eskirgan, tokenlari esa sarflanaveradi (prodda bitta shunday tashlangan
 * navbat $0.38 turgan).
 *
 * Shuning uchun yangi xabar kelishi bilan ketayotgan navbat DARHOL
 * uziladi. Uzilgan navbatning xabarlari buferga QAYTARILADI: ular hali
 * javob olmagan, ya'ni keyingi navbat ularni ham ko'rishi shart. Aks holda
 * mijozning "Bugun to'layman" degani yo'qolib, agent faqat undan keyingi
 * "😊" ga javob berardi.
 *
 * Uzilish nosozlik EMAS: suhbat operatorga chiqarilmaydi.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

const SUHBAT_ID = 's1';
/** Sinov tez o'tsin — haqiqiy oyna 8 soniya. */
const KUTISH_MS = 20;

const NATIJA = { sent: true, reply: 'javob', escalated: false, promiseRecorded: false } as AgentTurnResult;

/** Berilgan shart bajarilguncha kutamiz. */
async function kut(shart: () => boolean, nima: string, urinish = 200): Promise<void> {
  for (let i = 0; i < urinish; i += 1) {
    if (shart()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`kutilmadi: ${nima}`);
}

interface Kuzatuv {
  /** `agent.reply()` ga kirgan matnlar — birlashtirish shu yerda ko'rinadi. */
  chaqiruvlar: string[];
  /** `agent.abort()` chaqiruvlari. `uzildi` — haqiqatan ketayotgan navbat bo'lganmi. */
  uzishlar: Array<{ id: string; sabab: string | undefined; uzildi: boolean }>;
  /** Operatorga chiqarish — bu ro'yxat bo'sh qolishi kerak. */
  xatolar: unknown[];
}

interface Rejim {
  /** Model shuncha "o'ylaydi". */
  javobMs: number;
}

function build(): { deb: ReplyDebouncer; kuzatuv: Kuzatuv; rejim: Rejim } {
  const kuzatuv: Kuzatuv = { chaqiruvlar: [], uzishlar: [], xatolar: [] };
  const rejim: Rejim = { javobMs: 0 };
  /** Ketayotgan navbatni uzadigan funksiya — haqiqiy `AbortController` o'rnida. */
  const ketayotgan = new Map<string, () => void>();

  const agent = {
    reply: async (id: string, matn: string): Promise<AgentTurnResult> => {
      kuzatuv.chaqiruvlar.push(matn);
      return new Promise<AgentTurnResult>((resolve, reject) => {
        const timer = setTimeout(() => {
          ketayotgan.delete(id);
          resolve(NATIJA);
        }, rejim.javobMs);
        // Haqiqiy `AgentRunner` 'stale' sababi bilan uzilganda aynan
        // shu xatoni otadi.
        ketayotgan.set(id, () => {
          clearTimeout(timer);
          ketayotgan.delete(id);
          reject(new StaleTurnError());
        });
      });
    },
    abort: (id: string, sabab?: string): number => {
      const uz = ketayotgan.get(id);
      kuzatuv.uzishlar.push({ id, sabab, uzildi: Boolean(uz) });
      if (!uz) return 0;
      uz();
      return 1;
    },
  } as unknown as AgentRunner;

  const deb = new ReplyDebouncer(agent, KUTISH_MS, async (_id, err) => {
    kuzatuv.xatolar.push(err);
  });

  return { deb, kuzatuv, rejim };
}

// ─── Ketayotgan navbat uziladi, matni esa yo'qolmaydi ────────────────────
{
  const { deb, kuzatuv, rejim } = build();
  rejim.javobMs = 5_000; // uzilmasa sinov shu yerda qotib qolardi

  deb.push(SUHBAT_ID, 'Bugun to\'layman');
  await kut(() => kuzatuv.chaqiruvlar.length === 1, 'birinchi navbat boshlanmadi');

  rejim.javobMs = 0; // keyingi navbat darhol tugasin
  deb.push(SUHBAT_ID, 'Insha\'Alloh');

  const stale = kuzatuv.uzishlar.filter((u) => u.uzildi);
  check(
    'ketayotgan navbat uzildi',
    stale.length === 1 && stale[0]?.sabab === 'stale',
    JSON.stringify(kuzatuv.uzishlar),
  );

  await kut(() => kuzatuv.chaqiruvlar.length === 2, 'ikkinchi navbat boshlanmadi');
  check(
    'uzilgan navbatning matni buferga qaytdi',
    kuzatuv.chaqiruvlar[1] === 'Bugun to\'layman\nInsha\'Alloh',
    JSON.stringify(kuzatuv.chaqiruvlar),
  );

  await new Promise((r) => setTimeout(r, 60));
  check('uzilish operatorga chiqarilmadi', kuzatuv.xatolar.length === 0, JSON.stringify(kuzatuv.xatolar));
  check('boshqa navbat qo\'shilmadi', kuzatuv.chaqiruvlar.length === 2, JSON.stringify(kuzatuv.chaqiruvlar));
}

// ─── `hasPending` — javob kutayotgan xabar bormi ─────────────────────────
{
  const { deb, kuzatuv, rejim } = build();
  rejim.javobMs = 5_000;

  check('bo\'sh debouncerda kutayotgan xabar yo\'q', deb.hasPending(SUHBAT_ID) === false);

  deb.push(SUHBAT_ID, 'Bugun to\'layman');
  check('push dan keyin xabar kutmoqda', deb.hasPending(SUHBAT_ID) === true);

  await kut(() => kuzatuv.chaqiruvlar.length === 1, 'navbat boshlanmadi');
  check('navbat boshlangach bufer bo\'shaydi', deb.hasPending(SUHBAT_ID) === false);

  deb.push(SUHBAT_ID, 'Insha\'Alloh');
  check('navbat ustiga kelgan xabar kutmoqda', deb.hasPending(SUHBAT_ID) === true);
}

// ─── Tez ketma-ket kelgan xabarlar avvalgidek birlashadi ─────────────────
{
  const { deb, kuzatuv, rejim } = build();
  rejim.javobMs = 0;

  deb.push(SUHBAT_ID, 'Bugun');
  deb.push(SUHBAT_ID, 'to\'layman');
  await kut(() => kuzatuv.chaqiruvlar.length === 1, 'navbat boshlanmadi');

  check(
    'ikkita xabar bitta navbatga birlashdi',
    kuzatuv.chaqiruvlar[0] === 'Bugun\nto\'layman',
    JSON.stringify(kuzatuv.chaqiruvlar),
  );
  check(
    'ketayotgan navbat bo\'lmagani uchun hech narsa uzilmadi',
    kuzatuv.uzishlar.every((u) => !u.uzildi),
    JSON.stringify(kuzatuv.uzishlar),
  );

  await new Promise((r) => setTimeout(r, 60));
  check('qo\'shimcha navbat qo\'yilmadi', kuzatuv.chaqiruvlar.length === 1, JSON.stringify(kuzatuv.chaqiruvlar));
}

console.log(failed === 0 ? '\nHammasi joyida' : `\n${failed} ta tekshiruv yiqildi`);
process.exit(failed === 0 ? 0 : 1);
