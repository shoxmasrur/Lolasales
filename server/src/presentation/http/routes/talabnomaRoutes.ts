import { Router, type Response } from 'express';
import type { Container } from '@/composition/container';
import type { TalabnomaHolati } from '@/domain/entities/Talabnoma';
import { talabnomaRaqami } from '@/domain/services/talabnomaFormat';
import { currentUser, requirePermission } from '@/presentation/http/middleware/auth';
import { AppError } from '@/shared/errors';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOLATLAR: readonly TalabnomaHolati[] = ['yuborilmoqda', 'yuborildi', 'xato', 'bekor'];
const MAX_LIMIT = 100;
const SUKUT_LIMIT = 50;
/** Filtr qiymatining eng uzun yo'l qo'yiladigan uzunligi (obyekt nomi, holat kaliti). */
const FILTR_MAX = 200;

/**
 * Ixtiyoriy matnli filtr: qirqiladi, bo'sh — yo'q. Massiv (takrorlangan
 * parametr) yoki juda uzun qiymat — 400: jim e'tiborsiz qoldirish operatorga
 * filtrlanmagan ro'yxatni filtrlangandek ko'rsatardi.
 */
function filtr(qiymat: unknown, nom: string): string | undefined {
  if (qiymat === undefined) return undefined;
  if (typeof qiymat !== 'string' || qiymat.length > FILTR_MAX) {
    throw new AppError(`${nom} noto'g'ri`, 400, 'VALIDATION_ERROR');
  }
  return qiymat.trim() || undefined;
}

/**
 * NEGA 400: `:id` to'g'ridan-to'g'ri SQL parametriga tushadi; UUID bo'lmasa
 * baza "invalid input syntax" bilan 500 qaytarardi. Operatorga 500 emas,
 * aniq xato ko'rinsin.
 */
function uuid(qiymat: unknown, nom: string): string {
  const s = String(qiymat);
  if (!UUID.test(s)) throw new AppError(`${nom} noto'g'ri`, 400, 'VALIDATION_ERROR');
  return s;
}

/** Musbat butun son; bo'sh yoki yaroqsiz qiymat — sukut. Tepa chegara qisqartiriladi. */
function musbatSon(qiymat: unknown, sukut: number, max: number): number {
  const n = Number(Array.isArray(qiymat) ? qiymat[0] : qiymat);
  if (!Number.isInteger(n) || n < 1) return sukut;
  return Math.min(n, max);
}

/**
 * PDF'ni brauzer oynasida ochadi (`inline`). Fayl nomi ASCII: sarlavhada
 * kirill/o'zbek harflari kodlash muammosi tug'dirardi, `ET-NN` esa lotin.
 */
function pdfYubor(res: Response, data: Buffer, fayl: string): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${fayl}"`);
  res.setHeader('Content-Length', String(data.length));
  res.send(data);
}

/**
 * Yuklab olinadigan PDF (`attachment`). `filename` — ASCII zaxira,
 * `filename*` — RFC 5987 (UTF-8, foiz-kodlangan) asosiy nom.
 */
