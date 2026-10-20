import { Router } from 'express';
import { z } from 'zod';
import type { Container } from '@/composition/container';
import { LLM_PROVIDERS } from '@/domain/entities/LlmModel';
import type { AgentTurnInput } from '@/domain/services/IAgentEngine';
import { OpenAiAgentEngine } from '@/infrastructure/ai/OpenAiAgentEngine';
import { currentUser, requirePermission } from '@/presentation/http/middleware/auth';
import { parseBody, parseParams } from '@/presentation/http/middleware/validate';
import { AppError, NotFoundError, ValidationError } from '@/shared/errors';
import { childLogger } from '@/shared/logger';
import { providerXatosiniTozala } from '@/shared/providerXatosi';

const log = childLogger('llm-routes');

const idSchema = z.object({ id: z.string() });

// Model ro'yxatini olish — javob juda sodda, 30 soniya kutish
// (`OpenAiAgentEngine` dagi 120 soniyadan qisqa) yetarli, aks holda
// undici standarti (~300 soniya) bo'yicha so'rov shuncha vaqt osilib
// qolishi mumkin.
const OPENAI_RUYXATI_MUDDATI_MS = 30_000;

// `null` — kalitni o'chirish. `min(10)` — kod xato terib qo'yilgan bo'sh
// yoki juda qisqa qatorni "muvaffaqiyatli saqlandi" deb ko'rsatmasin.
const keySchema = z.object({ key: z.string().min(10).nullable() });

// Narx maydoni PANELDA kiritiladi (`LlmModel` izohiga qarang) — shu
// sabab bu yerda ham ixtiyoriy va `null` bo'lishi mumkin ("hali
// kiritilmagan").
const narxField = z.number().nonnegative().nullable().optional();

const createModelSchema = z.object({
  // Faqat `LLM_PROVIDERS` ('openai') — Claude jadvaldan ATAYLAB
  // tanlanmaydi (`LlmModel.ts` izohi). Boshqa qiymat shu yerda 422 bilan
  // rad etiladi, bazaga umuman yetmaydi.
  provider: z.enum(LLM_PROVIDERS),
  model: z.string().min(1, 'Model nomi kerak'),
  label: z.string().min(1, 'Nom kerak'),
  inputPricePerMtok: narxField,
  outputPricePerMtok: narxField,
});

const patchModelSchema = z.object({
  label: z.string().min(1).optional(),
  inputPricePerMtok: narxField,
  outputPricePerMtok: narxField,
  isEnabled: z.boolean().optional(),
});

/**
 * OpenAI kaliti va model jadvali — Sozlamalar sahifasining "Til modeli"
 * bo'limi.
 *
 * Hamma yo'l `settings.edit` talab qiladi: bu yerdagi amallar agentning
 * qaysi dvigatel bilan, qancha xarajatga ishlashini belgilaydi — proksi
 * va uslub bilan bir darajadagi huquq.
 *
 * ENG MUHIM QOIDA: OpenAI kaliti hech qanday javobga, audit yozuviga
 * yoki xato matniga TUSHMAYDI. `GET /key` faqat bor/yo'qligini aytadi,
 * `PUT /key` audit yozuvida ham faqat shu bayroqni saqlaydi.
 */
