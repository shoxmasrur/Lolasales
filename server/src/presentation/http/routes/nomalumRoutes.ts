import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '@/composition/container';
import type { Conversation } from '@/domain/entities/Conversation';
import { NOMALUM_SABAB_OPERATOR, type NomalumSuhbat } from '@/domain/entities/NomalumSuhbat';
import { shartnomaRaqaminiTozala } from '@/domain/services/shartnomaRaqami';
import { currentUser, requirePermission } from '@/presentation/http/middleware/auth';
import { parseBody } from '@/presentation/http/middleware/validate';
import { yopiqCheklanganga } from '@/presentation/http/middleware/qamrov';
import { AppError, ConflictError, NotFoundError } from '@/shared/errors';

const boglashSchema = z.object({
  shartnomaRaqami: z.string().trim().min(3, 'Shartnoma raqami juda qisqa').max(40, 'Shartnoma raqami juda uzun'),
});

/**
 * Noma'lum mijoz suhbati bo'yicha operator amallari (`/api/conversations` ostida).
 *
 * Ruxsat — "Qayta urinish"/"Topshiriq" bilan bir xil (`conversations.agent_toggle`):
 * har biri suhbatni kim yuritishini (noma'lum agent, asosiy agent, operator) o'zgartiradi.
 */
export function nomalumRoutes(container: Container): Router {
  const router = Router();
  // Servislar so'rov paytida olinadi (yaratilishda emas): marshrut ulanishi
  // konteyner to'liqligiga bog'liq bo'lmasin — boshqa marshrut testlari
  // qisman soxta konteyner bilan ishlaydi.
  const { conversations, nomalumSuhbatlar, audit, clients } = container.repositories;

  // Obyekt cheklovi: noma'lum mijozlar hech qaysi obyektga tegishli emas —
  // cheklangan foydalanuvchiga bu amallar butunlay yopiq (403 OBYEKT_CHEKLOVI).
  router.use('/:id/nomalum', yopiqCheklanganga());

  /**
   * Amal faqat TIRIK suhbatda (`findById` o'chirilgan/birlashtirib yopilganini
   * qaytarmaydi) va suhbat egasi HOZIR ham noma'lum mijoz bo'lsa. Holat qatori
   * bog'langandan keyin ham qoladi — faqat unga tayansak, haqiqiy mijozning
   * suhbatida "mijoz emas" (agentni o'chirish) yoki qayta bog'lash bosilardi.
   */
  async function yukla(id: string): Promise<{ conversation: Conversation; holat: NomalumSuhbat }> {
    const conversation = await conversations.findById(id);
    if (!conversation) throw new NotFoundError('Suhbat', id);
    const holat = await nomalumSuhbatlar.find(id);
    if (!holat) throw new ConflictError('Suhbat noma\'lum mijozniki emas');
    const egasi = await clients.findById(conversation.clientId);
    if (!egasi?.nomalum) throw new ConflictError('Suhbat noma\'lum mijozniki emas');
    return { conversation, holat };
  }

  /**
   * Agent topgan mijozni operator tasdiqlashi/rad etishi mumkin bo'lgan holatlar.
   * `hujjat_kutilmoqda` ham: operator odamni boshqa yo'l bilan (qo'ng'iroq,
   * ofis) tanigan bo'lsa, rasmni kutmasdan qaror qiladi.
   */
  function tasdiqlanadimi(holat: NomalumSuhbat): boolean {
    return holat.holat === 'tasdiq_kutilmoqda' || holat.holat === 'hujjat_kutilmoqda';
  }

  /** Haqiqiy mijozning SHU akkauntda tirik suhbati bo'lsa — birlashtiriladi (aks holda UNIQUE ga uriladi). */
  async function birlashtirmi(clientId: string, conversation: Conversation): Promise<boolean> {
    const bor = await conversations.findLiveByClientAndAccount(clientId, conversation.telegramAccountId);
    return Boolean(bor && bor.id !== conversation.id);
  }

  async function boglaVaQaytar(conversation: Conversation, clientId: string, actor: string) {
    const birlashtir = await birlashtirmi(clientId, conversation);
    // Ketayotgan noma'lum agent navbati bog'langandan keyin begona matn
    // yubormasin. Asosiy agent ham uziladi — u bu suhbatda baribir ishlamaydi.
    container.services.javobYonaltiruvchi.abort(conversation.id);
    // Audit va `conversation.updated` — use case ichida (actor = operator emaili).
    return container.useCases.mijozgaBoglash.execute({ conversationId: conversation.id, clientId, actor, birlashtir });
  }

  /**
   * Operator shartnoma raqamini o'zi kiritadi. Telefon solishtirilmaydi —
   * operator odamni tanib bog'layapti, tekshiruv uning mas'uliyatida.
   */
  router.post('/:id/nomalum/boglash', requirePermission('conversations.agent_toggle'), async (req, res) => {
    const user = currentUser(req);
    const { shartnomaRaqami } = parseBody(boglashSchema, req);
    const { conversation, holat } = await yukla(String(req.params.id));
    if (holat.holat === 'boglandi') throw new ConflictError('Suhbat allaqachon mijozga bog\'langan');

    const toza = shartnomaRaqaminiTozala(shartnomaRaqami);
    if (!toza) throw new NotFoundError('Shartnoma', shartnomaRaqami);
    // Agent bilan bir xil qidiruv (baza, keyin CRM) — CRM'dan yaratilgan
    // mijozning auditida operator emaili turadi.
    const topilgan = await container.services.shartnomaBoglovchi.topVaYarat(toza, user.email);
    if (topilgan.kind === 'topilmadi') throw new NotFoundError('Shartnoma', toza);
    if (topilgan.kind === 'crm_xato') {
      throw new AppError(`Shartnomalar bazasi javob bermadi (${topilgan.sabab})`, 502, 'CRM_XATO');
    }

    res.json(await boglaVaQaytar(conversation, topilgan.clientId, user.email));
  });

  /** Agent topgan (telefon mos kelmagan) mijozni operator tasdiqlaydi (hujjat kelgan yoki hali kutilayotgan). */
  router.post('/:id/nomalum/tasdiqlash', requirePermission('conversations.agent_toggle'), async (req, res) => {
    const user = currentUser(req);
    const { conversation, holat } = await yukla(String(req.params.id));
    if (!tasdiqlanadimi(holat) || !holat.topilganClientId) {
      throw new ConflictError('Tasdiqlanadigan bog\'lash yo\'q');
    }
    res.json(await boglaVaQaytar(conversation, holat.topilganClientId, user.email));
  });

  /** Agent topgan mijoz noto'g'ri — operator suhbatni o'zi yuritadi. */
  router.post('/:id/nomalum/rad-etish', requirePermission('conversations.agent_toggle'), async (req, res) => {
    const user = currentUser(req);
    const { conversation, holat } = await yukla(String(req.params.id));
    if (!tasdiqlanadimi(holat)) throw new ConflictError('Rad etiladigan bog\'lash yo\'q');

    const yangi = await nomalumSuhbatlar.update(conversation.id, { holat: 'operatorda', topilganClientId: null });
    // `hujjat_kutilmoqda` da operator belgisi hali qo'yilmagan: rad etilgan
    // odam `operatorda` holatida agentsiz qoladi — suhbat operator navbatiga chiqsin.
    if (!conversation.needsHuman) {
      await conversations.update(conversation.id, { needsHuman: true, humanReason: NOMALUM_SABAB_OPERATOR });
    }
    await audit.record({
      actor: user.email,
      action: 'conversation.nomalum_rad_etildi',
      entity: 'conversation',
      entityId: conversation.id,
      payload: { radEtilganClientId: holat.topilganClientId, shartnomaRaqami: holat.shartnomaRaqami },
    });
    container.events.publish({ type: 'conversation.updated', conversationId: conversation.id });
    res.json({ nomalum: yangi });
  });

  /**
   * Yozuvchi mijoz emas (reklama, adashgan odam). Agent o'chiriladi va
   * suhbat operator navbatidan chiqadi — unga endi hech kim javob bermaydi.
   */
  router.post('/:id/nomalum/mijoz-emas', requirePermission('conversations.agent_toggle'), async (req, res) => {
    const user = currentUser(req);
    const { conversation, holat } = await yukla(String(req.params.id));
    if (holat.holat === 'boglandi') throw new ConflictError('Suhbat allaqachon mijozga bog\'langan');

    const yangi = await nomalumSuhbatlar.update(conversation.id, { holat: 'mijoz_emas' });
    await conversations.update(conversation.id, { agentEnabled: false, needsHuman: false, humanReason: null });
    // Uzish bazaga YOZGANDAN KEYIN (PATCH bilan bir xil sabab): oraliqda
    // boshlangan navbat yangi holatni ko'rib o'zi to'xtaydi.
    container.services.javobYonaltiruvchi.abort(conversation.id);
    await audit.record({
      actor: user.email,
      action: 'conversation.nomalum_mijoz_emas',
      entity: 'conversation',
      entityId: conversation.id,
      payload: { oldingiHolat: holat.holat },
    });
    container.events.publish({ type: 'conversation.updated', conversationId: conversation.id });
    res.json({ nomalum: yangi });
  });

  return router;
}