function pdfYuklab(res: Response, data: Buffer, fayl: string): void {
  const ascii = fayl.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fayl)}`);
  res.setHeader('Content-Length', String(data.length));
  res.send(data);
}

/**
 * Elektron talabnoma (`/api/talabnomalar`). Butun router `talabnoma.view`
 * ostida (createApp'da); yuborish/qayta/bekor — alohida `talabnoma.send`:
 * ko'rish bilan mijozga rasmiy xat jo'natish bir xil huquq bo'lmasligi kerak.
 */
export function talabnomaRoutes(container: Container): Router {
  const router = Router();
  // Xizmat so'rov paytida olinadi: boshqa marshrut testlari qisman soxta
  // konteyner bilan ishlaydi.
  const xizmat = () => container.services.talabnomaXizmati;

  // Statik yo'llar `/:id/...` dan OLDIN.
  router.get('/holat', async (_req, res) => {
    res.json({ tayyor: await container.services.talabnomaPdf.tayyormi() });
  });

  // «CRM'dan yangilash»: INN/manzili yo'q nomzodlarni fonda sinxlaydi.
  // POST — boshlaydi yoki ketayotganining holatini qaytaradi (yangisi
  // boshlanmaydi); GET — holat (sahifa ish ketayotganda so'rab turadi).
  router.get('/crm-yangilash', (_req, res) => {
    res.json(container.services.talabnomaCrmYangilash.holat());
  });

  router.post('/crm-yangilash', requirePermission('talabnoma.send'), (_req, res) => {
    res.json(container.services.talabnomaCrmYangilash.boshla());
  });

  router.get('/tayyor', async (_req, res) => {
    res.json(await xizmat().tayyorlar());
  });

  router.get('/tayyor/:contractId/pdf', async (req, res) => {
    const contractId = uuid(req.params.contractId, 'Shartnoma id');
    pdfYubor(res, await xizmat().korinish(contractId), 'Talabnoma ET-__.pdf');
  });

  router.post('/tayyor/:contractId/yubor', requirePermission('talabnoma.send'), async (req, res) => {
    const contractId = uuid(req.params.contractId, 'Shartnoma id');
    res.json(await xizmat().yubor(contractId, currentUser(req).id));
  });

  // «Yuborilgan» filtrlari variantlari (ro'yxat sahifalangan — sahifadan yig'ib bo'lmaydi).
  router.get('/variantlar', async (_req, res) => {
    res.json(await container.repositories.talabnomalar.filtrVariantlari());
  });

  router.get('/', async (req, res) => {
    const holat = req.query.holat;
    if (holat !== undefined && holat !== '' && !HOLATLAR.includes(holat as TalabnomaHolati)) {
      throw new AppError('Holat noto\'g\'ri', 400, 'VALIDATION_ERROR');
    }
    // `holat` — talabnomaning o'z holati; shartnomaning CRM holati alohida nomda.
    const shartnomaHolati = filtr(req.query.shartnomaHolati, 'Shartnoma holati');
    const obyekt = filtr(req.query.obyekt, 'Obyekt');
    // Mijoz bo'yicha («Batafsil» oynasi). SQL parametriga tushadi — UUID shart.
    const mijoz = filtr(req.query.clientId, 'Mijoz id');
    const clientId = mijoz ? uuid(mijoz, 'Mijoz id') : undefined;
    const limit = musbatSon(req.query.limit, SUKUT_LIMIT, MAX_LIMIT);
    const page = musbatSon(req.query.page, 1, Number.MAX_SAFE_INTEGER / MAX_LIMIT);
    res.json(
      await container.repositories.talabnomalar.list({
        ...(holat ? { holat: holat as TalabnomaHolati } : {}),
        ...(shartnomaHolati ? { shartnomaHolati } : {}),
        ...(obyekt ? { obyekt } : {}),
        ...(clientId ? { clientId } : {}),
        limit,
        offset: (page - 1) * limit,
      }),
    );
  });

  router.get('/:id/pdf', async (req, res) => {
    const id = uuid(req.params.id, 'Talabnoma id');
    const talabnoma = await container.repositories.talabnomalar.findById(id);
    pdfYubor(res, await xizmat().pdf(id), `Talabnoma ${talabnomaRaqami(talabnoma?.raqam ?? null)}.pdf`);
  });

  // Chop etish uchun muhrsiz nusxa — faqat `yuborildi` (aks holda 409).
  router.get('/:id/pdf/chop', async (req, res) => {
    const id = uuid(req.params.id, 'Talabnoma id');
    const data = await xizmat().chopEtish(id);
    const talabnoma = await container.repositories.talabnomalar.findById(id);
    pdfYuklab(res, data, `Talabnoma ${talabnomaRaqami(talabnoma?.raqam ?? null)} (chop etish).pdf`);
  });

  router.post('/:id/qayta', requirePermission('talabnoma.send'), async (req, res) => {
    res.json(await xizmat().qaytaUrin(uuid(req.params.id, 'Talabnoma id'), currentUser(req).id));
  });

  router.post('/:id/bekor', requirePermission('talabnoma.send'), async (req, res) => {
    await xizmat().bekorQil(uuid(req.params.id, 'Talabnoma id'), currentUser(req).id);
    res.json({ ok: true });
  });

  return router;
}
