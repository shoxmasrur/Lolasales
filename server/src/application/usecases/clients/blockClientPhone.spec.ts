import { BlockClientPhoneUseCase } from '@/application/usecases/clients/BlockClientPhone';
import type { IClientRepository } from '@/domain/repositories/IClientRepository';
import type { IClientPhoneBlockRepository } from '@/domain/repositories/IClientPhoneBlockRepository';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IPaymentCheckRepository } from '@/domain/repositories/IPaymentCheckRepository';
import type { IAuditRepository, AuditEntry } from '@/domain/repositories/ISupportRepositories';

/**
 * Qo'lda ishga tushiriladi: npm run test:block-phone --workspace=server
 *
 * Bazaga chiqmaydi — hamma port soxta.
 *
 * Bu use case begona odamga bergan "boshqa yozilmaydi" degan va'dani
 * bajaradi. Uning eng xavfli xatosi — raqamni o'chirib, KESHDAGI Telegram
 * shaxsini qoldirib ketish: u aynan begona odamning hisobiga ishora
 * qiladi va xabar raqamsiz ham o'shanga ketaverardi.
 */
const ESKI = '+998901112233';
const YANGI = '+998934445566';

class FakeClients {
  updated: Record<string, unknown> | null = null;
  identityCleared = false;

  constructor(
    private readonly phone: string | null = ESKI,
    private readonly extra: string[] = [YANGI],
  ) {}

  async findById() {
    return { id: 'cl1', fullName: 'Testov Testoy', phone: this.phone, extraPhones: this.extra };
  }
  async update(_id: string, patch: Record<string, unknown>) {
    this.updated = patch;
    return {};
  }
  async clearTelegramIdentity() {
    this.identityCleared = true;
  }
}

class FakeBlocks {
  blocked: Array<Record<string, unknown>> = [];
  async block(entry: Record<string, unknown>) {
    this.blocked.push(entry);
  }
  async listForClient(): Promise<string[]> {
    return this.blocked.map((b) => String(b.phone));
  }
}

class FakeConversations {
  patch: Record<string, unknown> | null = null;
  constructor(private readonly conversation: { id: string } | null = { id: 'cv1' }) {}
  async findByClientId() {
    return this.conversation;
  }
  async update(_id: string, patch: Record<string, unknown>) {
    this.patch = patch;
    return {};
  }
}

class FakeChecks {
  cancelled: string[] = [];
  async cancel(conversationId: string) {
    this.cancelled.push(conversationId);
  }
}

class FakeAudit {
  entries: AuditEntry[] = [];
  async record(entry: AuditEntry) {
    this.entries.push(entry);
  }
}

const build = (
  clients = new FakeClients(),
  conversations = new FakeConversations(),
): {
  uc: BlockClientPhoneUseCase;
  clients: FakeClients;
  blocks: FakeBlocks;
  conversations: FakeConversations;
  audit: FakeAudit;
  checks: FakeChecks;
} => {
  const blocks = new FakeBlocks();
  const audit = new FakeAudit();
  const checks = new FakeChecks();
  const uc = new BlockClientPhoneUseCase(
    clients as unknown as IClientRepository,
    blocks as unknown as IClientPhoneBlockRepository,
    conversations as unknown as IConversationRepository,
    audit as unknown as IAuditRepository,
    checks as unknown as IPaymentCheckRepository,
  );
  return { uc, clients, blocks, conversations, audit, checks };
};

let failed = 0;
const check = (name: string, ok: boolean, hint = ''): void => {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${hint}`}`);
};

// ── 1. Raqam uziladi, keyingisi asosiy bo'ladi ───────────────────────────
{
  const { uc, clients } = build();
  await uc.execute({ clientId: 'cl1', phone: ESKI, reason: 'begona odam', actor: 'u1' });

  const patch = clients.updated as { phone?: string; extraPhones?: string[] } | null;
  check('asosiy raqam almashdi', patch?.phone === YANGI, String(patch?.phone));
  check('uzilgan raqam qolmadi', !JSON.stringify(patch).includes(ESKI), JSON.stringify(patch));
}

