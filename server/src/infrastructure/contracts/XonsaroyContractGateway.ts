import type { ExternalContract, IContractGateway } from '@/domain/services/IContractGateway';
import { mapOrderShow } from '@/infrastructure/contracts/contractMapper';
import { config } from '@/shared/config';
import { childLogger } from '@/shared/logger';

const log = childLogger('contracts-api');

/** Token 30 kun yashaydi; bir kun oldin yangilaymiz. */
const TOKEN_SAFETY_MS = 24 * 60 * 60 * 1000;
const RETRIES = 2;
/** Server "men ishlamayapman" degan javoblar — boshqa manzilni sinashga asos. */
const SHLYUZ_XATOLARI = new Set([502, 503, 504]);

type Metod = 'GET' | 'POST';

/** Asosiy va zaxira manzillar, takrorsiz va oxiridagi `/` siz. */
export function apiManzillari(asosiy: string, zaxira: string): string[] {
  const hammasi = [asosiy, ...zaxira.split(',')]
    .map((m) => m.trim().replace(/\/$/, ''))
    .filter((m) => m !== '');
  return [...new Set(hammasi)];
}

export interface ContractGatewayDeps {
  /** Sinovda almashtiriladi. */
  manzillar?: string[];
  /** Sinovda almashtiriladi. */
  fetchFn?: typeof fetch;
  /** Sinovda almashtiriladi: qayta urinishlar orasidagi kutish. */
  kut?: (ms: number) => Promise<void>;
}

interface LoginResponse {
  access_token?: string;
  expires_in?: number;
}

interface SearchResponse {
  data?: Array<{ id?: number; contract?: string }>;
}

/**
 * app-api.xonsaroy.uz — Xonsaroyning o'z shartnomalar tizimi.
 *
 * Token faqat XOTIRADA saqlanadi: diskka yozilgan token o'g'irlanishi
 * mumkin, qayta login esa arzon (30 kunda bir marta).
 *
 * ZAXIRA MANZIL: bir xil API ikki domenda turadi. Ishlab turgan manzil
 * tarmoq darajasida yiqilsa (DNS, ulanish, timeout, 502-504), keyingisi
 * sinab ko'riladi va ishlagani ESLAB QOLINADI — har so'rovda o'lik
 * manzilga qayta urilmaydi. 401/404/400 kabi javoblar manzilni
 * almashtirmaydi: ular "server ishlayapti, so'rov noto'g'ri" degani.
 */
export class XonsaroyContractGateway implements IContractGateway {
  private token: string | null = null;
  private tokenExpiresAt = 0;
  /** Bir vaqtda kelgan so'rovlar bitta loginni baham ko'radi. */
  private loginInFlight: { manzil: string; promise: Promise<string> } | null = null;
  /** Token qaysi manzildan olingan — boshqasida ishlatilmaydi. */
  private tokenManzili: string | null = null;

  private readonly manzillar: string[];
  /** Oxirgi marta ishlagan manzilning tartib raqami. */
  private faol = 0;
  private readonly fetchFn: typeof fetch;
  private readonly kut: (ms: number) => Promise<void>;

