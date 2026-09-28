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
    descripcion: 'Registra clientes, vende membresías y productos, cobra y controla el ingreso.',
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

// Nombres de los módulos y acciones de permisos (tabla `permisos`) para el
// editor de roles. Lo que no está aquí se muestra tal cual.
const NOMBRE_MODULO: Record<string, string> = {
  sucursales: 'Sucursales',
  cajas_registradoras: 'Cajas',
  usuarios: 'Accesos avanzados',
  roles: 'Roles',
  disciplinas: 'Disciplinas',
  staff: 'Equipo',
  turnos: 'Jornadas y horarios',
  clases: 'Clases',
  reservas: 'Reservas de clases',
  clientes: 'Clientes',
  promociones: 'Promociones',
  planes: 'Planes',
  membresias: 'Membresías',
  asistencias: 'Control de acceso',
  cuentas_bancarias: 'Cuentas',
  aperturas_caja: 'Turnos de caja',
  transacciones: 'Cobros y gastos',
  pagos: 'Pagos',
  productos: 'Productos',
  inventarios: 'Stock',
  dashboard: 'Inicio y tablero',
  reportes: 'Reportería',
  sistema: 'Papelera',
};

const NOMBRE_ACCION: Record<string, string> = {
  leer: 'Ver',
  crear: 'Crear',
  actualizar: 'Editar',
  eliminar: 'Eliminar',
  restaurar: 'Restaurar lo eliminado',
  multiple_por_dia: 'Más de un ingreso por día',
  forzar: 'Dejar pasar aunque no cumpla',
};

export const nombreModulo = (modulo: string) => NOMBRE_MODULO[modulo] ?? modulo;
export const nombreAccion = (accion: string) => NOMBRE_ACCION[accion] ?? accion;

// Orden en que se ofrecen los roles al dar de alta a alguien: primero los base
// más comunes, después los propios de la organización.
export function ordenRol(nombre: string): number {
  return ['RECEPCIONISTA', 'ENTRENADOR', 'ADMIN_GYM'].indexOf(nombre) + 1 || 99;
}
