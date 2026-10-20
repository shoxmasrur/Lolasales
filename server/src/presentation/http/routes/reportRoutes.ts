import { Router } from 'express';
import { z } from 'zod';
import type { Request } from 'express';
import type { Container } from '@/composition/container';
import { currentUser, requirePermission } from '@/presentation/http/middleware/auth';
import { parseQuery } from '@/presentation/http/middleware/validate';
import type { AttributionReport } from '@/domain/repositories/IReportRepository';
import { ValidationError } from '@/shared/errors';
import { childLogger } from '@/shared/logger';
import { config } from '@/shared/config';
import { PRESET_KEYS, presetRange, type PresetKey } from '@/domain/services/davrOraligi';
import {
  QAMROVLAR,
  eksportDavriXatosi,
  jamiYigindi,
  type Qamrov,
  type XomTolov,
} from '@/domain/services/tushumBelgilari';
import {
  tushumKitobi,
  tushumQatorlari,
  type EksportMeta,
} from '@/application/usecases/reports/tushumEksporti';

const rangeQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana YYYY-MM-DD ko\'rinishida'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Sana YYYY-MM-DD ko\'rinishida'),
});

const log = childLogger('report-routes');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const tushumQuery = z.object({
  preset: z.enum(PRESET_KEYS as [PresetKey, ...PresetKey[]]).optional(),
  from: z.string().regex(ISO_DATE, 'Sana YYYY-MM-DD ko\'rinishida').optional(),
  to: z.string().regex(ISO_DATE, 'Sana YYYY-MM-DD ko\'rinishida').optional(),
  qamrov: z.enum(QAMROVLAR as [Qamrov, ...Qamrov[]]).default('all'),
  bahsli: z.enum(['true', 'false']).default('false'),
  q: z.string().trim().max(100).optional(),
});

/**
 * Hisobot bir necha jadval bo'yicha to'liq skan qiladi va sekin ishlaydi.
 * Sahifa ochilganda bir necha marta so'ralishi mumkin (sana o'zgartirilsa
 * yana), shuning uchun natija qisqa vaqtga keshlanadi — hisobot aniq
 * real vaqtli bo'lishi shart emas.
 */
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; value: AttributionReport }>();

/**
 * `paymentsForExport` ham og'ir: ANCHOR_CTE hamma chiquvchi xabarlarni skan
 * qiladi (xuddi `/attribution` kabi) va har to'lov uchun grafik `json_agg`
 * qiladi — bu pool `agent` bilan umumiy (max 10), shuning uchun har harf va
 * qamrov almashtirishda qayta so'ramaslik kerak. Kalitda `qamrov` yo'q — u
 * xotirada filtrlanadi, shuning uchun bitta kesh yozuvi hamma qamrov
 * tugmalariga xizmat qiladi. Xotira cheksiz o'smasin: yangi yozuvdan oldin
 * muddati o'tganlar o'chiriladi, hajm 50 dan oshsa eng eskisi o'chiriladi.
 */
const TUSHUM_CACHE_MS = 2 * 60 * 1000;
const TUSHUM_CACHE_LIMIT = 50;
const tushumCache = new Map<string, { at: number; value: readonly XomTolov[] }>();

function tushumKeshgaYoz(kalit: string, value: readonly XomTolov[]): void {
  const now = Date.now();
  for (const [k, v] of tushumCache) {
    if (now - v.at >= TUSHUM_CACHE_MS) tushumCache.delete(k);
  }
  if (tushumCache.size >= TUSHUM_CACHE_LIMIT) {
    const engEski = tushumCache.keys().next().value;
    if (engEski !== undefined) tushumCache.delete(engEski);
  }
  tushumCache.set(kalit, { at: now, value });
}

