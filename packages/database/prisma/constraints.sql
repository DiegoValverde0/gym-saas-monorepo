-- Restricciones que Prisma no puede declarar en schema.prisma (índices únicos
-- parciales) pero que son la única forma robusta de evitar condiciones de
-- carrera entre requests concurrentes. Se ejecuta después de `prisma db push`
-- (ver package.json#scripts.db:push) vía `prisma db execute`.

-- Una caja registradora no puede tener más de una apertura ABIERTA a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS uq_caja_una_apertura_abierta
  ON aperturas_caja (caja_id)
  WHERE estado = 'ABIERTA';

-- Un usuario no puede tener más de un turno de caja ABIERTO a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuario_un_turno_abierto
  ON aperturas_caja (usuario_id)
  WHERE estado = 'ABIERTA';
