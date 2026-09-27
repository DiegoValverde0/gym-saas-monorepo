import { IsEnum, IsOptional } from 'class-validator';
import { TipoTransaccion } from '@prisma/client';
import { BusquedaQueryDto } from '../../../common/dto/busqueda-query.dto';

// Sin este filtro, ingresos y egresos quedaban mezclados en un único
// listado sin forma de separarlos -- ver findAll() en transaccion.service.ts.
export class QueryTransaccionDto extends BusquedaQueryDto {
  @IsOptional()
  @IsEnum(TipoTransaccion)
  tipo?: TipoTransaccion;
}
