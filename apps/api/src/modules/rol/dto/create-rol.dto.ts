import { IsString, IsOptional, IsArray, IsUUID } from 'class-validator';

export class CreateRolDto {
  @IsString()
  nombre: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  permisosIds?: string[];
}
