import type { Request } from 'express';
import type { ZodType } from 'zod';

/** So'rov tanasini/parametrlarini tekshiradi — xato ZodError sifatida chiqadi. */
export function parseBody<T>(schema: ZodType<T>, req: Request): T {
  return schema.parse(req.body);
}

export function parseQuery<T>(schema: ZodType<T>, req: Request): T {
  return schema.parse(req.query);
}

export function parseParams<T>(schema: ZodType<T>, req: Request): T {
  return schema.parse(req.params);
}
