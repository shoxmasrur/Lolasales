import { BAND_QILUVCHI_HOLATLAR, type Talabnoma, type TalabnomaNomzodi } from '@/domain/entities/Talabnoma';
import { holatKorinishi, holatVariantlari, type HolatKorinishi } from '@/domain/entities/shartnomaHolati';
import type {
  ITalabnomaRepository,
  TalabnomaFiltrVariantlari,
  TalabnomaQatori,
  TalabnomaQuery,
  YangiTalabnoma,
  YuborildiMalumoti,
} from '@/domain/repositories/ITalabnomaRepository';
import type { Page } from '@/domain/repositories/types';
import { ConflictError, NotFoundError } from '@/shared/errors';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type Qator = Mutable<Talabnoma>;

/** Baza kabi: qaytarilgan obyekt ichki holatga bog'lanib qolmasin. */
const nusxa = (q: Qator): Talabnoma => ({ ...q, rekvizit: { ...q.rekvizit } });

/** `PgTalabnomaRepository` dagi 10 daqiqalik "osilib qolgan yuborish" chegarasi. */
const OSILGAN_MS = 10 * 60 * 1000;

/**
 * `ITalabnomaRepository` ning xotiradagi nusxasi — FAQAT testlar uchun.
 * Bazadagi qoidalarni takrorlaydi: shartnomaga bitta band talabnoma
 * (`talabnomalar_bir_marta`), raqam bir marta (`COALESCE`), holat o'tishlari.
 *
 * `nomzodlar` SQL filtrini takrorlamaydi: test `nomzodlarRoyxati` ni
 * o'zi beradi (SQL'dan o'tgan qatorlar kabi), repo faqat band
 * shartnomalarni chiqaradi.
 */
export class XotiradagiTalabnomaRepo implements ITalabnomaRepository {
  readonly rows = new Map<string, Qator>();
  nomzodlarRoyxati: TalabnomaNomzodi[] = [];
  /**
   * `telegram_status = 'name_mismatch'` mijozlar: SQL kabi faqat RO'YXATDAN
   * chiqadi, bitta shartnomani tekshiruvchi `nomzod()` ularni qaytaradi.
   */
  readonly ismMosEmas = new Set<string>();
  /** `users` jadvali o'rnida: id → full_name (list'dagi `sentByName` uchun). */
  readonly foydalanuvchilar = new Map<string, string>();
  private raqamSeq = 0;
  private idSeq = 0;

  constructor(private readonly hozir: () => Date = () => new Date()) {}

  private bandmi(contractId: string, istisno?: string): boolean {
    return [...this.rows.values()].some(
      (r) => r.contractId === contractId && r.id !== istisno && BAND_QILUVCHI_HOLATLAR.includes(r.holat),
    );
  }

  /** `contracts`/`clients` JOIN o'rnida: shartnomaning HOZIRGI ma'lumoti. */
  private meta(contractId: string): {
    contractNo: string; fullName: string; objectName: string | null; shartnomaHolati: HolatKorinishi | null;
  } {
    const n = this.nomzodlarRoyxati.find((x) => x.contractId === contractId);
    return {
      contractNo: n?.contractNo ?? '',
      fullName: n?.fullName ?? '',
      objectName: n?.objectName?.trim() || null,
      shartnomaHolati: holatKorinishi(n?.virtualStatus),
    };
  }

  private yuborilmoqdadan(id: string, fn: (r: Qator) => void): void {
    const r = this.rows.get(id);
    if (!r || r.holat !== 'yuborilmoqda') {
      throw new ConflictError('Talabnoma yuborilmoqda holatida emas', 'TALABNOMA_HOLATI');
    }
    fn(r);
    r.updatedAt = this.hozir();
  }

  async nomzodlar(_todayIso: string): Promise<TalabnomaNomzodi[]> {
    return this.nomzodlarRoyxati
      .filter((n) => !this.bandmi(n.contractId) && !this.ismMosEmas.has(n.clientId))
      .map((n) => ({ ...n }));
  }

  async nomzod(contractId: string, _todayIso: string, istisnoTalabnomaId?: string): Promise<TalabnomaNomzodi | null> {
    const n = this.nomzodlarRoyxati.find((x) => x.contractId === contractId);
    return n && !this.bandmi(contractId, istisnoTalabnomaId) ? { ...n } : null;
  }

