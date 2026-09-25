// Nombres y explicaciones "humanas" de los roles base (plan de
// simplificación, 6.2). Los roles guardados no cambian: esto es solo cómo se
// muestran. Un rol propio de la organización se muestra con su nombre.
const ROLES_BASE: Record<string, { nombre: string; descripcion: string }> = {
  ADMIN_GYM: {
    nombre: 'Administrador',
    descripcion: 'Puede ver y cambiar todo en el gimnasio, incluido el equipo y la configuración.',
  },
  RECEPCIONISTA: {
    nombre: 'Recepción',
    descripcion: 'Registra clientes, vende membresías, cobra y controla el ingreso.',
  },
  ENTRENADOR: {
    nombre: 'Instructor',
    descripcion: 'Ve sus clases, sus alumnos y su horario; marca asistencia a sus clases.',
  },
  SUPERADMIN: { nombre: 'Superadministrador', descripcion: 'Cuenta de la plataforma.' },
  CLIENTE: { nombre: 'Cliente', descripcion: 'Cuenta de un cliente del gimnasio.' },
};

export function nombreRol(nombre?: string | null): string {
  if (!nombre) return '';
  return ROLES_BASE[nombre]?.nombre ?? nombre;
}

export function descripcionRol(nombre?: string | null): string | undefined {
  return nombre ? ROLES_BASE[nombre]?.descripcion : undefined;
}

// Orden en que se ofrecen los roles al dar de alta a alguien: primero los base
// más comunes, después los propios de la organización.
export function ordenRol(nombre: string): number {
  return ['RECEPCIONISTA', 'ENTRENADOR', 'ADMIN_GYM'].indexOf(nombre) + 1 || 99;
}
