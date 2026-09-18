import { PartialType } from '@nestjs/mapped-types';
import { CreateClasePlantillaDto } from './create-clase-plantilla.dto';

export class UpdateClasePlantillaDto extends PartialType(CreateClasePlantillaDto) {}
