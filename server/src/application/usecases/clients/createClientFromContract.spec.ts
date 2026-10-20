import { CreateClientFromContract } from '@/application/usecases/clients/CreateClientFromContract';
import type { ContractSyncService } from '@/application/services/ContractSyncService';
import type { Client } from '@/domain/entities/Client';
import type { Contract } from '@/domain/entities/Contract';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IContractRepository } from '@/domain/repositories/IContractRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { ExternalContract, IContractGateway } from '@/domain/services/IContractGateway';
import type { IClock } from '@/domain/services/support';

/**
 * Qo'lda: npm run test:create-client --workspace=server
 *
 * Tarmoqqa ham, bazaga ham chiqmaydi — hamma port soxta.
 */
const TODAY = '2026-08-08';

const clock = {
  now: () => new Date(`${TODAY}T09:00:00Z`),
  todayIso: () => TODAY,
} as IClock;

const external = (over: Partial<ExternalContract> = {}): ExternalContract =>
  ({
    orderId: 37719,
    contractNo: '5582MSO25F3',
    clientName: 'Testov Testoy',
    phones: ['+998901112233', '+998935556677'],
    objectName: 'MUHABBAT SHAHRI',
    apartment: null,
    status: 'sold',
    virtualStatus: 'sold',
    contractDate: new Date('2025-11-14'),
    months: 49,
    transactionPrice: 833_876_100,
    initialPayment: 100_065_132,
    monthlyPayment: 8_339_000,
    totalPaid: 149_421_132,
    remainingTotal: 684_454_968,
    schedule: [
      // O'tgan sana, to'lanmagan → kechikkan to'lovga tushadi.
      { externalId: 1, type: 'monthly', amount: 8_339_000, amountPaid: 0, datePayment: '2026-07-25', datePaid: null, status: 'waiting' },
      { externalId: 2, type: 'monthly', amount: 8_339_000, amountPaid: 0, datePayment: '2026-09-25', datePaid: null, status: 'waiting' },
    ],
    history: [],
    ...over,
  }) as ExternalContract;

class FakeGateway implements IContractGateway {
  calls: string[] = [];
  constructor(
    private readonly result: ExternalContract | null,
    private readonly throws = false,
  ) {}
  async findByContractNo(contractNo: string): Promise<ExternalContract | null> {
    this.calls.push(contractNo);
    if (this.throws) throw new Error('ETIMEDOUT');
    return this.result;
  }
  async fetchByOrderId(): Promise<ExternalContract | null> {
    return null;
  }
}

class FakeClients {
  created: Array<{ fullName: string; phone: string | null; extraPhones: string[] }> = [];
  constructor(private readonly byPhone: Record<string, Client> = {}) {}
  async findByPhone(phone: string): Promise<Client | null> {
    return this.byPhone[phone] ?? null;
  }
  async findById(id: string): Promise<Client | null> {
    return { id, fullName: 'Mavjud Mijoz' } as Client;
  }
  async create(data: { fullName: string; phone?: string | null; extraPhones?: string[] }): Promise<Client> {
    this.created.push({
      fullName: data.fullName,
      phone: data.phone ?? null,
      extraPhones: data.extraPhones ?? [],
    });
    return { id: 'new-client', fullName: data.fullName } as Client;
  }
}

class FakeContracts {
  upserted: Array<{ clientId: string; contractNo: string }> = [];
  constructor(private readonly existing: Contract | null = null) {}
  async findByContractNo(): Promise<Contract | null> {
    return this.existing;
  }
  async upsert(data: { clientId: string; contractNo: string }): Promise<{ contract: Contract; created: boolean }> {
    this.upserted.push({ clientId: data.clientId, contractNo: data.contractNo });
    return { contract: { id: 'new-contract' } as Contract, created: true };
  }
}

class FakeSync {
  synced: string[] = [];
  async syncOne(contractId: string): Promise<{ outcome: string }> {
    this.synced.push(contractId);
    return { outcome: 'ok' };
  }
}

class FakeAudit {
  actions: string[] = [];
  async record(entry: { action: string }): Promise<void> {
    this.actions.push(entry.action);
  }
}

const build = (opts: {
  gateway: FakeGateway;
  clients?: FakeClients;
  contracts?: FakeContracts;
  sync?: FakeSync;
  audit?: FakeAudit;
  enabled?: boolean;
}) => {
  const clients = opts.clients ?? new FakeClients();
  const contracts = opts.contracts ?? new FakeContracts();
  const sync = opts.sync ?? new FakeSync();
  const audit = opts.audit ?? new FakeAudit();
  const useCase = new CreateClientFromContract(
    clients as unknown as IClientRepository,
    contracts as unknown as IContractRepository,
    opts.gateway,
    sync as unknown as ContractSyncService,
    audit as unknown as IAuditRepository,
    clock,
    opts.enabled ?? true,
  );
  return { useCase, clients, contracts, sync, audit };
};

let failed = 0;
const check = (name: string, ok: boolean, extra = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${extra}`}`);
};