  constructor(deps: ContractGatewayDeps = {}) {
    this.manzillar =
      deps.manzillar ?? apiManzillari(config.CONTRACTS_API_URL, config.CONTRACTS_API_FALLBACK_URLS);
    this.fetchFn = deps.fetchFn ?? fetch;
    this.kut = deps.kut ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  /** Hozir ishlatilayotgan manzil (jurnal va sinov uchun). */
  get faolManzil(): string {
    return this.manzillar[this.faol] ?? '';
  }

  isConfigured(): boolean {
    return Boolean(
      config.CONTRACTS_API_CLIENT_ID &&
        config.CONTRACTS_API_CLIENT_SECRET &&
        config.CONTRACTS_API_USERNAME &&
        config.CONTRACTS_API_PASSWORD,
    );
  }

  async findByContractNo(contractNo: string): Promise<ExternalContract | null> {
    const found = await this.post<SearchResponse>('/api/v4/order/index', {
      page: '1',
      limit: '50',
      search: contractNo,
    });

    // Qidiruv o'xshash raqamlarni ham qaytaradi — AYNAN mos kelganini olamiz.
    // Aks holda boshqa mijozning shartnomasi biznikiga yozilib qolardi.
    const exact = (found?.data ?? []).find((o) => o?.contract === contractNo);
    if (!exact?.id) return null;

    return this.fetchByOrderId(Number(exact.id));
  }

  async fetchByOrderId(orderId: number): Promise<ExternalContract | null> {
    const raw = await this.post<unknown>('/api/v4/order/show', { id: orderId });
    return mapOrderShow(raw);
  }

  // ─── Ichki ──────────────────────────────────────────────────────────────

  private async login(manzil: string): Promise<string> {
    if (this.loginInFlight?.manzil === manzil) return this.loginInFlight.promise;

    const promise = (async () => {
      const res = await this.rawFetch('POST', manzil, '/api/v2/oauth/login', {
        client_id: config.CONTRACTS_API_CLIENT_ID,
        client_secret: config.CONTRACTS_API_CLIENT_SECRET,
        grant_type: 'password',
        username: config.CONTRACTS_API_USERNAME,
        password: config.CONTRACTS_API_PASSWORD,
      });

      if (!res.ok) {
        throw Object.assign(new Error(`Shartnomalar bazasiga kirib bo'lmadi (HTTP ${res.status})`), {
          httpStatus: res.status,
        });
      }

      const body = (await res.json()) as LoginResponse;
      if (!body.access_token) throw new Error("Javobda access_token yo'q");

      this.token = body.access_token;
      this.tokenManzili = manzil;
      this.tokenExpiresAt =
        Date.now() + Math.max(0, (body.expires_in ?? 0) * 1000 - TOKEN_SAFETY_MS);
      log.info({ manzil }, 'Shartnomalar bazasiga kirildi');
      return this.token;
    })();
    const yozuv = { manzil, promise };
    this.loginInFlight = yozuv;

    try {
      return await promise;
    } finally {
      if (this.loginInFlight === yozuv) this.loginInFlight = null;
    }
  }

  private async ensureToken(manzil: string): Promise<string> {
    if (this.token && this.tokenManzili === manzil && Date.now() < this.tokenExpiresAt) return this.token;
    return this.login(manzil);
  }

  private post<T>(path: string, body: unknown): Promise<T | null> {
    return this.sorov<T>('POST', path, body);
  }

  /**
   * GET va POST uchun yagona yo'l: zaxira manzil va token yangilash
   * mantiqi ikki joyda yashamasligi uchun (biri tuzatilib, ikkinchisi
   * eskicha qolishi xavfi).
   */
  private async sorov<T>(method: Metod, path: string, body?: unknown): Promise<T | null> {
    if (!this.isConfigured()) {
      throw new Error("Shartnomalar bazasi sozlanmagan (.env dagi CONTRACTS_API_* to'ldirilmagan)");
    }

    let lastError: unknown;
    const boshlangich = this.faol;

    // Avval oxirgi ishlagan manzil, keyin qolganlari navbat bilan.
    for (let n = 0; n < this.manzillar.length; n += 1) {
      const indeks = (boshlangich + n) % this.manzillar.length;
      const manzil = this.manzillar[indeks]!;
      const natija = await this.urin<T>(method, manzil, path, body);

      if (natija.ok) {
        if (indeks !== this.faol) {
          log.warn(
            { eski: this.manzillar[this.faol], yangi: manzil, sabab: String(lastError) },
            'Shartnomalar bazasi: zaxira manzilga o\'tildi',
          );
          this.faol = indeks;
        }
        return natija.qiymat;
      }

      lastError = natija.xato;
      // Server javob berdi, lekin so'rovni rad etdi — boshqa manzil ham
      // xuddi shuni aytadi, almashtirishdan foyda yo'q.
      if (!natija.manzilAybdor) break;
    }

    // Sir tushmasligi uchun faqat yo'l va xato matni loglanadi — so'rov
    // tanasida parol, javob sarlavhasida esa token bo'ladi.
    log.warn({ path, err: lastError }, "Shartnomalar bazasi so'roviga javob yo'q");
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  /**
   * Bitta manzilga qayta urinishlar bilan so'rov.
   *
   * `manzilAybdor` — xato tarmoq darajasida (DNS, ulanish, timeout) yoki
   * shlyuz javobi (502-504): faqat shunda keyingi manzil sinaladi.
   */
  private async urin<T>(
    method: Metod,
    manzil: string,
    path: string,
    body: unknown,
  ): Promise<{ ok: true; qiymat: T | null } | { ok: false; xato: unknown; manzilAybdor: boolean }> {
    let xato: unknown;
    let manzilAybdor = false;

    for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
      if (attempt > 0) await this.kut(500 * 2 ** (attempt - 1));

      try {
        const token = await this.ensureToken(manzil);
        const res = await this.rawFetch(method, manzil, path, body, token);

        if (res.status === 401) {
          // Token bekor qilingan — keyingi urinishda qaytadan kiramiz.
          this.token = null;
          this.tokenExpiresAt = 0;
          xato = new Error('HTTP 401');
          manzilAybdor = false;
          continue;
        }
        if (res.status === 404) return { ok: true, qiymat: null };
        if (!res.ok) {
          xato = new Error(`HTTP ${res.status}`);
          manzilAybdor = SHLYUZ_XATOLARI.has(res.status);
          continue;
        }

        return { ok: true, qiymat: (await res.json()) as T };
      } catch (err) {
        xato = err;
        // Login HTTP xatosi bilan yiqilsa `httpStatus` bor; yo'q bo'lsa —
        // bu `fetch` ning o'zi otgan tarmoq xatosi.
        const status = (err as { httpStatus?: unknown } | null)?.httpStatus;
        manzilAybdor = typeof status === 'number' ? SHLYUZ_XATOLARI.has(status) : true;
      }
    }

    return { ok: false, xato, manzilAybdor };
  }

  private rawFetch(
    method: Metod,
    manzil: string,
    path: string,
    body: unknown,
    token?: string,
  ): Promise<Response> {
    // GET da tana bo'lmaydi (fetch uni rad etadi) — Content-Type ham kerak emas.
    const tanali = method === 'POST';
    return this.fetchFn(manzil + path, {
      method,
      headers: {
        ...(tanali ? { 'Content-Type': 'application/json' } : {}),
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(tanali ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(config.CONTRACTS_API_TIMEOUT_MS),
    });
  }
}