// ── 2. To'siq yozuvi sabab va xodim bilan yoziladi ───────────────────────
{
  const { uc, blocks } = build();
  await uc.execute({ clientId: 'cl1', phone: ESKI, reason: 'begona odam', actor: 'u1' });

  const b = blocks.blocked[0];
  check('to\'siq yozildi', blocks.blocked.length === 1, String(blocks.blocked.length));
  check('raqam to\'g\'ri', b?.phone === ESKI, String(b?.phone));
  check('sabab saqlandi', b?.reason === 'begona odam', String(b?.reason));
  check('kim uzgani saqlandi', b?.blockedBy === 'u1', String(b?.blockedBy));
}

// ── 3. Keshdagi Telegram shaxsi tozalanadi ───────────────────────────────
// Eng muhim qadam: bu maydonlar BEGONA odamning hisobiga ishora qiladi.
{
  const { uc, clients } = build();
  await uc.execute({ clientId: 'cl1', phone: ESKI, actor: 'u1' });

  check('Telegram shaxsi tozalandi', clients.identityCleared);
}

// ── 4. Ochiq suhbat yopiladi ─────────────────────────────────────────────
{
  const { uc, conversations } = build();
  await uc.execute({ clientId: 'cl1', phone: ESKI, actor: 'u1' });

  check('suhbat yopildi', conversations.patch?.state === 'closed', JSON.stringify(conversations.patch));
}

// ── 4b. Yopilgan suhbatning ochiq to'lov tekshiruvi bekor qilinadi ───────
// Aks holda chek tekshiruvi tugmasiz abadiy ochiq qolardi.
{
  const { uc, checks } = build();
  await uc.execute({ clientId: 'cl1', phone: ESKI, actor: 'u1' });

  check('tekshiruv bekor qilindi', checks.cancelled.join() === 'cv1', JSON.stringify(checks.cancelled));
}

// ── 5. Suhbat bo'lmasa ham yiqilmaydi ────────────────────────────────────
{
  const { uc, blocks } = build(new FakeClients(), new FakeConversations(null));
  await uc.execute({ clientId: 'cl1', phone: ESKI, actor: 'u1' });

  check('suhbatsiz mijozda ham ishladi', blocks.blocked.length === 1);
}

// ── 6. Audit yoziladi ────────────────────────────────────────────────────
{
  const { uc, audit } = build();
  await uc.execute({ clientId: 'cl1', phone: ESKI, actor: 'u1' });

  const e = audit.entries[0];
  check('audit yozuvi bor', audit.entries.length === 1);
  check('audit mijozga bog\'landi', e?.entityId === 'cl1', String(e?.entityId));
  check('audit xodimni ko\'rsatadi', e?.actor === 'u1', String(e?.actor));
}

// ── 7. Yagona raqam uzilsa mijoz raqamsiz qoladi ─────────────────────────
{
  const { uc, clients } = build(new FakeClients(ESKI, []));
  await uc.execute({ clientId: 'cl1', phone: ESKI, actor: 'u1' });

  const patch = clients.updated as { phone?: string | null } | null;
  check('mijoz raqamsiz qoldi', patch?.phone === null, String(patch?.phone));
}

// ── 8. Ikki marta bosilsa xato bermaydi ──────────────────────────────────
// Operator tugmani ikki marta bosishi mumkin — ikkinchisida raqam
// allaqachon yo'q bo'ladi.
{
  const { uc } = build();
  await uc.execute({ clientId: 'cl1', phone: ESKI, actor: 'u1' });
  let threw = false;
  try {
    await uc.execute({ clientId: 'cl1', phone: ESKI, actor: 'u1' });
  } catch {
    threw = true;
  }
  check('takroriy chaqiruv xato bermadi', !threw);
}

console.log(failed ? `\n${failed} ta test yiqildi` : "\nHammasi o'tdi");
process.exitCode = failed ? 1 : 0;