// ── 1. Yangi shartnoma → mijoz va shartnoma yaratiladi ───────────────────
{
  const { useCase, clients, contracts, sync, audit } = build({ gateway: new FakeGateway(external()) });
  const r = await useCase.execute('5582MSO25F3', 'admin@xonsaroy.uz');

  check('natija created', r.outcome === 'created', r.outcome);
  check('mijoz yaratildi', clients.created.length === 1, String(clients.created.length));
  check('asosiy raqam birinchi', clients.created[0]?.phone === '+998901112233', String(clients.created[0]?.phone));
  check('qolgan raqam extraPhones ga', clients.created[0]?.extraPhones.join() === '+998935556677');
  check('shartnoma yaratildi', contracts.upserted.length === 1);
  check('syncOne chaqirildi', sync.synced.join() === 'new-contract', sync.synced.join());
  check('auditga yozildi', audit.actions.join() === 'client.created_manually', audit.actions.join());
}

// ── 2. Shartnoma bazada bor → hech narsa yozilmaydi ──────────────────────
{
  const existing = { id: 'c1', clientId: 'cl-old' } as Contract;
  const gateway = new FakeGateway(external());
  const { useCase, clients, contracts, sync } = build({ gateway, contracts: new FakeContracts(existing) });
  const r = await useCase.execute('5582MSO25F3', 'admin@xonsaroy.uz');

  check('natija already_exists', r.outcome === 'already_exists', r.outcome);
  check('mavjud mijoz qaytdi', r.clientId === 'cl-old', String(r.clientId));
  check('mijoz yaratilmadi', clients.created.length === 0);
  check('shartnoma yozilmadi', contracts.upserted.length === 0);
  check('syncOne chaqirilmadi', sync.synced.length === 0);
  check("tashqi API'ga so'rov ketmadi", gateway.calls.length === 0, gateway.calls.join());
}

// ── 3. Telefon mos keldi → mavjud mijozga biriktiriladi ──────────────────
{
  const known = { id: 'cl-known', fullName: 'Mavjud Mijoz' } as Client;
  const clients = new FakeClients({ '+998935556677': known });
  const { useCase, contracts, sync } = build({ gateway: new FakeGateway(external()), clients });
  const r = await useCase.execute('5582MSO25F3', 'admin@xonsaroy.uz');

  check('natija attached', r.outcome === 'attached', r.outcome);
  check('mavjud mijoz id', r.clientId === 'cl-known', String(r.clientId));
  check('yangi mijoz yaratilmadi', clients.created.length === 0);
  check("shartnoma o'shanga bog'landi", contracts.upserted[0]?.clientId === 'cl-known');
  check('syncOne chaqirildi', sync.synced.length === 1);
}

// ── 4. Tashqi bazada yo'q ────────────────────────────────────────────────
{
  const { useCase, clients, contracts } = build({ gateway: new FakeGateway(null) });
  const r = await useCase.execute('YOQ-RAQAM', 'admin@xonsaroy.uz');

  check('natija not_found', r.outcome === 'not_found', r.outcome);
  check('hech narsa yozilmadi', clients.created.length === 0 && contracts.upserted.length === 0);
}

// ── 5. Integratsiya o'chirilgan ──────────────────────────────────────────
{
  const gateway = new FakeGateway(external());
  const { useCase, clients } = build({ gateway, enabled: false });
  const r = await useCase.execute('5582MSO25F3', 'admin@xonsaroy.uz');

  check('natija disabled', r.outcome === 'disabled', r.outcome);
  check("so'rov yuborilmadi", gateway.calls.length === 0, gateway.calls.join());
  check('mijoz yaratilmadi', clients.created.length === 0);
}

// ── 6. API yiqildi → error, baza toza qoladi ─────────────────────────────
{
  const { useCase, clients, contracts } = build({ gateway: new FakeGateway(null, true) });
  const r = await useCase.execute('5582MSO25F3', 'admin@xonsaroy.uz');

  check('natija error', r.outcome === 'error', r.outcome);
  check('sabab qaytdi', r.error === 'ETIMEDOUT', String(r.error));
  check('hech narsa yozilmadi', clients.created.length === 0 && contracts.upserted.length === 0);
}

// ── 7. preview — kechikkan to'lov hisoblanadi, baza o'zgarmaydi ──────────
{
  const { useCase, clients, contracts, sync } = build({ gateway: new FakeGateway(external()) });
  const r = await useCase.preview('5582MSO25F3');

  check('natija ok', r.outcome === 'ok', r.outcome);
  check('ism keldi', r.contract?.clientName === 'Testov Testoy', String(r.contract?.clientName));
  check('ikkita raqam', r.contract?.phones.length === 2, String(r.contract?.phones.length));
  // 2026-07-25 to'lanmagan, 2026-09-25 hali kelmagan → bitta oylik.
  check("kechikkan to'lov 8 339 000", r.contract?.overdueTotal === 8_339_000, String(r.contract?.overdueTotal));
  check('kechikish 14 kun', r.contract?.daysOverdue === 14, String(r.contract?.daysOverdue));
  check(
    'hech narsa yozilmadi',
    clients.created.length === 0 && contracts.upserted.length === 0 && sync.synced.length === 0,
  );
}

// ── 8. preview — shartnoma bazada bo'lsa ogohlantiradi ───────────────────
{
  const existing = { id: 'c1', clientId: 'cl-old' } as Contract;
  const { useCase } = build({ gateway: new FakeGateway(external()), contracts: new FakeContracts(existing) });
  const r = await useCase.preview('5582MSO25F3');

  check("mavjud mijoz ko'rsatildi", r.existingClient?.id === 'cl-old', String(r.existingClient?.id));
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
