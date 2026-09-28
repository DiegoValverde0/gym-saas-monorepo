import { describe, expect, it } from 'vitest';
import { paginar, resolverPaginacion } from './pagination.util';

describe('paginación', () => {
  it('por defecto: página 1 de 50', () => {
    expect(resolverPaginacion()).toEqual({ page: 1, limit: 50, skip: 0, take: 50 });
  });

  it('calcula el salto y limita el tamaño a 100', () => {
    expect(resolverPaginacion({ page: 3, limit: 25 })).toEqual({ page: 3, limit: 25, skip: 50, take: 25 });
    expect(resolverPaginacion({ page: 1, limit: 500 }).limit).toBe(100);
  });

  it('informa el total de páginas', () => {
    expect(paginar([1, 2], 61, 3, 25)).toEqual({ data: [1, 2], total: 61, page: 3, limit: 25, totalPaginas: 3 });
  });
});
