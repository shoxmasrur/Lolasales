import { SendManualMessageUseCase } from '@/application/usecases/messaging/SendManualMessageUseCase';
import type { IConversationRepository } from '@/domain/repositories/IConversationRepository';
import type { IMessageRepository } from '@/domain/repositories/IMessageRepository';
import type { IAuditRepository } from '@/domain/repositories/ISupportRepositories';
import type { MessageDispatcher } from '@/application/services/MessageDispatcher';

/**
 * Qo'lda ishga tushiriladi: npm run test:send-manual --workspace=server
 *
 * Bazaga chiqmaydi — hamma port soxta.
 *
 * Nima tekshiriladi: operator chatdan yozgan BIRINCHI xabar kunlik
 * hisoblagichni oshirishi kerak (aks holda Telegram ko'radigan son
 * bizning hisobimizdan katta bo'lib qoladi), lekin limit uni TO'SMASLIGI
 * kerak — operator ongli qaror qabul qilyapti.
 */

let failed = 0;
function check(holat: string, ok: boolean, izoh = ''): void {
  if (!ok) failed += 1;
  console.log(`${ok ? '✓' : '✗'} ${holat}${ok ? '' : `  ${izoh}`}`);
}

interface Yuborilgan {
  coldOutreach?: boolean;
  enforceQuota?: boolean;
}

function build(hasOutbound: boolean): { useCase: SendManualMessageUseCase; sent: Yuborilgan[] } {
  const sent: Yuborilgan[] = [];

  const conversations = {
    findById: async () => ({ id: 'cv1', clientId: 'c1' }),
    update: async () => undefined,
  } as unknown as IConversationRepository;

  const messages = {
    hasOutbound: async () => hasOutbound,
    findById: async () => null,
    updateStatus: async () => undefined,
  } as unknown as IMessageRepository;

  const dispatcher = {
    send: async (options: Yuborilgan) => {
      sent.push({ coldOutreach: options.coldOutreach, enforceQuota: options.enforceQuota });
      return { id: 'm1' };
    },
  } as unknown as MessageDispatcher;

  const audit = { record: async () => undefined } as unknown as IAuditRepository;

  return { useCase: new SendManualMessageUseCase(conversations, messages, dispatcher, audit), sent };
}

const input = { conversationId: 'cv1', body: 'salom', userId: 'u1', userEmail: 'a@b.uz' };

// 1. Birinchi chiquvchi xabar — sanaladi, lekin to'silmaydi.
{
  const { useCase, sent } = build(false);
  await useCase.execute(input);
  check('birinchi xabar coldOutreach bilan ketadi', sent[0]?.coldOutreach === true, `${sent[0]?.coldOutreach}`);
  check('birinchi xabar limitga to\'silmaydi', sent[0]?.enforceQuota === false, `${sent[0]?.enforceQuota}`);
}

// 2. Suhbatda allaqachon chiquvchi xabar bor — sanalmaydi.
{
  const { useCase, sent } = build(true);
  await useCase.execute(input);
  check('keyingi xabar coldOutreach bermaydi', sent[0]?.coldOutreach !== true, `${sent[0]?.coldOutreach}`);
}

console.log(failed ? `\n${failed} ta test yiqildi` : '\nHammasi o\'tdi');
process.exitCode = failed ? 1 : 0;
