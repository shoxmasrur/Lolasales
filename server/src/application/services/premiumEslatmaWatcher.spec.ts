import type { TelegramAccount } from '@/domain/entities/TelegramAccount';
import { PremiumEslatmaWatcher } from '@/application/services/PremiumEslatmaWatcher';

/** Qo'lda ishga tushiriladi: npm run test:premium-watcher --workspace=server */

let failed = 0;
const check = (name: string, actual: unknown, expected: unknown): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${a} (kutilgan: ${e})`}`);
};

type Akk = Pick<TelegramAccount, 'id' | 'label' | 'phone' | 'premiumUntil' | 'premiumEslatildi'>;

function muhit(akkauntlar: Akk[], opts: { soatUtc?: string; botUlangan?: boolean } = {}) {
  const xabarlar: string[] = [];
  const belgilar: Array<[string, number]> = [];
  const holat = akkauntlar.map((a) => ({ ...a }));
  const watcher = new PremiumEslatmaWatcher(
    {
      list: async () => holat as TelegramAccount[],
      markPremiumEslatildi: async (id, bosqich) => {
        belgilar.push([id, bosqich]);
        const a = holat.find((x) => x.id === id);
        if (a) a.premiumEslatildi = bosqich;
      },
    },
    {
      xabarYubor: async (matn) => {
        if (opts.botUlangan === false) return false;
        xabarlar.push(matn);
        return true;
      },
    },
    // Toshkent UTC+5: 05:00Z = 10:00 mahalliy.
    { now: () => new Date(`2026-10-09T${opts.soatUtc ?? '05:00'}:00Z`), todayIso: () => '2026-10-09' },
    'Asia/Tashkent',
    null,
  );
  return { watcher, xabarlar, belgilar };
}

const akk = (id: string, premiumUntil: string | null, premiumEslatildi: number | null = null): Akk => ({
  id, label: `Akk ${id}`, phone: '+998901112233', premiumUntil, premiumEslatildi,
});

{
  const m = muhit([akk('1', null), akk('2', '2027-10-09'), akk('3', '2026-11-08'), akk('4', '2026-10-15', 30)]);
  check('faqat muddati yaqinlarga ketadi', await m.watcher.run(), 2);
  check('bosqichlar belgilandi', m.belgilar, [['3', 30], ['4', 7]]);
  check('xabarda akkaunt nomi', m.xabarlar[0]?.includes('Akk 3'), true);
  check('ikkinchi tsiklda takrorlanmaydi', await m.watcher.run(), 0);
  check('xabarlar soni o\'zgarmadi', m.xabarlar.length, 2);
}

{
  const m = muhit([akk('1', '2026-11-08')], { botUlangan: false });
  check('bot ulanmagan — yuborilmadi', await m.watcher.run(), 0);
  // Belgi qo'yilmasa bot ulangach eslatma baribir ketadi.
  check('bot ulanmagan — bosqich belgilanmadi', m.belgilar, []);
}

{
  // 19:00Z = 00:00 Toshkent.
  const tun = muhit([akk('1', '2026-11-08')], { soatUtc: '19:00' });
  check('tunda yuborilmaydi', await tun.watcher.run(), 0);
  // 03:30Z = 08:30 Toshkent.
  const erta = muhit([akk('1', '2026-11-08')], { soatUtc: '03:30' });
  check('09:00 dan oldin yuborilmaydi', await erta.watcher.run(), 0);
  // 04:00Z = 09:00 Toshkent.
  const toqqiz = muhit([akk('1', '2026-11-08')], { soatUtc: '04:00' });
  check('09:00 da yuboriladi', await toqqiz.watcher.run(), 1);
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
