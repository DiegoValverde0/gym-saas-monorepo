import { IsIn, IsOptional } from 'class-validator';
import { BusquedaQueryDto } from '../../../common/dto/busqueda-query.dto';

export class ClientesQueryDto extends BusquedaQueryDto {
  // Pestañas de la pantalla Clientes: estado manual ACTIVO frente al resto.
  @IsOptional()
  @IsIn(['activos', 'inactivos'])
  estado?: 'activos' | 'inactivos';
}
