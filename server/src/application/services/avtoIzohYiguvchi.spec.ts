import { AvtoIzohYiguvchi } from '@/application/services/AvtoIzohYiguvchi';
import type { IzohYiguvchi, IzohQatori } from '@/application/services/IzohYiguvchi';
import type { OutreachSettings } from '@/application/services/RuntimeSettings';
import type { AjratilganIzoh } from '@/domain/services/izohFiltri';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';

/**
 * Qo'lda ishga tushiriladi: npm run test:avto-izoh-yiguvchi --workspace=server
 *
 * Tekshiriladi: faqat kalit so'zga mos, yangi, shaxsiy xabar yozish mumkin bo'lgan
 * odamlar lead bo'ladi; `izohAvtoMaxYangi` chegarasi saqlanadi; akkaunt yo'q bo'lsa
 * hech narsa qilinmaydi.
 */
let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

const peer = (id: string) => ({
  telegramUserId: id, accessHash: 'h', username: null, firstName: `Ism${id}`, lastName: null,
});

const izoh = (id: string, over: Partial<AjratilganIzoh> = {}): AjratilganIzoh => ({
  id: Number(id),
  postId: 1,
  date: new Date(),
  text: 'narxi qancha',
  author: { kind: 'user', peer: peer(id), fullName: `Odam ${id}` },
  tanlasaBoladi: true,
  mavjudMijoz: false,
  ...over,
});

function qur(opts: { items: AjratilganIzoh[]; max?: number; akkaunt?: boolean }) {
  const chaqiruvlar: IzohQatori[][] = [];
  const yiguvchi = {
    kanallar: async () => [{ peer: { peerId: '5', accessHash: 'x', kind: 'channel' as const }, title: 'Kanal', linkedChatId: '6', memberOfLinked: true }],
    kommentlar: async () => ({ items: opts.items, partial: null }),
    mijozQil: async (_a: string, _t: string, items: IzohQatori[]) => {
      chaqiruvlar.push(items);
      return { created: items.length, existing: 0, campaignId: 'k1', campaignSkipped: false };
    },
  } as unknown as Pick<IzohYiguvchi, 'kanallar' | 'kommentlar' | 'mijozQil'>;
  const settings = {
    get: async () => ({
      killSwitch: false, izohAvtoYoqilgan: true, izohAvtoAkkauntId: null,
      izohAvtoOraliqMin: 60, izohAvtoKunlar: 3, izohAvtoMaxYangi: opts.max ?? 10,
    }) as unknown as OutreachSettings,
  };
  const accounts = { listConnected: async () => (opts.akkaunt === false ? [] : [{ id: 'a1' }]) } as never;
  const audit = { record: async () => undefined } as unknown as IAuditRepository;
  return { servis: new AvtoIzohYiguvchi(yiguvchi, accounts, settings, audit), chaqiruvlar };
}

async function main(): Promise<void> {
  {
    const { servis, chaqiruvlar } = qur({
      items: [
        izoh('1'),
        izoh('2', { tanlasaBoladi: false }),
        izoh('3', { mavjudMijoz: true }),
        izoh('4', { author: { kind: 'anonim', title: 'Kanal' } }),
      ],
    });
    const r = await servis.birYurish();
    check("faqat mos, yangi, foydalanuvchi izohi lead bo'ladi", r.yangi, 1);
    check("mijozQil to'g'ri odam bilan chaqirildi", chaqiruvlar[0]?.map((i) => i.peer.telegramUserId), ['1']);
    check("izoh egasining ismi o'tadi", chaqiruvlar[0]?.[0]?.fullName, 'Odam 1');
  }
  {
    const { servis } = qur({ items: [izoh('1'), izoh('2'), izoh('3'), izoh('4')], max: 2 });
    const r = await servis.birYurish();
    check('bir yurishda max chegarasi saqlanadi', r.yangi, 2);
  }
  {
    const { servis, chaqiruvlar } = qur({ items: [izoh('1')], akkaunt: false });
    const r = await servis.birYurish();
    check("akkaunt yo'q — hech narsa qilinmaydi", [r.yangi, r.sabab, chaqiruvlar.length], [0, 'akkaunt_yoq', 0]);
  }
  {
    const { servis, chaqiruvlar } = qur({ items: [] });
    const r = await servis.birYurish();
    check("mos izoh yo'q — kampaniya yaratilmaydi", [r.yangi, chaqiruvlar.length], [0, 0]);
  }

  if (failed) {
    console.error(`\n${failed} ta tekshiruv muvaffaqiyatsiz`);
    process.exit(1);
  }
  console.log("\nHammasi o'tdi");
}

void main();
