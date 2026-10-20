import { Router } from 'express';
import multer from 'multer';
import type { Container } from '@/composition/container';
import { currentUser, requirePermission } from '@/presentation/http/middleware/auth';
import { NotFoundError, ValidationError } from '@/shared/errors';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xlsm|csv)$/i.test(file.originalname);
    cb(null, ok);
  },
});

export function importRoutes(container: Container): Router {
  const router = Router();
  const { importBatches, audit } = container.repositories;

  router.get('/batches', async (req, res) => {
    const page = await importBatches.list({ limit: Number(req.query.limit ?? 20) });
    res.json(page);
  });

  router.get('/batches/:id', async (req, res) => {
    const batch = await importBatches.findById(String(req.params.id));
    res.json({ batch });
  });

  /**
   * Qaytarish nimaga tegishini oldindan ko'rsatadi — xodim tugmani
   * bosishdan oldin nechta mijoz ro'yxatdan chiqishini bilsin.
   */
  router.get('/batches/:id/undo-preview', requirePermission('import.undo'), async (req, res) => {
    const id = String(req.params.id);
    const batch = await importBatches.findById(id);
    if (!batch) throw new NotFoundError('Import', id);
    res.json({ preview: await importBatches.undoPreview(id) });
  });

  /**
   * Importni qaytarish — noto'g'ri fayl yuklanganda.
   *
   * Faqat SHU import YARATGAN mijozlar ro'yxatlardan chiqadi (yumshoq
   * o'chirish — bazadan yo'qolmaydi). Allaqachon bor edi deb o'tkazilgan
   * mijozlarga tegilmaydi.
   */
  router.post('/batches/:id/undo', requirePermission('import.undo'), async (req, res) => {
    const user = currentUser(req);
    const id = String(req.params.id);

    const batch = await importBatches.findById(id);
    if (!batch) throw new NotFoundError('Import', id);
    if (batch.kind !== 'leads') {
      throw new ValidationError("Faqat mijozlar ro'yxati importini qaytarish mumkin.");
    }

    const summary = await importBatches.undo(id, user.email);

    await audit.record({
      actor: user.email,
      action: 'import.undone',
      entity: 'import_batch',
      entityId: id,
      payload: {
        fayl: batch.filename,
        importVaqti: batch.createdAt,
        olibTashlandi: summary,
      },
    });

    container.events.publish({ type: 'stats.invalidate' });

    res.json({ summary });
  });

  /** Qaytarishni bekor qilish — import olib tashlagan hamma narsa tiklanadi. */
  router.post('/batches/:id/restore', requirePermission('import.undo'), async (req, res) => {
    const user = currentUser(req);
    const id = String(req.params.id);

    const batch = await importBatches.findById(id);
    if (!batch) throw new NotFoundError('Import', id);

    const summary = await importBatches.restore(id);

    await audit.record({
      actor: user.email,
      action: 'import.undo_reverted',
      entity: 'import_batch',
      entityId: id,
      payload: { fayl: batch.filename, tiklandi: summary },
    });

    container.events.publish({ type: 'stats.invalidate' });

    res.json({ summary });
  });

  /** Mijozlar ro'yxati (ism, telefon, kurs) — har yangi raqam manbasi 'raqam' bo'lgan mijoz. */
  router.post('/leads', requirePermission('import.run'), upload.single('file'), async (req, res) => {
    const user = currentUser(req);
    const file = req.file;
    if (!file) throw new ValidationError('Fayl yuborilmadi (.xlsx yoki .csv)');

    const result = await container.useCases.importLeads.execute({
      buffer: file.buffer,
      filename: file.originalname,
      userId: user.id,
    });

    await audit.record({
      actor: user.email,
      action: 'import.leads',
      entity: 'import_batch',
      entityId: result.batch.id,
      payload: { filename: file.originalname, created: result.created, existing: result.existing },
    });

    // Yangi mijozlar darhol akkauntlarga taqsimlanadi — biriktirish
    // suhbat boshlanishidan oldin bo'lishi kerak.
    const assignment = await container.services.assigner
      .assignUnassigned(user.email)
      .catch(() => null);

    container.events.publish({ type: 'stats.invalidate' });
    res.status(201).json({ ...result, assignment });
  });

  return router;
}
