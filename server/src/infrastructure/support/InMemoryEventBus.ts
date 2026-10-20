import type { DomainEvent, IEventBus } from '@/domain/services/support';
import { childLogger } from '@/shared/logger';

const log = childLogger('events');

/**
 * Bitta jarayon ichidagi oddiy hodisa shinasi.
 * Bir nechta server nusxasi kerak bo'lganda Redis pub/sub bilan almashtiriladi —
 * IEventBus interfeysi o'zgarmaydi.
 */
export class InMemoryEventBus implements IEventBus {
  private readonly handlers = new Set<(event: DomainEvent) => void>();

  publish(event: DomainEvent): void {
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (err) {
        log.error({ err, event: event.type }, 'Hodisa ishlovchisi xatosi');
      }
    }
  }

  subscribe(handler: (event: DomainEvent) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }
}
