import { PartialType } from '@nestjs/mapped-types';
import { CreateTurnoPlantillaDto } from './create-turno-plantilla.dto';

export class UpdateTurnoPlantillaDto extends PartialType(CreateTurnoPlantillaDto) {}
