export interface Page<T> {
  readonly items: T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

export interface Pagination {
  readonly limit?: number;
  readonly offset?: number;
}

export function emptyPage<T>(limit = 50, offset = 0): Page<T> {
  return { items: [], total: 0, limit, offset };
}
