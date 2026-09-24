// Las horas "de reloj" (TurnoTrabajo.horaEntrada, ClasePlantilla.horaInicio,
// etc.) se guardan como @db.Time tal cual las escribe el usuario (06:00 se
// guarda como 06:00Z), mientras que ClaseProgramada.fechaHora es un instante
// real en UTC. Estas funciones convierten entre ambos mundos usando la zona
// horaria configurada de la organización.

// Mismo default que Organizacion.zonaHoraria en schema.prisma.
export const ZONA_HORARIA_DEFAULT = 'America/La_Paz';

const OPCIONES: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
};

function crearFormato(zonaHoraria: string | null | undefined): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-CA', { ...OPCIONES, timeZone: zonaHoraria || ZONA_HORARIA_DEFAULT });
  } catch {
    // Zona horaria inválida guardada en la organización: se usa la default
    // en vez de romper la operación.
    return new Intl.DateTimeFormat('en-CA', { ...OPCIONES, timeZone: ZONA_HORARIA_DEFAULT });
  }
}

// Instante UTC -> fecha local (medianoche UTC, como @db.Date) + minutos del día locales.
export function aHoraLocal(instante: Date, zonaHoraria: string | null | undefined): { fechaSolo: Date; minutosDelDia: number } {
  const partes = Object.fromEntries(crearFormato(zonaHoraria).formatToParts(instante).map((p) => [p.type, p.value]));
  return {
    fechaSolo: new Date(Date.UTC(Number(partes.year), Number(partes.month) - 1, Number(partes.day))),
    minutosDelDia: Number(partes.hour) * 60 + Number(partes.minute),
  };
}

// Fecha local (medianoche UTC) + minutos del día locales -> instante UTC real.
export function desdeHoraLocal(fechaSolo: Date, minutosDelDia: number, zonaHoraria: string | null | undefined): Date {
  const objetivo = fechaSolo.getTime() + minutosDelDia * 60_000;
  // Se parte de suponer que la hora local es UTC y se corrige por el desfase
  // observado; una segunda pasada cubre el caso de cambio de horario (DST).
  let instante = objetivo;
  for (let i = 0; i < 2; i++) {
    const local = aHoraLocal(new Date(instante), zonaHoraria);
    const observado = local.fechaSolo.getTime() + local.minutosDelDia * 60_000;
    instante += objetivo - observado;
  }
  return new Date(instante);
}

// Día de la semana local (0 = domingo ... 6 = sábado) de un instante.
export function diaSemanaLocal(instante: Date, zonaHoraria: string | null | undefined): number {
  return aHoraLocal(instante, zonaHoraria).fechaSolo.getUTCDay();
}

// Instante UTC en que empieza (00:00 local) el día local de `instante`.
export function inicioDelDiaLocal(instante: Date, zonaHoraria: string | null | undefined): Date {
  return desdeHoraLocal(aHoraLocal(instante, zonaHoraria).fechaSolo, 0, zonaHoraria);
}
