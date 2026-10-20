import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '@/composition/container';
import { parseQuery } from '@/presentation/http/middleware/validate';
import { ValidationError } from '@/shared/errors';
import { bugungiKun, kunOraligi, kunSanasiXatosi } from '@/domain/services/kunChegarasi';
import {
  filtrgaMos,
  kunFiltrVariantlari,
  kunRaqamlari,
  muammoliSuhbatlar,
  type KunFiltri,
  type XomKunStat,
  type XomSuhbat,
} from '@/domain/services/kunlikToifalar';

/** Bo'sh qiymat — filtr yo'q (select dagi «Hammasi»). */
const boshBolsaYoq = (v: unknown): unknown =>
  typeof v === 'string' && v.trim() === '' ? undefined : typeof v === 'string' ? v.trim() : v;

const kunQuery = z.object({
  date: z.string().optional(),
  obyekt: z.preprocess(boshBolsaYoq, z.string().max(200).optional()),
  akkaunt: z.preprocess(boshBolsaYoq, z.string().uuid().optional()),
});

/**
 * Javobdagi qatorlar uchun QATTIQ chegara — oddiy kunda bunga yetmaydi
 * (100 talik eski chegara ko'p kunlarni kesib qo'yardi). Sahifa ularni
 * 50 tadan ko'rsatadi; `jami` doim hammasi.
 */
const ENG_KOP_QATOR = 2000;

/**
 * So'rov og'ir: har suhbat uchun bir necha kichik so'rov ketadi. Sahifa
 * har daqiqada yangilanadi; kesh muddati poll oralig'idan UZUNROQ bo'lishi
 * kerak, aks holda har poll kesh muddati tugagandan keyin keladi va kesh
 * amalda ishlamaydi. O'tgan kun o'zgarmaydi — u uzoqroq turadi.
 */
const BOSH_STAT: XomKunStat = {
  yozilganMijoz: 0, javobBerganMijoz: 0, vadaSoni: 0, vadaSummasi: 0, tushumSummasi: 0,
};

const KESH_BUGUN_MS = 120 * 1000;
const KESH_OTGAN_MS = 10 * 60 * 1000;

interface Kesh<T> {
  readonly yozuv: Map<string, { at: number; value: T }>;
  // Bir kalit uchun bir vaqtda ikkita og'ir so'rov ketmasin (pg pool 10 ta
  // ulanish bilan cheklangan, agent bilan bo'lishiladi) — ketayotgan so'rov
  // shu yerda saqlanadi, kelgan so'rovlar unga qo'shiladi.
  readonly kelayotgan: Map<string, Promise<T>>;
  /** Kesh cheksiz o'smasin: shundan oshsa ENG ESKI yozuv chiqariladi. */
  readonly sigim: number;
}

const yangiKesh = <T>(sigim: number): Kesh<T> => ({ yozuv: new Map(), kelayotgan: new Map(), sigim });

function keshla<T>(k: Kesh<T>, kalit: string, ttl: number, hisobla: () => Promise<T>): Promise<T> {
  const hit = k.yozuv.get(kalit);
  if (hit && Date.now() - hit.at < ttl) return Promise.resolve(hit.value);

  let jarayon = k.kelayotgan.get(kalit);
  if (!jarayon) {
    jarayon = hisobla().then((value) => {
      // Map qo'shilish tartibini saqlaydi — birinchi kalit eng eskisi.
      k.yozuv.delete(kalit);
      k.yozuv.set(kalit, { at: Date.now(), value });
      while (k.yozuv.size > k.sigim) k.yozuv.delete(k.yozuv.keys().next().value!);
      return value;
    });
    jarayon
      .catch(() => {
        // Xato bo'lsa keshda chala yozuv qolmasin — keyingi so'rov qayta urinsin.
        k.yozuv.delete(kalit);
      })
      .finally(() => k.kelayotgan.delete(kalit));
    k.kelayotgan.set(kalit, jarayon);
  }
  return jarayon;
}

export function dailyRoutes(container: Container): Router {
  const router = Router();
  const { daily } = container.repositories;

  // Javob — kun + filtr kaliti bilan. Og'ir suhbatlar ro'yxati esa kun
  // bo'yicha alohida keshda: filtr almashganda u qayta so'ralmaydi
  // (filtr JS da qo'llanadi), faqat yengil `kunStat` ketadi. Xom ro'yxat
  // katta (mijoz matnlari bilan) — shuning uchun eng ko'pi 3 kun.
  const javoblar = yangiKesh<unknown>(50);
  const xomlar = yangiKesh<XomSuhbat[]>(3);

  router.get('/', async (req, res) => {
    const q = parseQuery(kunQuery, req);
    const bugun = bugungiKun(container.clock.now());
    const kun = q.date ?? bugun;

    const xato = kunSanasiXatosi(kun, bugun);
    if (xato) throw new ValidationError(xato);

    const filtr: KunFiltri = { obyekt: q.obyekt ?? null, akkaunt: q.akkaunt ?? null };
    const ttl = kun === bugun ? KESH_BUGUN_MS : KESH_OTGAN_MS;
    const kalit = JSON.stringify([kun, filtr.obyekt, filtr.akkaunt]);

    const { boshIso, oxirIso } = kunOraligi(kun);
    const xomOl = (): Promise<XomSuhbat[]> =>
      keshla(xomlar, kun, ttl, () => daily.kunSuhbatlari(boshIso, oxirIso, kun));

    // Filtr qiymati shu kunda uchramasa — kunStat ham, kesh ham yo'q:
    // ixtiyoriy satrlar bilan keshni to'ldirib, eski kalitlarni siqib
    // chiqarish mumkin bo'lmasin. Javob nol (ro'yxat ham bo'sh bo'lardi).
    if (filtr.obyekt || filtr.akkaunt) {
      const variantlar = kunFiltrVariantlari(await xomOl());
      const notanish =
        (filtr.obyekt && !variantlar.obyektlar.includes(filtr.obyekt)) ||
        (filtr.akkaunt && !variantlar.akkauntlar.some((a) => a.id === filtr.akkaunt));
      if (notanish) {
        res.json({
          date: kun,
          filtr,
          raqamlar: kunRaqamlari(BOSH_STAT, []),
          suhbatlar: [],
          jami: 0,
          variantlar,
        });
        return;
      }
    }

    const value = await keshla(javoblar, kalit, ttl, async () => {
      const [stat, xom] = await Promise.all([daily.kunStat(boshIso, oxirIso, kun, filtr), xomOl()]);

      const tanlangan = xom.filter((x) => filtrgaMos(x, filtr));
      const hammasi = muammoliSuhbatlar(tanlangan);
      return {
        date: kun,
        filtr,
        raqamlar: kunRaqamlari(stat, tanlangan),
        suhbatlar: hammasi.slice(0, ENG_KOP_QATOR),
        jami: hammasi.length,
        variantlar: kunFiltrVariantlari(xom),
      };
    });

    res.json(value);
  });

  return router;
}
