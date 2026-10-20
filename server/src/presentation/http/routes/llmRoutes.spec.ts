import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Container } from '@/composition/container';
import type { LlmModel } from '@/domain/entities/LlmModel';
import type { Permission } from '@/domain/entities/Permission';
import type { User } from '@/domain/entities/User';
import { errorHandler } from '@/presentation/http/middleware/errorHandler';
import { llmRoutes } from '@/presentation/http/routes/llmRoutes';
import { KALIT_YAROQSIZ_XABARI } from '@/shared/providerXatosi';

/**
 * Qo'lda ishga tushiriladi: npm run test:llm-marshruti --workspace=server
 *
 * NEGA BU TEST KERAK: OpenAI kaliti — pul sarflaydigan sir. U API
 * javobiga, audit yozuviga yoki xato matniga tushib qolsa, panelni
 * ochgan har bir operator uni ko'radi.
 */
let failed = 0;
function eq(nom: string, actual: unknown, kutilgan: unknown): void {
  const a = JSON.stringify(actual); const k = JSON.stringify(kutilgan);
  if (a === k) console.log(`✓ ${nom}`);
  else { failed += 1; console.log(`✗ ${nom}: ${a} (kutilgan ${k})`); }
}

const KALIT = 'sk-sinov-maxfiy-kalit';
const model: LlmModel = {
  id: 'm1', provider: 'openai', model: 'sinov-model', label: 'Sinov',
  inputPricePerMtok: 2, outputPricePerMtok: 8, isEnabled: true,
};

let saqlanganKalit: string | null = null;
let kalitniKimYozdi: string | null = null;
const yaratilgan: unknown[] = [];
const auditYozuvlari: unknown[] = [];

const container = {
  repositories: {
    llmModels: {
      list: async () => [model],
      findById: async (id: string) => (id === 'm1' ? model : null),
      create: async (input: unknown) => { yaratilgan.push(input); return model; },
      update: async () => model,
      remove: async () => undefined,
    },
    audit: { record: async (e: unknown) => { auditYozuvlari.push(e); } },
  },
  services: {
    llmKaliti: {
      hasOpenAiKey: async () => saqlanganKalit !== null,
      openAiKey: async () => saqlanganKalit,
      setOpenAiKey: async (k: string | null, kim?: string) => {
        saqlanganKalit = k;
        kalitniKimYozdi = kim ?? null;
      },
      kalitManbasi: async () => (saqlanganKalit !== null ? 'baza' : null),
      baseUrl: async () => 'https://sinov.local/v1',
    },
  },
} as unknown as Container;

