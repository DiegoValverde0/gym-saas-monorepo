import { IsEnum, IsOptional } from 'class-validator';
import { TipoTransaccion } from '@prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

// Sin este filtro, ingresos y egresos quedaban mezclados en un único
// listado sin forma de separarlos -- ver findAll() en transaccion.service.ts.
export class QueryTransaccionDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(TipoTransaccion)
  tipo?: TipoTransaccion;
}
