import { NotFoundException } from '@nestjs/common';

// Reemplaza el patrón repetido "buscar o 404" (if (!x) throw new NotFoundException(...))
// que cada servicio reescribe a mano tras un findUnique/findFirst.
export function assertFound<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) {
    throw new NotFoundException(message);
  }
  return value;
}
