import {
  BulkTelegramLookup,
  type BulkLookupJob,
} from '@/application/services/BulkTelegramLookup';
import type { ClientTelegramResolver } from '@/application/services/ClientTelegramResolver';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IEventBus } from '@/domain/services/support';

/**
 * Qo'lda ishga tushiriladi: npm run test:bulk-lookup-stop --workspace=server
 *
 * Telegramga ham, bazaga ham chiqmaydi.
 *
 * NEGA KERAK: operator "To'xtatish"ni bosgach vazifa darhol to'xtashi
 * kerak. Ilgari tsikl ikki mijoz orasidagi pauzada turgani uchun bayroq
 * faqat KEYINGI mijozga o'tishda o'qilardi — pauza o'nlab daqiqa bo'lsa
 * ish shuncha vaqt "ketyapti" bo'lib ko'rinardi.
 */
let failed = 0;
const check = (name: string, ok: boolean, izoh = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !izoh ? '' : `  ${izoh}`}`);
};

function build(delayMs: number): BulkTelegramLookup {
  const clients = {
    findById: async (id: string) => ({ id, fullName: `Mijoz ${id}` }),
  } as unknown as IClientRepository;

  // Har doim topiladi — sinovni qiziqtirgani natija emas, pauza.
  const resolver = {
    resolve: async () => ({ kind: 'ok' }),
  } as unknown as ClientTelegramResolver;

  return new BulkTelegramLookup(
    clients,
    resolver,
    { publish: () => undefined } as unknown as IEventBus,
    delayMs,
  );
}

/** Berilgan shart bajarilguncha kutamiz — ish fonda ketadi. */
async function kut(
  lookup: BulkTelegramLookup,
  shart: (job: BulkLookupJob) => boolean,
  nima: string,
): Promise<BulkLookupJob> {
  for (let i = 0; i < 500; i += 1) {
    const job = lookup.current();
    if (job && shart(job)) return job;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`kutilgan holat kelmadi: ${nima}`);
}

// ─── To'xtatish pauzani uzadi ────────────────────────────────────────────
// Pauza 60 soniya. Eski xatti-harakatda `stop()` faqat bayroq qo'yardi va
// vazifa shu 60 soniya tugagunicha "ketyapti" bo'lib turardi.
{
  const lookup = build(60_000);
  await lookup.start(['c1', 'c2', 'c3'], 'j1');

  // Birinchi mijoz tugadi → tsikl endi pauzada.
  await kut(lookup, (j) => j.done === 1, 'birinchi mijoz tugashi');

  const boshlandi = Date.now();
  lookup.stop();
  const job = await kut(lookup, (j) => j.status !== 'running', 'to\'xtash');
  const ketganVaqt = Date.now() - boshlandi;

  check('holat "stopped"', job.status === 'stopped', job.status);
  check(
    'pauza kutilmadi — darhol to\'xtadi',
    ketganVaqt < 1000,
    `${ketganVaqt} ms`,
  );
  check('tugash vaqti yozildi', job.finishedAt !== null, String(job.finishedAt));
  check('qolgan mijozlar tekshirilmadi', job.done === 1, String(job.done));
}

// ─── Ish ketmayotganda to'xtatish xato bermaydi ──────────────────────────
// Interfeys tugmasi ikki marta bosilishi mumkin.
{
  const lookup = build(0);
  let xato: unknown = null;
  try {
    lookup.stop();
  } catch (err) {
    xato = err;
  }
  check('bo\'sh holatda stop() xato tashlamaydi', xato === null, String(xato));
}

// ─── To'xtatilgandan keyingi yangi ish oxirigacha boradi ─────────────────
// NEGA: bitta kontroller qayta ishlatilsa uning signali to'xtatishdan
// keyin abadiy "abort" holatida qolardi — keyingi ish tugagunicha borsa
// ham pauzasiz ketardi, ya'ni Telegram cheklovidan himoya yo'qolardi.
// Shuning uchun bu yerda nafaqat tugash, PAUZA saqlanganini ham
// tekshiramiz. Pauza qisqa (40 ms) — sinov tez tugasin.
{
  const PAUZA = 40;
  const lookup = build(PAUZA);

  // Birinchi ishni chinakam to'xtatamiz — kontroller haqiqatan "abort"ga
  // o'tsin, aks holda guard hech narsani ushlamaydi.
  await lookup.start(['a1', 'a2', 'a3'], 'j2');
  await kut(lookup, (j) => j.done === 1, 'birinchi ish pauzaga kirishi');
  lookup.stop();
  // `start()` ish ketayotgan bo'lsa xato tashlaydi — avval to'liq to'xtasin.
  const birinchi = await kut(lookup, (j) => j.status !== 'running', 'birinchi ishning to\'xtashi');
  check('birinchi ish to\'xtatildi', birinchi.status === 'stopped', birinchi.status);

  const boshlandi = Date.now();
  await lookup.start(['b1', 'b2'], 'j3');
  const job = await kut(lookup, (j) => j.id === 'j3' && j.status !== 'running', 'ikkinchi ish');
  const ketganVaqt = Date.now() - boshlandi;

  check('yangi ish tugadi', job.status === 'done', job.status);
  check('hammasi tekshirildi', job.done === 2, String(job.done));
  check('hammasi topildi', job.found === 2, String(job.found));
  check(
    'yangi ishda pauza saqlandi — eski signal meros qolmadi',
    ketganVaqt >= PAUZA - 5,
    `${ketganVaqt} ms`,
  );
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
