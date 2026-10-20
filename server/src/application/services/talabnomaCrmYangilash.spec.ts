import { TalabnomaCrmYangilash, type TalabnomaCrmYangilashDeps } from '@/application/services/TalabnomaCrmYangilash';
import type { SyncResult } from '@/application/services/ContractSyncService';
import type { TalabnomaNomzodi } from '@/domain/entities/Talabnoma';

/**
 * Qo'lda: npm run test:talabnoma-crm-yangilash --workspace=server
 *
 * «Agent navbati» guruhida: xizmat `shared/logger` orqali `shared/config`
 * ni tortadi. CRM ham, baza ham soxta.
 *
 *   • faqat INN yoki manzili yo'q nomzodlar sinxlanadi, bittadan;
 *   • kompaniyalar keshi boshida tashlanadi;
 *   • bir vaqtda bitta vazifa: ikkinchi bosish joriy holatni qaytaradi;
 *   • kechasigi to'liq sinx ketayotgan bo'lsa — tugashini kutadi;
 *   • bitta shartnoma xatosi (natija yoki istisno) vazifani to'xtatmaydi.
 */
let failed = 0;
const check = (name: string, a: unknown, e: unknown): void => {
  const ok = JSON.stringify(a) === JSON.stringify(e);
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(a)} (kutilgan: ${JSON.stringify(e)})`}`);
};

const HOZIR = new Date('2026-10-19T07:00:00Z');
const TODAY = '2026-10-19';

const nomzod = (contractId: string, over: Partial<TalabnomaNomzodi> = {}): TalabnomaNomzodi => ({
  contractId, clientId: `k-${contractId}`, contractNo: `N-${contractId}`,
  contractDate: new Date('2025-03-01T00:00:00Z'), objectName: 'Vatan', objectAddress: 'Toshkent',
  companyInn: '123456789', debtMonthly: 1000, fullName: 'Ism', firstName: 'Ism', qarindoshOrqali: false, virtualStatus: 'sold', ...over,
});

const natija = (contractId: string, outcome: SyncResult['outcome']): SyncResult => ({
  contractId, outcome, debtTotal: 0, newPhones: [], ...(outcome === 'error' ? { error: 'timeout' } : {}),
});

interface Muhit {
  x: TalabnomaCrmYangilash;
  jurnal: string[];
  /** `syncOne` ni qo'lda bo'shatish uchun (ish o'rtasidagi holatni ko'rish). */
  ochiq: { kutilsin: boolean; bosh: Array<() => void> };
  nightly: { band: boolean };
  kutishlar: number[];
  nomzodSorovlari: string[];
}

function muhit(o: {
  nomzodlar?: TalabnomaNomzodi[];
  natijalar?: Record<string, SyncResult['outcome'] | 'throw'>;
  nomzodXato?: boolean;
} = {}): Muhit {
  const jurnal: string[] = [];
  const ochiq = { kutilsin: false, bosh: [] as Array<() => void> };
  const nightly = { band: false };
  const kutishlar: number[] = [];
  const nomzodSorovlari: string[] = [];
  const deps: TalabnomaCrmYangilashDeps = {
    talabnomalar: {
      nomzodlar: async (today) => {
        nomzodSorovlari.push(today);
        if (o.nomzodXato) throw new Error('baza yiqildi');
        return o.nomzodlar ?? [];
      },
    },
    rekvizitManbai: { keshniTashla: () => { jurnal.push('kesh'); } },
    contractSync: {
      syncOne: async (id) => {
        if (ochiq.kutilsin) await new Promise<void>((r) => ochiq.bosh.push(r));
        jurnal.push(`sync:${id}`);
        const n = o.natijalar?.[id] ?? 'ok';
        if (n === 'throw') throw new Error('baza uzildi');
        return natija(id, n);
      },
    },
    clock: { now: () => HOZIR, todayIso: () => TODAY },
    nightlyBusy: () => nightly.band,
    pauzaMs: 0,
    kutishMs: 50,
    kut: async (ms) => {
      kutishlar.push(ms);
      jurnal.push(`kut:${ms}`);
      // Ikkinchi kutishdan keyin kechasigi sinx tugaydi.
      if (kutishlar.filter((k) => k === 50).length >= 2) nightly.band = false;
    },
  };
  return { x: new TalabnomaCrmYangilash(deps), jurnal, ochiq, nightly, kutishlar, nomzodSorovlari };
}

const tick = (): Promise<void> => new Promise((r) => setImmediate(r));