export function llmRoutes(container: Container): Router {
  const router = Router();
  router.use(requirePermission('settings.edit'));

  const { llmModels, audit } = container.repositories;
  const { llmKaliti } = container.services;

  // `manba` — panel «O'chirish» tugmasi va uning tasdiq matnini to'g'ri
  // ko'rsatishi uchun kerak: `.env` dagi kalitni bazadan o'chirish
  // ta'sir qilmaydi (`LlmKaliti.setOpenAiKey` faqat bazani tozalaydi),
  // ya'ni bunday holatda «o'chirilsa OpenAI ishlamay qoladi» degan
  // va'da yolg'on bo'lardi.
  router.get('/key', async (_req, res) => {
    res.json({ hasKey: await llmKaliti.hasOpenAiKey(), manba: await llmKaliti.kalitManbasi() });
  });

  router.put('/key', async (req, res) => {
    const user = currentUser(req);
    const { key } = parseBody(keySchema, req);
    // `user.id`, e-pochta EMAS: qiymat `settings.updated_by` ga tushadi,
    // u esa UUID ustuni. E-pochta uzatilsa Postgres so'rovni rad etadi va
    // panel «Serverda xato yuz berdi» ko'rsatadi. Audit yozuvi esa aksincha
    // e-pochtani oladi (`audit_log.actor` — matn).
    await llmKaliti.setOpenAiKey(key, user.id);

    // `key !== null` EMAS — bazadagi qator o'chirilgandan keyin ham
    // `.env` dagi kalit qolgan bo'lishi mumkin, javob haqiqiy holatni
    // aytishi kerak (`GET /key` bilan bir xil mantiq).
    const hasKey = await llmKaliti.hasOpenAiKey();
    const manba = await llmKaliti.kalitManbasi();
    await audit.record({
      actor: user.email,
      action: 'llm.key_changed',
      entity: 'llm_key',
      entityId: 'openai',
      // Kalitning O'ZI bu yerga hech qachon yozilmaydi — faqat bor/yo'q
      // belgisi.
      payload: { hasKey },
    });

    res.json({ hasKey, manba });
  });

  router.get('/models', async (_req, res) => {
    res.json({ items: await llmModels.list() });
  });

  router.post('/models', async (req, res) => {
    const body = parseBody(createModelSchema, req);
    const model = await llmModels.create(body);
    res.json(model);
  });

  router.patch('/models/:id', async (req, res) => {
    const { id } = parseParams(idSchema, req);
    const body = parseBody(patchModelSchema, req);
    const model = await llmModels.update(id, body);
    res.json(model);
  });

  router.delete('/models/:id', async (req, res) => {
    const { id } = parseParams(idSchema, req);
    await llmModels.remove(id);
    res.json({ ok: true });
  });

  /**
   * OpenAI'dagi mavjud modellar ro'yxati — panelda "model tanlash"
   * qulaylik uchun, operator model nomini qo'lda terib xato qilmasin.
   *
   * Kalit tarmoqqa HECH QACHON javob bilan qaytmaydi: faqat `${baseUrl}/models`
   * ga sarlavhada ketadi.
   */
  router.get('/openai/available', async (_req, res) => {
    const apiKey = await llmKaliti.openAiKey();
    if (!apiKey) throw new ValidationError('Avval kalitni kiriting');

    const baseUrl = await llmKaliti.baseUrl();
    const response = await fetch(`${baseUrl}/models`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(OPENAI_RUYXATI_MUDDATI_MS),
    });

    if (!response.ok) {
      // DIQQAT: OpenAI'ning xato matni ko'pincha foydali (masalan model
      // nomi xato bo'lganda sabab aynan shu matndan ko'rinadi), LEKIN
      // ayrim xatolar (masalan «Incorrect API key provided: sk-…»)
      // kiritilgan kalitning bir qismini o'z ichiga oladi. Xom matnni
      // to'g'ridan-to'g'ri chiqarish — kalitning bir bo'lagini panelga
      // sizdirish xavfi (`providerXatosiniTozala` izohiga qarang).
      const body = await response.text().catch(() => '');
      throw new AppError(
        providerXatosiniTozala(`OpenAI javob bermadi (${response.status}): ${body.slice(0, 500)}`),
        502,
        'OPENAI_FAILED',
      );
    }

    const data = (await response.json()) as { data?: Array<{ id: string }> };
    res.json({ items: (data.data ?? []).map((m) => ({ id: m.id })) });
  });

  /**
   * Modelni SAQLASHDAN OLDIN sinash: kalit va model nomi haqiqatan
   * ishlaydimi. `AgentEngineFactory` orqali EMAS — u akkauntga
   * biriktirilgan holatni tekshiradi, bu yerda esa hali hech qayerga
   * biriktirilmagan qator sinaladi.
   *
   * Haqiqiy tarmoqqa chiqadi — bu ataylab (marshrut izohiga qarang).
   * Xato bo'lsa 500 bilan yiqilmaydi: natija har doim `{ ok, message }`,
   * chunki maqsad — operatorga xato SABABINI ko'rsatish, chaqiruvni
   * yiqitish emas.
   */
  router.post('/models/:id/probe', async (req, res) => {
    const { id } = parseParams(idSchema, req);
    const model = await llmModels.findById(id);
    if (!model) throw new NotFoundError('LLM model', id);

    const apiKey = await llmKaliti.openAiKey();
    if (!apiKey) throw new ValidationError('Avval kalitni kiriting');

    const engine = new OpenAiAgentEngine({
      apiKey,
      model: model.model,
      baseUrl: await llmKaliti.baseUrl(),
    });

    try {
      const out = await engine.respond(sinovSorovi());
      res.json({ ok: true, message: out.reply ?? 'Model javob berdi' });
    } catch (err) {
      // Kalit xato matnida BO'LMASLIGI kerak. `OpenAiAgentEngine.run()`
      // xato matnini MANBADA (`AppError` qurilayotganda) allaqachon
      // `providerXatosiniTozala` bilan tozalab uzatadi — bu yerdagi
      // qayta chaqiruv shunchaki ikkinchi qatlam (masalan `err` boshqa,
      // kutilmagan manbadan kelsa ham kalit bo'lagi chiqib qolmasin).
      const xom = err instanceof Error ? err.message : 'Nomaʼlum xato';
      const message = providerXatosiniTozala(xom);
      log.warn({ llmModelId: id, model: model.model }, 'Probe muvaffaqiyatsiz');
      res.json({ ok: false, message });
    }
  });

  return router;
}

/**
 * Probe uchun eng sodda sinov so'rovi — haqiqiy suhbat, mijoz yoki
 * xarid yo'q, faqat model va kalitning o'zi ishlayotganini bilish
 * kerak. Shakli `OpenAiAgentEngine`ning `openAiAgentEngine.spec.ts`
 * dagi sinov kirishi bilan bir xil — `AgentTurnInput`ning to'liq shakli
 * SHART, boshqacha yo'l yo'q.
 */
function sinovSorovi(): AgentTurnInput {
  return {
    conversationId: 'probe',
    clientId: 'probe',
    knowledge: { rules: '', lessons: '', clientMemory: '', personaName: 'Agent' },
    context: {
      clientName: 'Sinov',
      clientFirstName: 'Sinov',
      source: 'reklama',
      sourceGroup: null,
      sourceComment: null,
      purchase: null,
      coursesOnSale: [],
      nextCourse: null,
      boughtCourses: [],
    },
    history: [],
    incoming: 'Salom',
    sessionId: null,
    receiptPending: false,
  };
}