  async yarat(t: YangiTalabnoma): Promise<Talabnoma> {
    if (this.bandmi(t.contractId)) {
      throw new ConflictError('Bu shartnomaga talabnoma allaqachon yuborilgan', 'TALABNOMA_BOR');
    }
    this.idSeq += 1;
    const now = this.hozir();
    const q: Qator = {
      id: `t${this.idSeq}`, contractId: t.contractId, clientId: t.clientId, raqam: null,
      holat: 'yuborilmoqda', summa: t.summa, rekvizit: { ...t.rekvizit }, pdfPath: null,
      messageId: null, kuchgaKirish: null, muddatSanasi: null, sentAt: null, sentBy: null,
      xatoSababi: null, createdAt: now, updatedAt: now,
    };
    this.rows.set(q.id, q);
    return nusxa(q);
  }

  async raqamBer(id: string): Promise<number> {
    const r = this.rows.get(id);
    if (!r) throw new NotFoundError('Talabnoma', id);
    if (r.raqam === null) {
      this.raqamSeq += 1;
      r.raqam = this.raqamSeq;
    }
    return r.raqam;
  }

  async yuborildi(id: string, p: YuborildiMalumoti): Promise<void> {
    this.yuborilmoqdadan(id, (r) => {
      Object.assign(r, { ...p, holat: 'yuborildi', xatoSababi: null });
    });
  }

  async xato(id: string, sabab: string): Promise<void> {
    this.yuborilmoqdadan(id, (r) => {
      r.holat = 'xato';
      r.xatoSababi = sabab;
    });
  }

  async qaytaUrinishgaOl(id: string): Promise<Talabnoma | null> {
    const r = this.rows.get(id);
    if (!r) return null;
    const now = this.hozir();
    const osilgan = r.holat === 'yuborilmoqda' && now.getTime() - r.updatedAt.getTime() > OSILGAN_MS;
    if (r.holat !== 'xato' && !osilgan) return null;
    r.holat = 'yuborilmoqda';
    r.xatoSababi = null;
    r.updatedAt = now;
    return nusxa(r);
  }

  async bekorQil(id: string): Promise<boolean> {
    const r = this.rows.get(id);
    if (!r || r.holat !== 'xato') return false;
    r.holat = 'bekor';
    r.updatedAt = this.hozir();
    return true;
  }

  async findById(id: string): Promise<Talabnoma | null> {
    const r = this.rows.get(id);
    return r ? nusxa(r) : null;
  }

  async bandTalabnoma(contractId: string): Promise<Talabnoma | null> {
    const r = [...this.rows.values()].find((q) => q.contractId === contractId && BAND_QILUVCHI_HOLATLAR.includes(q.holat));
    return r ? nusxa(r) : null;
  }

  async list(q: TalabnomaQuery): Promise<Page<TalabnomaQatori>> {
    const limit = Math.min(q.limit ?? 50, 200);
    const offset = q.offset ?? 0;
    const hammasi = [...this.rows.values()]
      .filter((r) => !q.holat || r.holat === q.holat)
      .filter((r) => !q.clientId || r.clientId === q.clientId)
      .filter((r) => {
        const m = this.meta(r.contractId);
        return (!q.shartnomaHolati || m.shartnomaHolati?.kalit === q.shartnomaHolati)
          && (!q.obyekt || m.objectName === q.obyekt);
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return {
      items: hammasi.slice(offset, offset + limit).map((r) => ({
        ...nusxa(r),
        ...this.meta(r.contractId),
        sentByName: r.sentBy ? (this.foydalanuvchilar.get(r.sentBy) ?? null) : null,
      })),
      total: hammasi.length,
      limit,
      offset,
    };
  }

  async filtrVariantlari(): Promise<TalabnomaFiltrVariantlari> {
    const metalar = [...this.rows.values()].map((r) => this.meta(r.contractId));
    return {
      holatlar: holatVariantlari(metalar.map((m) => m.shartnomaHolati?.kalit)),
      obyektlar: [...new Set(metalar.map((m) => m.objectName).filter((x): x is string => x !== null))]
        .sort((a, b) => a.localeCompare(b)),
    };
  }

  async faolMuddat(clientId: string, todayIso: string): Promise<string | null> {
    const sanalar = [...this.rows.values()]
      .filter((r) => r.clientId === clientId && r.holat === 'yuborildi' && r.muddatSanasi !== null && r.muddatSanasi >= todayIso)
      .map((r) => r.muddatSanasi!)
      .sort();
    return sanalar.at(-1) ?? null;
  }

  async yuborilganlar(clientId: string): Promise<Array<Talabnoma & { contractNo: string }>> {
    return [...this.rows.values()]
      .filter((r) => r.clientId === clientId && r.holat === 'yuborildi')
      .sort((a, b) => (b.sentAt?.getTime() ?? 0) - (a.sentAt?.getTime() ?? 0))
      .map((r) => ({ ...nusxa(r), contractNo: this.meta(r.contractId).contractNo }));
  }
}