async function main(): Promise<void> {
  // --- boshlang'ich holat ---
  {
    const m = muhit();
    check('bosh holat', m.x.holat(), {
      holat: 'bosh', jami: 0, bajarildi: 0, yangilandi: 0, xatolar: 0, boshlangan: null, tugagan: null, sabab: null,
    });
  }

  // --- tanlash, kesh, sanash, xato davom etadi ---
  {
    const m = muhit({
      nomzodlar: [
        nomzod('A'), // to'liq — sinxlanmaydi
        nomzod('B', { companyInn: null }),
        nomzod('C', { objectAddress: null }),
        nomzod('D', { companyInn: '', objectAddress: null }),
        nomzod('E', { companyInn: null }),
        nomzod('F', { objectAddress: null }),
      ],
      natijalar: { C: 'error', D: 'throw', E: 'not_found' },
    });
    const s = m.x.boshla();
    check('boshla → ishlayapti', s.holat, 'ishlayapti');
    check('boshlangan vaqti', s.boshlangan, HOZIR.toISOString());
    await m.x.tugashi();
    check('nomzodlar bugungi sana bilan', m.nomzodSorovlari, [TODAY]);
    check('kesh birinchi, keyin faqat yetishmaganlar bittadan',
      m.jurnal.filter((j) => !j.startsWith('kut')), ['kesh', 'sync:B', 'sync:C', 'sync:D', 'sync:E', 'sync:F']);
    const h = m.x.holat();
    check('yakuniy hisob', [h.holat, h.jami, h.bajarildi, h.yangilandi, h.xatolar], ['tugadi', 5, 5, 2, 3]);
    check('tugagan vaqti', h.tugagan, HOZIR.toISOString());

    // Tugagandan keyin qayta bosish — yangi vazifa.
    m.jurnal.length = 0;
    m.x.boshla();
    await m.x.tugashi();
    check('tugagach qayta boshlanadi', m.jurnal.filter((j) => j === 'kesh').length, 1);
  }

  // --- bir vaqtda bitta ---
  {
    const m = muhit({ nomzodlar: [nomzod('B', { companyInn: null }), nomzod('C', { companyInn: null })] });
    m.ochiq.kutilsin = true;
    m.x.boshla();
    await tick();
    await tick();
    const ikkinchi = m.x.boshla();
    check('ikkinchi bosish — joriy holat', [ikkinchi.holat, ikkinchi.jami, ikkinchi.bajarildi], ['ishlayapti', 2, 0]);
    check('ikkinchi vazifa boshlanmadi (kesh bir marta)', m.jurnal.filter((j) => j === 'kesh').length, 1);
    m.ochiq.kutilsin = false;
    m.ochiq.bosh.splice(0).forEach((r) => r());
    await tick();
    await tick();
    check('ish o\'rtasida progress', m.x.holat().bajarildi >= 1, true);
    m.ochiq.bosh.splice(0).forEach((r) => r());
    await m.x.tugashi();
    check('ikkinchi bosish ikki marta sinxlamadi', m.jurnal.filter((j) => j.startsWith('sync')), ['sync:B', 'sync:C']);
    check('tugadi', [m.x.holat().holat, m.x.holat().bajarildi], ['tugadi', 2]);
  }

  // --- kechasigi sinxni kutadi ---
  {
    const m = muhit({ nomzodlar: [nomzod('B', { companyInn: null })] });
    m.nightly.band = true;
    m.x.boshla();
    await m.x.tugashi();
    check('kechasigi sinx tugaguncha kutdi, keyin sinxladi',
      m.jurnal, ['kesh', 'kut:50', 'kut:50', 'sync:B']);
  }

  // --- vazifaning o'zi yiqilsa ---
  {
    const m = muhit({ nomzodXato: true });
    m.x.boshla();
    await m.x.tugashi();
    const h = m.x.holat();
    check('nomzodlar yiqildi → xato + sabab', [h.holat, h.sabab], ['xato', 'baza yiqildi']);
    check('xato holatda ham tugagan vaqti', h.tugagan, HOZIR.toISOString());
  }

  // --- sinx o'chiq muhit ---
  {
    const m = muhit({ nomzodlar: [nomzod('B', { companyInn: null }), nomzod('C', { companyInn: null })], natijalar: { B: 'disabled' } });
    m.x.boshla();
    await m.x.tugashi();
    const h = m.x.holat();
    check('sinx o\'chiq → xato, qolganlariga chiqmaydi', [h.holat, h.sabab, m.jurnal.filter((j) => j.startsWith('sync'))],
      ['xato', "CRM sinxronizatsiyasi o'chirilgan", ['sync:B']]);
  }

  // --- holat nusxa: tashqaridan o'zgartirib bo'lmaydi ---
  {
    const m = muhit();
    const h = m.x.holat();
    h.jami = 99;
    check('holat nusxa qaytaradi', m.x.holat().jami, 0);
  }
}

main()
  .catch((e) => { failed += 1; console.error(e); })
  .finally(() => {
    if (failed > 0) {
      console.log(`\n${failed} ta tekshiruv muvaffaqiyatsiz`);
      process.exit(1);
    }
    console.log('\nHammasi o\'tdi');
  });
