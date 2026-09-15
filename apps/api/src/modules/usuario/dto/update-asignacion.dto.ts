import { IsUUID, IsOptional } from 'class-validator';

export class UpdateAsignacionDto {
  @IsUUID()
  rolId: string;

  @IsUUID()
  @IsOptional()
  sucursalId?: string | null;
}