export function reportRoutes(container: Container): Router {
  const router = Router();
  const { reports } = container.repositories;

  router.get('/attribution', requirePermission('reports.view'), async (req, res) => {
    const { from, to } = parseQuery(rangeQuery, req);
    const key = `${from}:${to}`;

    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) {
      res.json(hit.value);
      return;
    }

    const value = await reports.attribution(from, to);
    cache.set(key, { at: Date.now(), value });
    res.json(value);
  });

  router.get('/campaigns', requirePermission('reports.view'), async (_req, res) => {
    res.json({ items: await reports.byCampaign(20) });
  });

  /** v1/v2 uslublarini taqqoslash — Task 8, kuzatuv hisoboti. */
  router.get('/uslub', requirePermission('reports.view'), async (req, res) => {
    const { from, to } = parseQuery(rangeQuery, req);
    res.json({ items: await reports.uslubTaqqoslash(from, to) });
  });

  /** Ovozli agentlar hisoboti — agent kaliti bo'yicha (qo'ng'iroq MCP, 3-bosqich). */
  router.get('/qongiroqlar', requirePermission('reports.view'), async (req, res) => {
    const { from, to } = parseQuery(rangeQuery, req);
    res.json({ items: await container.repositories.phoneCalls.agentlarHisoboti(from, to, config.TIMEZONE) });
  });

  /**
   * Filtrlarni o'qib, belgilangan qatorlarni qaytaradi.
   *
   * Tayyor davrda sanani SERVER hisoblaydi (`davrOraligi`), aniq sanalar
   * faqat "o'z oralig'i" uchun. Hamma tekshiruv fayl yozilishidan OLDIN —
   * xato oddiy JSON bo'lib qaytishi uchun.
   */
  async function tushumlar(req: Request) {
    const p = parseQuery(tushumQuery, req);
    // Preset yo'q va faqat bitta sana berilgan — jimgina o'tgan oyga tushmasin.
    if (!p.preset && Boolean(p.from) !== Boolean(p.to)) {
      throw new ValidationError("O'z oralig'i uchun ikkala sana kerak");
    }
    const { from, to } =
      p.preset === 'custom' || (!p.preset && p.from && p.to)
        ? { from: p.from ?? '', to: p.to ?? '' }
        : presetRange(p.preset ?? 'last_month', container.clock.now());
    if (!from || !to) throw new ValidationError("O'z oralig'i uchun ikkala sana kerak");
    const xato = eksportDavriXatosi(from, to);
    if (xato) throw new ValidationError(xato);

    const meta: EksportMeta = {
      from,
      to,
      qamrov: p.qamrov,
      bahsli: p.bahsli === 'true',
      q: p.q ? p.q : null,
      yaratilgan: container.clock.now(),
    };
    const kalit = `${from}:${to}:${meta.bahsli}:${meta.q ?? ''}`;
    const hit = tushumCache.get(kalit);
    let xom: readonly XomTolov[];
    if (hit && Date.now() - hit.at < TUSHUM_CACHE_MS) {
      xom = hit.value;
    } else {
      xom = await reports.paymentsForExport({ from, to, bahsli: meta.bahsli, q: meta.q });
      tushumKeshgaYoz(kalit, xom);
    }
    return { meta, rows: tushumQatorlari(xom, meta.qamrov) };
  }

  /** Tugma yonida "nechta, qancha" — bosishdan oldin ko'rinsin. */
  router.get('/payments/summary', requirePermission('reports.view'), async (req, res) => {
    const { meta, rows } = await tushumlar(req);
    const { hammasi } = jamiYigindi(rows);
    res.json({ from: meta.from, to: meta.to, soni: hammasi.soni, summa: hammasi.summa });
  });

  router.get('/payments/export', requirePermission('reports.view'), async (req, res) => {
    const user = currentUser(req);
    const { meta, rows } = await tushumlar(req);
    const buf = await tushumKitobi(rows, meta).xlsx.writeBuffer();

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="tushumlar-${meta.from}_${meta.to}.xlsx"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(buf as ArrayBuffer));

    // Jurnal xatosi javobga ta'sir qilmaydi — fayl allaqachon ketgan.
    await container.repositories.audit
      .record({
        actor: user.id,
        action: 'reports.payments_exported',
        entity: 'report',
        entityId: null,
        payload: {
          count: rows.length,
          from: meta.from,
          to: meta.to,
          qamrov: meta.qamrov,
          bahsli: meta.bahsli,
          q: meta.q,
        },
      })
      .catch((err) => log.error({ err }, 'Tushumlar eksporti jurnalga tushmadi'));
  });

  return router;
}
