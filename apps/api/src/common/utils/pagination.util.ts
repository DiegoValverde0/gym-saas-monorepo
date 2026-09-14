import { PaginationQueryDto } from '../dto/pagination-query.dto';

const LIMITE_POR_DEFECTO = 50;
const LIMITE_MAXIMO = 100;

export function resolverPaginacion(query?: PaginationQueryDto) {
  const page = query?.page && query.page > 0 ? query.page : 1;
  const limit = query?.limit && query.limit > 0 ? Math.min(query.limit, LIMITE_MAXIMO) : LIMITE_POR_DEFECTO;
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

export function paginar<T>(data: T[], total: number, page: number, limit: number) {
  return { data, total, page, limit, totalPaginas: Math.ceil(total / limit) };
}
