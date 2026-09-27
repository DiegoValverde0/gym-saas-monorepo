import { IsOptional, IsUUID } from 'class-validator';
import { BusquedaQueryDto } from '../../../common/dto/busqueda-query.dto';

export class InventarioQueryDto extends BusquedaQueryDto {
  // La venta de productos solo necesita el stock de la sucursal donde vende.
  @IsOptional()
  @IsUUID()
  sucursalId?: string;
}
