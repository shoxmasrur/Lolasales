import type {
  BulkJobKind,
  BulkJobRow,
  BulkJobStatus,
  IBulkJobRepository,
} from '@/domain/repositories/IBulkJobRepository';
import { ConflictError } from '@/shared/errors';

/** Baza kabi: saqlangan qiymat chaqiruvchining obyektiga bog'lanib qolmasin. */
const nusxa = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * `IBulkJobRepository` ning xotiradagi nusxasi — FAQAT testlar uchun.
 * Bazadagi qoidalarni takrorlaydi: har turda bitta `running`, `save`
 * faqat `running` qatorga yozadi.
 */
export class XotiradagiBulkJobRepo implements IBulkJobRepository {
  readonly rows = new Map<string, BulkJobRow>();
  /** Berilsa, keyingi `save` shu xato bilan BIR MARTA yiqiladi. */
  saveXatosi: Error | null = null;
  /** Keyingi shuncha `finish` chaqiruvi xato bilan yiqiladi. */
  finishXatolari = 0;

  private ozgartir(id: string, fn: (r: BulkJobRow) => BulkJobRow): void {
    const r = this.rows.get(id);
    if (r) this.rows.set(id, fn(r));
  }

  async insert(row: {
    id: string; kind: BulkJobKind; input: unknown; snapshot: unknown; startedDay: string;
  }): Promise<void> {
    if ([...this.rows.values()].some((r) => r.kind === row.kind && r.status === 'running')) {
      throw new ConflictError('Bu turdagi vazifa allaqachon ketyapti');
    }
    this.rows.set(row.id, {
      id: row.id, kind: row.kind, status: 'running',
      input: nusxa(row.input), plan: null, snapshot: nusxa(row.snapshot),
      processedIds: [], cleanStop: false, crashResumes: 0, resumedCount: 0,
      startedDay: row.startedDay,
    });
  }

  async savePlan(id: string, plan: unknown): Promise<void> {
    this.ozgartir(id, (r) => ({ ...r, plan: nusxa(plan) }));
  }

  async save(id: string, snapshot: unknown, processedId: string | null): Promise<void> {
    if (this.saveXatosi) {
      const err = this.saveXatosi;
      this.saveXatosi = null;
      throw err;
    }
    this.ozgartir(id, (r) =>
      r.status !== 'running'
        ? r
        : {
            ...r,
            snapshot: nusxa(snapshot),
            processedIds: processedId === null ? r.processedIds : [...r.processedIds, processedId],
            crashResumes: processedId === null ? r.crashResumes : 0,
          },
    );
  }

  async finish(
    id: string,
    status: BulkJobStatus,
    snapshot: unknown,
    opts: { onlyIfRunning?: boolean } = {},
  ): Promise<void> {
    if (this.finishXatolari > 0) {
      this.finishXatolari -= 1;
      throw new Error('Baza uzildi (sinov)');
    }
    this.ozgartir(id, (r) =>
      opts.onlyIfRunning && r.status !== 'running' ? r : { ...r, status, snapshot: nusxa(snapshot) });
  }

  async findRunning(kind: BulkJobKind): Promise<BulkJobRow | null> {
    const r = [...this.rows.values()].find((x) => x.kind === kind && x.status === 'running');
    return r ? nusxa(r) : null;
  }

  async markCleanStop(): Promise<void> {
    for (const r of this.rows.values()) {
      if (r.status === 'running') this.rows.set(r.id, { ...r, cleanStop: true });
    }
  }

  async markResumed(id: string, crashed: boolean): Promise<void> {
    this.ozgartir(id, (r) => ({
      ...r,
      cleanStop: false,
      resumedCount: r.resumedCount + 1,
      crashResumes: r.crashResumes + (crashed ? 1 : 0),
    }));
  }

  async deleteFinishedOlderThan(): Promise<number> {
    return 0;
  }
}