/** `telegramUslubRoute.spec.ts` dagi bilan bir xil soxta foydalanuvchi. */
function foydalanuvchi(permissions: Permission[]): User {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: permissions.length ? 'admin@test' : 'operator@test',
    passwordHash: '',
    fullName: 'Test',
    roleId: 'r',
    role: {
      id: 'r', key: 'r', name: 'r', description: null, permissions,
      isSystem: false, createdAt: new Date(), updatedAt: new Date(),
    },
    isActive: true,
    failedLoginAttempts: 0,
    lockedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const app = express();
app.use(express.json());
// `x-rol: admin` — settings.edit bor; aks holda oddiy operator
// (telegramUslubRoute.spec.ts dagi usul). `llmRoutes` `req.user` dan
// o'qiydigan `requirePermission` bilan himoyalangan, shuning uchun
// haqiqiy avtorizatsiyani aylanib o'tib to'g'ridan-to'g'ri o'rnatiladi.
app.use((req, _res, next) => {
  req.user = foydalanuvchi(req.headers['x-rol'] === 'admin' ? ['settings.edit'] : []);
  next();
});
app.use('/api/llm', llmRoutes(container));
app.use(errorHandler);

const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/llm`;
const javoblar: unknown[] = [];

async function so(method: string, path: string, body?: unknown, admin = true) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(admin ? { 'x-rol': 'admin' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  javoblar.push(json);
  return { status: res.status, json: json as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

try {
  eq('kalit yo\'q', (await so('GET', '/key')).json?.hasKey, false);
  eq('kalit saqlanadi', (await so('PUT', '/key', { key: KALIT })).status, 200);
  // `settings.updated_by` — UUID ustuni. Marshrut u yerga e-pochta uzatsa,
  // Postgres «invalid input syntax for type uuid» bilan yiqiladi va panel
  // «Serverda xato yuz berdi» ko'rsatadi (2026-09-30 da prodda shunday bo'ldi).
  eq('kalitni kim yozgani — foydalanuvchi id si', kalitniKimYozdi, '11111111-1111-4111-8111-111111111111');
  eq('e-pochta uzatilmaydi', String(kalitniKimYozdi).includes('@'), false);
  eq('endi kalit bor', (await so('GET', '/key')).json?.hasKey, true);

  // Eng muhim tekshiruv: kalit hech bir javobda uchramaydi.
  eq('kalit javoblarga sizib chiqmadi', JSON.stringify(javoblar).includes(KALIT), false);
  eq('kalit audit yozuviga tushmadi', JSON.stringify(auditYozuvlari).includes(KALIT), false);

  eq('noma\'lum provayder rad etiladi',
    (await so('POST', '/models', { provider: 'gemini', model: 'x', label: 'X' })).status, 422);
  eq('xato so\'rov repozitoriyga yetmadi', yaratilgan.length, 0);

  eq('to\'g\'ri model qo\'shiladi',
    (await so('POST', '/models', { provider: 'openai', model: 'sinov-model', label: 'Sinov', inputPricePerMtok: 2, outputPricePerMtok: 8 })).status, 200);
  eq('repozitoriyga yetdi', yaratilgan.length, 1);

  eq('ro\'yxat qaytadi', (await so('GET', '/models')).json?.items?.length, 1);
  eq('o\'chirish', (await so('DELETE', '/models/m1')).status, 200);

  // `/openai/available` ning `fetch` chaqiruvi shu yerda stub qilinadi —
  // faqat OpenAI manziliga (`https://sinov.local/...`) ketadigan so'rov
  // ushlanadi, `so()` ning o'z test serveriga ketayotgan so'rovi asl
  // `fetch` bilan davom etadi (aks holda test HTTP klienti ham buzilardi).
  const aslFetch = globalThis.fetch;
  function providerniStub(status: number, matn: string): void {
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      if (String(url).startsWith('https://sinov.local')) {
        return { ok: false, status, text: async () => matn } as unknown as Response;
      }
      return aslFetch(url as string, init);
    }) as typeof fetch;
  }

  try {
    // Topilma 1 (Critical): 401 — OpenAI matnida ko'pincha kalitning
    // niqoblangan bo'lagi bo'ladi ("Incorrect API key provided: sk-…").
    // Bu holatda provayder matni UMUMAN ko'rsatilmaydi.
    providerniStub(401, 'Incorrect API key provided: sk-abc123XYZ999. You can find your API key at…');
    const j401 = await so('GET', '/openai/available');
    eq('401 da umumiy xabar', j401.json?.error?.message, KALIT_YAROQSIZ_XABARI);
    eq('401 da provayder matni yo\'q', JSON.stringify(j401.json).includes('Incorrect API key'), false);
    eq('401 da kalit shakli yo\'q', JSON.stringify(j401.json).includes('sk-abc123XYZ999'), false);

    // Boshqa xatoda (masalan 429 limit) matn foydali — faqat `sk-…`
    // ko'rinishidagi ketma-ketlik niqoblanadi, asl satr chiqmaydi.
    providerniStub(429, 'Rate limit hit for key sk-abc123XYZ999qwerty, xarajat oshib ketdi');
    const j429 = await so('GET', '/openai/available');
    eq('429 da niqoblangan', String(j429.json?.error?.message).includes('sk-***'), true);
    eq('429 da asl kalit yo\'q', JSON.stringify(j429.json).includes('sk-abc123XYZ999qwerty'), false);
    eq('429 da qolgan matn saqlanadi', String(j429.json?.error?.message).includes('xarajat oshib ketdi'), true);
  } finally {
    globalThis.fetch = aslFetch;
  }

  eq('ruxsatsiz foydalanuvchi', (await so('GET', '/models', undefined, false)).status, 403);
} finally {
  server.close();
}

console.log(failed ? `${failed} ta xato` : 'Hammasi o\'tdi');
process.exit(failed ? 1 : 0);
