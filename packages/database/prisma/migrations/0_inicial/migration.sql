-- CreateEnum
CREATE TYPE "EstadoOrganizacion" AS ENUM ('ACTIVO', 'INACTIVO', 'SUSPENDIDO');

-- CreateEnum
CREATE TYPE "EstadoGeneral" AS ENUM ('ACTIVO', 'INACTIVO');

-- CreateEnum
CREATE TYPE "EstadoUsuario" AS ENUM ('ACTIVO', 'INACTIVO', 'BLOQUEADO');

-- CreateEnum
CREATE TYPE "TipoDocumento" AS ENUM ('CI', 'PASAPORTE', 'CARNET_EXTRANJERO', 'NIT', 'OTRO');

-- CreateEnum
CREATE TYPE "Genero" AS ENUM ('MASCULINO', 'FEMENINO', 'OTRO', 'PREFIERE_NO_INFORMAR');

-- CreateEnum
CREATE TYPE "EstadoCaja" AS ENUM ('ABIERTA', 'CERRADA', 'MANTENIMIENTO');

-- CreateEnum
CREATE TYPE "EstadoAperturaCaja" AS ENUM ('ABIERTA', 'CERRADA');

-- CreateEnum
CREATE TYPE "TipoTransaccion" AS ENUM ('INGRESO', 'EGRESO');

-- CreateEnum
CREATE TYPE "MetodoPago" AS ENUM ('EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'QR', 'PAGO_MOVIL', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoConceptoVenta" AS ENUM ('MEMBRESIA', 'PRODUCTO', 'SERVICIO', 'OTRO', 'ALQUILER', 'SERVICIOS_BASICOS', 'NOMINA', 'INSUMOS', 'MANTENIMIENTO', 'IMPUESTOS', 'OTRO_GASTO');

-- CreateEnum
CREATE TYPE "TipoContratacionStaff" AS ENUM ('PLANILLA', 'INDEPENDIENTE', 'VOLUNTARIO');

-- CreateEnum
CREATE TYPE "TipoPlan" AS ENUM ('TIEMPO', 'SESIONES', 'VISITA');

-- CreateEnum
CREATE TYPE "EstadoMembresia" AS ENUM ('PENDIENTE_PAGO', 'EN_ESPERA', 'ACTIVA', 'VENCIDA', 'CANCELADA', 'AGOTADA', 'CONGELADA');

-- CreateEnum
CREATE TYPE "EstadoCliente" AS ENUM ('ACTIVO', 'INACTIVO', 'MOROSO', 'SUSPENDIDO');

-- CreateEnum
CREATE TYPE "EstadoReserva" AS ENUM ('CONFIRMADA', 'CANCELADA', 'ASISTIO', 'NO_ASISTIO', 'EN_ESPERA');

-- CreateEnum
CREATE TYPE "AccesoClase" AS ENUM ('ABIERTA', 'MIEMBROS', 'PLANES');

-- CreateEnum
CREATE TYPE "EstadoTurno" AS ENUM ('PROGRAMADO', 'COMPLETADO', 'AUSENTE', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoAsistencia" AS ENUM ('MIEMBRO', 'INVITADO', 'VISITA_DIA', 'PRUEBA_GRATIS');

-- CreateEnum
CREATE TYPE "OperacionAuditoria" AS ENUM ('INSERT', 'UPDATE', 'DELETE');

-- CreateEnum
CREATE TYPE "MetodoValidacion" AS ENUM ('MANUAL', 'TARJETA', 'BIOMETRICO', 'QR', 'CODIGO_PIN');

-- CreateEnum
CREATE TYPE "TipoComprobante" AS ENUM ('RECIBO_SIMPLE', 'FACTURA', 'NOTA_VENTA');

-- CreateTable
CREATE TABLE "organizaciones" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "razon_social" VARCHAR(200),
    "identificacion_fiscal" VARCHAR(50),
    "telefono" VARCHAR(30),
    "email_contacto" VARCHAR(150),
    "moneda" CHAR(3) NOT NULL DEFAULT 'BOB',
    "zona_horaria" VARCHAR(50) NOT NULL DEFAULT 'America/La_Paz',
    "configuracion" JSONB,
    "fecha_registro" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" "EstadoOrganizacion" NOT NULL DEFAULT 'ACTIVO',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "organizaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sucursales" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "es_principal" BOOLEAN NOT NULL DEFAULT false,
    "direccion" TEXT,
    "telefono" VARCHAR(30),
    "estado" "EstadoGeneral" NOT NULL DEFAULT 'ACTIVO',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "sucursales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cajas_registradoras" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "nombre" VARCHAR(50) NOT NULL,
    "saldo_actual" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "estado" "EstadoCaja" NOT NULL DEFAULT 'CERRADA',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "creado_por_id" UUID,

    CONSTRAINT "cajas_registradoras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "nombre_completo" VARCHAR(150) NOT NULL,
    "correo" VARCHAR(150) NOT NULL,
    "contrasena_hash" VARCHAR(255) NOT NULL,
    "telefono" VARCHAR(30),
    "tipo_documento" "TipoDocumento",
    "numero_documento" VARCHAR(30),
    "fecha_nacimiento" DATE,
    "estado" "EstadoUsuario" NOT NULL DEFAULT 'ACTIVO',
    "is_superadmin" BOOLEAN NOT NULL DEFAULT false,
    "sucursal_preferida_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permisos" (
    "id" UUID NOT NULL,
    "modulo" VARCHAR(50) NOT NULL,
    "accion" VARCHAR(50) NOT NULL,
    "descripcion" TEXT,

    CONSTRAINT "permisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID,
    "nombre" VARCHAR(50) NOT NULL,
    "descripcion" TEXT,
    "es_sistema" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles_permisos" (
    "rol_id" UUID NOT NULL,
    "permiso_id" UUID NOT NULL,

    CONSTRAINT "roles_permisos_pkey" PRIMARY KEY ("rol_id","permiso_id")
);

-- CreateTable
CREATE TABLE "asignaciones_acceso" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "organizacion_id" UUID,
    "sucursal_id" UUID,
    "rol_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asignaciones_acceso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disciplinas" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "descripcion" TEXT,
    "estado" "EstadoGeneral" NOT NULL DEFAULT 'ACTIVO',

    CONSTRAINT "disciplinas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perfiles_staff" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "tipo_contratacion" "TipoContratacionStaff" NOT NULL DEFAULT 'PLANILLA',
    "costo_por_hora" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "comision_porcentaje" DECIMAL(5,2),
    "estado" "EstadoGeneral" NOT NULL DEFAULT 'ACTIVO',
    "pin_hash" VARCHAR(200),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "perfiles_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_disciplinas" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "disciplina_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_disciplinas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turnos_trabajo" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "hora_entrada" TIME(6) NOT NULL,
    "hora_salida" TIME(6) NOT NULL,
    "hora_ingreso_real" TIMESTAMPTZ(6),
    "hora_salida_real" TIMESTAMPTZ(6),
    "estado" "EstadoTurno" NOT NULL DEFAULT 'PROGRAMADO',
    "motivo_ausencia" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "turnos_trabajo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turnos_plantilla" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "dia_semana" INTEGER NOT NULL,
    "hora_entrada" TIME(6) NOT NULL,
    "hora_salida" TIME(6) NOT NULL,
    "vigencia_desde" DATE NOT NULL,
    "vigencia_hasta" DATE,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "turnos_plantilla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salas" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "capacidad" INTEGER,
    "estado" "EstadoGeneral" NOT NULL DEFAULT 'ACTIVO',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "salas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clases_plantilla_planes" (
    "organizacion_id" UUID NOT NULL,
    "clase_plantilla_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,

    CONSTRAINT "clases_plantilla_planes_pkey" PRIMARY KEY ("clase_plantilla_id","plan_id")
);

-- CreateTable
CREATE TABLE "clases_programadas" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "disciplina_id" UUID,
    "entrenador_id" UUID,
    "turno_id" UUID,
    "clase_plantilla_id" UUID,
    "sala_id" UUID,
    "acceso" "AccesoClase",
    "nombre_clase" VARCHAR(100) NOT NULL,
    "descripcion" TEXT,
    "capacidad_maxima" INTEGER NOT NULL DEFAULT 20,
    "fecha_hora" TIMESTAMPTZ(6) NOT NULL,
    "duracion_minutos" INTEGER NOT NULL DEFAULT 60,
    "estado" "EstadoGeneral" NOT NULL DEFAULT 'ACTIVO',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "clases_programadas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clases_plantilla" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "disciplina_id" UUID,
    "entrenador_id" UUID,
    "nombre_clase" VARCHAR(100) NOT NULL,
    "descripcion" TEXT,
    "capacidad_maxima" INTEGER NOT NULL DEFAULT 20,
    "dia_semana" INTEGER NOT NULL,
    "hora_inicio" TIME(6) NOT NULL,
    "duracion_minutos" INTEGER NOT NULL DEFAULT 60,
    "vigencia_desde" DATE NOT NULL,
    "vigencia_hasta" DATE,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "sala_id" UUID,
    "acceso" "AccesoClase",
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "clases_plantilla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservas_clases" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "clase_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "fecha_reserva" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" "EstadoReserva" NOT NULL DEFAULT 'CONFIRMADA',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "reservas_clases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "sucursal_base_id" UUID,
    "nombre" VARCHAR(150) NOT NULL,
    "correo" VARCHAR(150),
    "telefono" VARCHAR(30),
    "tipo_documento" "TipoDocumento",
    "numero_documento" VARCHAR(30),
    "fecha_nacimiento" DATE,
    "genero" "Genero",
    "direccion" TEXT,
    "foto_url" TEXT,
    "contacto_emergencia_nombre" VARCHAR(150),
    "contacto_emergencia_telefono" VARCHAR(30),
    "condiciones_medicas" TEXT,
    "acepta_deslinde_responsabilidad" BOOLEAN NOT NULL DEFAULT false,
    "fecha_aceptacion_deslinde" TIMESTAMPTZ(6),
    "estado" "EstadoCliente" NOT NULL DEFAULT 'ACTIVO',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "creado_por_id" UUID,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promociones" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "porcentaje_descuento" DECIMAL(5,2),
    "monto_descuento_fijo" DECIMAL(10,2),
    "fecha_inicio" TIMESTAMPTZ(6) NOT NULL,
    "fecha_fin" TIMESTAMPTZ(6) NOT NULL,
    "estado" "EstadoGeneral" NOT NULL DEFAULT 'ACTIVO',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "promociones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planes" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "tipo_plan" "TipoPlan" NOT NULL,
    "duracion_dias" INTEGER DEFAULT 30,
    "limite_dias_semana" INTEGER,
    "dias_permitidos" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "cantidad_sesiones" INTEGER DEFAULT 0,
    "hora_inicio_acceso" TIME(6),
    "hora_fin_acceso" TIME(6),
    "es_renovable_automaticamente" BOOLEAN NOT NULL DEFAULT false,
    "precio" DECIMAL(10,2) NOT NULL,
    "estado" "EstadoGeneral" NOT NULL DEFAULT 'ACTIVO',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "planes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membresias" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "sucursal_id" UUID,
    "cliente_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "promocion_id" UUID,
    "monto_base" DECIMAL(10,2) NOT NULL,
    "descuento_aplicado" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "monto_final" DECIMAL(10,2) NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE,
    "sesiones_restantes" INTEGER DEFAULT 0,
    "estado" "EstadoMembresia" NOT NULL DEFAULT 'PENDIENTE_PAGO',
    "pagada" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "creado_por_id" UUID,

    CONSTRAINT "membresias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pausas_membresia" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "membresia_id" UUID NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE,
    "motivo" TEXT,
    "creado_por_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pausas_membresia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registros_asistencia" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "cliente_id" UUID,
    "membresia_id" UUID,
    "tipo_asistencia" "TipoAsistencia" NOT NULL DEFAULT 'MIEMBRO',
    "nombre_visitante" VARCHAR(150),
    "fecha_hora_ingreso" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_hora_salida" TIMESTAMPTZ(6),
    "metodo_validacion" "MetodoValidacion" NOT NULL DEFAULT 'MANUAL',
    "registrado_por_id" UUID,
    "motivo_anulacion" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "registros_asistencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuentas_bancarias" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "banco" VARCHAR(100) NOT NULL,
    "numero_cuenta" VARCHAR(50) NOT NULL,
    "tipo_cuenta" VARCHAR(50),
    "moneda" CHAR(3) NOT NULL DEFAULT 'BOB',
    "saldo" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "cuentas_bancarias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proveedores" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "numero_documento" VARCHAR(50),
    "telefono" VARCHAR(30),
    "correo" VARCHAR(150),
    "categoria_default" "TipoConceptoVenta",
    "estado" "EstadoGeneral" NOT NULL DEFAULT 'ACTIVO',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aperturas_caja" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "caja_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "monto_inicial" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "monto_cierre_esperado" DECIMAL(12,2),
    "monto_cierre_real" DECIMAL(12,2),
    "observaciones" TEXT,
    "fecha_apertura" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_cierre" TIMESTAMPTZ(6),
    "estado" "EstadoAperturaCaja" NOT NULL DEFAULT 'ABIERTA',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "aperturas_caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transacciones" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "apertura_caja_id" UUID,
    "cliente_id" UUID,
    "tipo" "TipoTransaccion" NOT NULL,
    "proveedor_id" UUID,
    "beneficiario" VARCHAR(150),
    "monto_total" DECIMAL(12,2) NOT NULL,
    "fecha_hora" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "creado_por_id" UUID,

    CONSTRAINT "transacciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagos" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "transaccion_id" UUID NOT NULL,
    "cuenta_bancaria_id" UUID,
    "metodo_pago" "MetodoPago" NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "referencia" VARCHAR(100),
    "fecha_hora" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalles_transaccion" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "transaccion_id" UUID NOT NULL,
    "tipo_concepto" "TipoConceptoVenta" NOT NULL,
    "membresia_id" UUID,
    "producto_id" UUID,
    "servicio_id" UUID,
    "gasto_plantilla_id" UUID,
    "descripcion_libre" VARCHAR(200),
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "precio_unitario" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "detalles_transaccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gastos_plantilla" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "proveedor_id" UUID,
    "beneficiario" VARCHAR(150),
    "tipo_concepto" "TipoConceptoVenta" NOT NULL,
    "descripcion" TEXT,
    "monto" DECIMAL(12,2) NOT NULL,
    "metodo_pago" "MetodoPago" NOT NULL,
    "cuenta_bancaria_id" UUID NOT NULL,
    "dia_del_mes" INTEGER NOT NULL,
    "vigencia_desde" DATE NOT NULL,
    "vigencia_hasta" DATE,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "ultima_generacion" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "gastos_plantilla_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comprobantes" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "transaccion_id" UUID NOT NULL,
    "tipo_comprobante" "TipoComprobante" NOT NULL DEFAULT 'RECIBO_SIMPLE',
    "numero_documento" VARCHAR(50),
    "nit_razon_social" VARCHAR(150),
    "codigo_autorizacion" VARCHAR(100),
    "fecha_emision" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "url_documento" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comprobantes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "productos" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "sku" VARCHAR(50),
    "nombre" VARCHAR(150) NOT NULL,
    "descripcion" TEXT,
    "precio_venta" DECIMAL(10,2) NOT NULL,
    "estado" "EstadoGeneral" NOT NULL DEFAULT 'ACTIVO',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servicios" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "nombre" VARCHAR(150) NOT NULL,
    "descripcion" TEXT,
    "precio" DECIMAL(10,2) NOT NULL,
    "duracion_minutos" INTEGER,
    "estado" "EstadoGeneral" NOT NULL DEFAULT 'ACTIVO',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "servicios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventarios" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "sucursal_id" UUID NOT NULL,
    "producto_id" UUID NOT NULL,
    "cantidad_actual" INTEGER NOT NULL DEFAULT 0,
    "punto_reorden" INTEGER NOT NULL DEFAULT 5,
    "ubicacion_bodega" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inventarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditorias" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID,
    "usuario_id" UUID,
    "tabla_afectada" VARCHAR(100) NOT NULL,
    "operacion" "OperacionAuditoria" NOT NULL,
    "valores_anteriores" JSONB,
    "valores_nuevos" JSONB,
    "fecha_hora" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_origen" VARCHAR(45),

    CONSTRAINT "auditorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "usuario_destino_id" UUID NOT NULL,
    "tipo" VARCHAR(50) NOT NULL,
    "titulo" VARCHAR(150) NOT NULL,
    "mensaje" TEXT NOT NULL,
    "fecha_lectura" TIMESTAMPTZ(6),
    "fecha_creacion" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "organizacion_id" UUID NOT NULL,
    "nombre" VARCHAR(100) NOT NULL,
    "llave_hash" VARCHAR(255) NOT NULL,
    "permisos_json" JSONB,
    "estado" "EstadoGeneral" NOT NULL DEFAULT 'ACTIVO',
    "fecha_expiracion" TIMESTAMPTZ(6),
    "fecha_creacion" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizaciones_identificacion_fiscal_key" ON "organizaciones"("identificacion_fiscal");

-- CreateIndex
CREATE INDEX "sucursales_organizacion_id_idx" ON "sucursales"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "sucursales_id_organizacion_id_key" ON "sucursales"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "cajas_registradoras_organizacion_id_sucursal_id_idx" ON "cajas_registradoras"("organizacion_id", "sucursal_id");

-- CreateIndex
CREATE UNIQUE INDEX "cajas_registradoras_id_organizacion_id_key" ON "cajas_registradoras"("id", "organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_correo_key" ON "usuarios"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_numero_documento_key" ON "usuarios"("numero_documento");

-- CreateIndex
CREATE UNIQUE INDEX "permisos_modulo_accion_key" ON "permisos"("modulo", "accion");

-- CreateIndex
CREATE INDEX "roles_organizacion_id_idx" ON "roles"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_organizacion_id_nombre_key" ON "roles"("organizacion_id", "nombre");

-- CreateIndex
CREATE INDEX "asignaciones_acceso_usuario_id_idx" ON "asignaciones_acceso"("usuario_id");

-- CreateIndex
CREATE INDEX "asignaciones_acceso_organizacion_id_sucursal_id_idx" ON "asignaciones_acceso"("organizacion_id", "sucursal_id");

-- CreateIndex
CREATE UNIQUE INDEX "asignaciones_acceso_usuario_id_organizacion_id_sucursal_id__key" ON "asignaciones_acceso"("usuario_id", "organizacion_id", "sucursal_id", "rol_id");

-- CreateIndex
CREATE INDEX "disciplinas_organizacion_id_idx" ON "disciplinas"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "disciplinas_id_organizacion_id_key" ON "disciplinas"("id", "organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "disciplinas_organizacion_id_nombre_key" ON "disciplinas"("organizacion_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "perfiles_staff_usuario_id_key" ON "perfiles_staff"("usuario_id");

-- CreateIndex
CREATE INDEX "perfiles_staff_organizacion_id_idx" ON "perfiles_staff"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "perfiles_staff_id_organizacion_id_key" ON "perfiles_staff"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "staff_disciplinas_organizacion_id_idx" ON "staff_disciplinas"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_disciplinas_staff_id_disciplina_id_key" ON "staff_disciplinas"("staff_id", "disciplina_id");

-- CreateIndex
CREATE INDEX "turnos_trabajo_organizacion_id_sucursal_id_fecha_idx" ON "turnos_trabajo"("organizacion_id", "sucursal_id", "fecha");

-- CreateIndex
CREATE INDEX "turnos_trabajo_staff_id_idx" ON "turnos_trabajo"("staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "turnos_trabajo_id_organizacion_id_key" ON "turnos_trabajo"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "turnos_plantilla_organizacion_id_staff_id_idx" ON "turnos_plantilla"("organizacion_id", "staff_id");

-- CreateIndex
CREATE INDEX "salas_organizacion_id_sucursal_id_idx" ON "salas"("organizacion_id", "sucursal_id");

-- CreateIndex
CREATE UNIQUE INDEX "salas_id_organizacion_id_key" ON "salas"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "clases_plantilla_planes_organizacion_id_idx" ON "clases_plantilla_planes"("organizacion_id");

-- CreateIndex
CREATE INDEX "clases_programadas_organizacion_id_sucursal_id_idx" ON "clases_programadas"("organizacion_id", "sucursal_id");

-- CreateIndex
CREATE INDEX "clases_programadas_fecha_hora_idx" ON "clases_programadas"("fecha_hora");

-- CreateIndex
CREATE UNIQUE INDEX "clases_programadas_id_organizacion_id_key" ON "clases_programadas"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "clases_plantilla_organizacion_id_sucursal_id_idx" ON "clases_plantilla"("organizacion_id", "sucursal_id");

-- CreateIndex
CREATE UNIQUE INDEX "clases_plantilla_id_organizacion_id_key" ON "clases_plantilla"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "reservas_clases_organizacion_id_idx" ON "reservas_clases"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "reservas_clases_clase_id_cliente_id_key" ON "reservas_clases"("clase_id", "cliente_id");

-- CreateIndex
CREATE INDEX "clientes_organizacion_id_idx" ON "clientes"("organizacion_id");

-- CreateIndex
CREATE INDEX "clientes_organizacion_id_correo_idx" ON "clientes"("organizacion_id", "correo");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_id_organizacion_id_key" ON "clientes"("id", "organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_organizacion_id_numero_documento_key" ON "clientes"("organizacion_id", "numero_documento");

-- CreateIndex
CREATE INDEX "promociones_organizacion_id_idx" ON "promociones"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "promociones_id_organizacion_id_key" ON "promociones"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "planes_organizacion_id_idx" ON "planes"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "planes_id_organizacion_id_key" ON "planes"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "membresias_organizacion_id_cliente_id_idx" ON "membresias"("organizacion_id", "cliente_id");

-- CreateIndex
CREATE INDEX "membresias_plan_id_idx" ON "membresias"("plan_id");

-- CreateIndex
CREATE UNIQUE INDEX "membresias_id_organizacion_id_key" ON "membresias"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "pausas_membresia_organizacion_id_membresia_id_idx" ON "pausas_membresia"("organizacion_id", "membresia_id");

-- CreateIndex
CREATE INDEX "registros_asistencia_organizacion_id_sucursal_id_fecha_hora_idx" ON "registros_asistencia"("organizacion_id", "sucursal_id", "fecha_hora_ingreso");

-- CreateIndex
CREATE INDEX "registros_asistencia_cliente_id_idx" ON "registros_asistencia"("cliente_id");

-- CreateIndex
CREATE INDEX "cuentas_bancarias_organizacion_id_idx" ON "cuentas_bancarias"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_bancarias_id_organizacion_id_key" ON "cuentas_bancarias"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "proveedores_organizacion_id_idx" ON "proveedores"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "proveedores_id_organizacion_id_key" ON "proveedores"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "aperturas_caja_organizacion_id_caja_id_idx" ON "aperturas_caja"("organizacion_id", "caja_id");

-- CreateIndex
CREATE INDEX "aperturas_caja_usuario_id_idx" ON "aperturas_caja"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "aperturas_caja_id_organizacion_id_key" ON "aperturas_caja"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "transacciones_organizacion_id_sucursal_id_idx" ON "transacciones"("organizacion_id", "sucursal_id");

-- CreateIndex
CREATE INDEX "transacciones_organizacion_id_apertura_caja_id_idx" ON "transacciones"("organizacion_id", "apertura_caja_id");

-- CreateIndex
CREATE INDEX "transacciones_fecha_hora_idx" ON "transacciones"("fecha_hora");

-- CreateIndex
CREATE INDEX "transacciones_cliente_id_idx" ON "transacciones"("cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "transacciones_id_organizacion_id_key" ON "transacciones"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "pagos_organizacion_id_transaccion_id_idx" ON "pagos"("organizacion_id", "transaccion_id");

-- CreateIndex
CREATE INDEX "pagos_metodo_pago_idx" ON "pagos"("metodo_pago");

-- CreateIndex
CREATE INDEX "detalles_transaccion_organizacion_id_transaccion_id_idx" ON "detalles_transaccion"("organizacion_id", "transaccion_id");

-- CreateIndex
CREATE INDEX "detalles_transaccion_membresia_id_idx" ON "detalles_transaccion"("membresia_id");

-- CreateIndex
CREATE INDEX "detalles_transaccion_producto_id_idx" ON "detalles_transaccion"("producto_id");

-- CreateIndex
CREATE INDEX "detalles_transaccion_servicio_id_idx" ON "detalles_transaccion"("servicio_id");

-- CreateIndex
CREATE INDEX "detalles_transaccion_gasto_plantilla_id_idx" ON "detalles_transaccion"("gasto_plantilla_id");

-- CreateIndex
CREATE INDEX "gastos_plantilla_organizacion_id_sucursal_id_idx" ON "gastos_plantilla"("organizacion_id", "sucursal_id");

-- CreateIndex
CREATE UNIQUE INDEX "gastos_plantilla_id_organizacion_id_key" ON "gastos_plantilla"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "comprobantes_organizacion_id_idx" ON "comprobantes"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "comprobantes_transaccion_id_organizacion_id_key" ON "comprobantes"("transaccion_id", "organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "comprobantes_organizacion_id_numero_documento_key" ON "comprobantes"("organizacion_id", "numero_documento");

-- CreateIndex
CREATE INDEX "productos_organizacion_id_idx" ON "productos"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "productos_id_organizacion_id_key" ON "productos"("id", "organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "productos_organizacion_id_sku_key" ON "productos"("organizacion_id", "sku");

-- CreateIndex
CREATE INDEX "servicios_organizacion_id_idx" ON "servicios"("organizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "servicios_id_organizacion_id_key" ON "servicios"("id", "organizacion_id");

-- CreateIndex
CREATE INDEX "inventarios_organizacion_id_sucursal_id_idx" ON "inventarios"("organizacion_id", "sucursal_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventarios_producto_id_sucursal_id_key" ON "inventarios"("producto_id", "sucursal_id");

-- CreateIndex
CREATE INDEX "auditorias_organizacion_id_fecha_hora_idx" ON "auditorias"("organizacion_id", "fecha_hora");

-- CreateIndex
CREATE INDEX "auditorias_usuario_id_idx" ON "auditorias"("usuario_id");

-- CreateIndex
CREATE INDEX "notificaciones_usuario_destino_id_fecha_lectura_idx" ON "notificaciones"("usuario_destino_id", "fecha_lectura");

-- CreateIndex
CREATE INDEX "notificaciones_organizacion_id_idx" ON "notificaciones"("organizacion_id");

-- CreateIndex
CREATE INDEX "api_keys_organizacion_id_idx" ON "api_keys"("organizacion_id");

-- AddForeignKey
ALTER TABLE "sucursales" ADD CONSTRAINT "sucursales_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cajas_registradoras" ADD CONSTRAINT "cajas_registradoras_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cajas_registradoras" ADD CONSTRAINT "cajas_registradoras_sucursal_id_organizacion_id_fkey" FOREIGN KEY ("sucursal_id", "organizacion_id") REFERENCES "sucursales"("id", "organizacion_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cajas_registradoras" ADD CONSTRAINT "cajas_registradoras_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_sucursal_preferida_id_fkey" FOREIGN KEY ("sucursal_preferida_id") REFERENCES "sucursales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles_permisos" ADD CONSTRAINT "roles_permisos_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles_permisos" ADD CONSTRAINT "roles_permisos_permiso_id_fkey" FOREIGN KEY ("permiso_id") REFERENCES "permisos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones_acceso" ADD CONSTRAINT "asignaciones_acceso_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones_acceso" ADD CONSTRAINT "asignaciones_acceso_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones_acceso" ADD CONSTRAINT "asignaciones_acceso_sucursal_id_organizacion_id_fkey" FOREIGN KEY ("sucursal_id", "organizacion_id") REFERENCES "sucursales"("id", "organizacion_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones_acceso" ADD CONSTRAINT "asignaciones_acceso_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disciplinas" ADD CONSTRAINT "disciplinas_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfiles_staff" ADD CONSTRAINT "perfiles_staff_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfiles_staff" ADD CONSTRAINT "perfiles_staff_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_disciplinas" ADD CONSTRAINT "staff_disciplinas_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_disciplinas" ADD CONSTRAINT "staff_disciplinas_staff_id_organizacion_id_fkey" FOREIGN KEY ("staff_id", "organizacion_id") REFERENCES "perfiles_staff"("id", "organizacion_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_disciplinas" ADD CONSTRAINT "staff_disciplinas_disciplina_id_organizacion_id_fkey" FOREIGN KEY ("disciplina_id", "organizacion_id") REFERENCES "disciplinas"("id", "organizacion_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos_trabajo" ADD CONSTRAINT "turnos_trabajo_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos_trabajo" ADD CONSTRAINT "turnos_trabajo_staff_id_organizacion_id_fkey" FOREIGN KEY ("staff_id", "organizacion_id") REFERENCES "perfiles_staff"("id", "organizacion_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos_trabajo" ADD CONSTRAINT "turnos_trabajo_sucursal_id_organizacion_id_fkey" FOREIGN KEY ("sucursal_id", "organizacion_id") REFERENCES "sucursales"("id", "organizacion_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos_plantilla" ADD CONSTRAINT "turnos_plantilla_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos_plantilla" ADD CONSTRAINT "turnos_plantilla_staff_id_organizacion_id_fkey" FOREIGN KEY ("staff_id", "organizacion_id") REFERENCES "perfiles_staff"("id", "organizacion_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos_plantilla" ADD CONSTRAINT "turnos_plantilla_sucursal_id_organizacion_id_fkey" FOREIGN KEY ("sucursal_id", "organizacion_id") REFERENCES "sucursales"("id", "organizacion_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salas" ADD CONSTRAINT "salas_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salas" ADD CONSTRAINT "salas_sucursal_id_organizacion_id_fkey" FOREIGN KEY ("sucursal_id", "organizacion_id") REFERENCES "sucursales"("id", "organizacion_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clases_plantilla_planes" ADD CONSTRAINT "clases_plantilla_planes_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clases_plantilla_planes" ADD CONSTRAINT "clases_plantilla_planes_clase_plantilla_id_organizacion_id_fkey" FOREIGN KEY ("clase_plantilla_id", "organizacion_id") REFERENCES "clases_plantilla"("id", "organizacion_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clases_plantilla_planes" ADD CONSTRAINT "clases_plantilla_planes_plan_id_organizacion_id_fkey" FOREIGN KEY ("plan_id", "organizacion_id") REFERENCES "planes"("id", "organizacion_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clases_programadas" ADD CONSTRAINT "clases_programadas_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clases_programadas" ADD CONSTRAINT "clases_programadas_sucursal_id_organizacion_id_fkey" FOREIGN KEY ("sucursal_id", "organizacion_id") REFERENCES "sucursales"("id", "organizacion_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clases_programadas" ADD CONSTRAINT "clases_programadas_disciplina_id_organizacion_id_fkey" FOREIGN KEY ("disciplina_id", "organizacion_id") REFERENCES "disciplinas"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clases_programadas" ADD CONSTRAINT "clases_programadas_entrenador_id_organizacion_id_fkey" FOREIGN KEY ("entrenador_id", "organizacion_id") REFERENCES "perfiles_staff"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clases_programadas" ADD CONSTRAINT "clases_programadas_turno_id_organizacion_id_fkey" FOREIGN KEY ("turno_id", "organizacion_id") REFERENCES "turnos_trabajo"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clases_programadas" ADD CONSTRAINT "clases_programadas_clase_plantilla_id_organizacion_id_fkey" FOREIGN KEY ("clase_plantilla_id", "organizacion_id") REFERENCES "clases_plantilla"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clases_programadas" ADD CONSTRAINT "clases_programadas_sala_id_organizacion_id_fkey" FOREIGN KEY ("sala_id", "organizacion_id") REFERENCES "salas"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clases_plantilla" ADD CONSTRAINT "clases_plantilla_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clases_plantilla" ADD CONSTRAINT "clases_plantilla_sucursal_id_organizacion_id_fkey" FOREIGN KEY ("sucursal_id", "organizacion_id") REFERENCES "sucursales"("id", "organizacion_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clases_plantilla" ADD CONSTRAINT "clases_plantilla_disciplina_id_organizacion_id_fkey" FOREIGN KEY ("disciplina_id", "organizacion_id") REFERENCES "disciplinas"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clases_plantilla" ADD CONSTRAINT "clases_plantilla_entrenador_id_organizacion_id_fkey" FOREIGN KEY ("entrenador_id", "organizacion_id") REFERENCES "perfiles_staff"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clases_plantilla" ADD CONSTRAINT "clases_plantilla_sala_id_organizacion_id_fkey" FOREIGN KEY ("sala_id", "organizacion_id") REFERENCES "salas"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas_clases" ADD CONSTRAINT "reservas_clases_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas_clases" ADD CONSTRAINT "reservas_clases_clase_id_organizacion_id_fkey" FOREIGN KEY ("clase_id", "organizacion_id") REFERENCES "clases_programadas"("id", "organizacion_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservas_clases" ADD CONSTRAINT "reservas_clases_cliente_id_organizacion_id_fkey" FOREIGN KEY ("cliente_id", "organizacion_id") REFERENCES "clientes"("id", "organizacion_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_sucursal_base_id_organizacion_id_fkey" FOREIGN KEY ("sucursal_base_id", "organizacion_id") REFERENCES "sucursales"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promociones" ADD CONSTRAINT "promociones_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planes" ADD CONSTRAINT "planes_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresias" ADD CONSTRAINT "membresias_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresias" ADD CONSTRAINT "membresias_sucursal_id_organizacion_id_fkey" FOREIGN KEY ("sucursal_id", "organizacion_id") REFERENCES "sucursales"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresias" ADD CONSTRAINT "membresias_cliente_id_organizacion_id_fkey" FOREIGN KEY ("cliente_id", "organizacion_id") REFERENCES "clientes"("id", "organizacion_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresias" ADD CONSTRAINT "membresias_plan_id_organizacion_id_fkey" FOREIGN KEY ("plan_id", "organizacion_id") REFERENCES "planes"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresias" ADD CONSTRAINT "membresias_promocion_id_organizacion_id_fkey" FOREIGN KEY ("promocion_id", "organizacion_id") REFERENCES "promociones"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresias" ADD CONSTRAINT "membresias_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pausas_membresia" ADD CONSTRAINT "pausas_membresia_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pausas_membresia" ADD CONSTRAINT "pausas_membresia_membresia_id_organizacion_id_fkey" FOREIGN KEY ("membresia_id", "organizacion_id") REFERENCES "membresias"("id", "organizacion_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pausas_membresia" ADD CONSTRAINT "pausas_membresia_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_asistencia" ADD CONSTRAINT "registros_asistencia_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_asistencia" ADD CONSTRAINT "registros_asistencia_sucursal_id_organizacion_id_fkey" FOREIGN KEY ("sucursal_id", "organizacion_id") REFERENCES "sucursales"("id", "organizacion_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_asistencia" ADD CONSTRAINT "registros_asistencia_cliente_id_organizacion_id_fkey" FOREIGN KEY ("cliente_id", "organizacion_id") REFERENCES "clientes"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_asistencia" ADD CONSTRAINT "registros_asistencia_membresia_id_organizacion_id_fkey" FOREIGN KEY ("membresia_id", "organizacion_id") REFERENCES "membresias"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_asistencia" ADD CONSTRAINT "registros_asistencia_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas_bancarias" ADD CONSTRAINT "cuentas_bancarias_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proveedores" ADD CONSTRAINT "proveedores_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aperturas_caja" ADD CONSTRAINT "aperturas_caja_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aperturas_caja" ADD CONSTRAINT "aperturas_caja_caja_id_organizacion_id_fkey" FOREIGN KEY ("caja_id", "organizacion_id") REFERENCES "cajas_registradoras"("id", "organizacion_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aperturas_caja" ADD CONSTRAINT "aperturas_caja_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacciones" ADD CONSTRAINT "transacciones_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacciones" ADD CONSTRAINT "transacciones_sucursal_id_organizacion_id_fkey" FOREIGN KEY ("sucursal_id", "organizacion_id") REFERENCES "sucursales"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacciones" ADD CONSTRAINT "transacciones_apertura_caja_id_organizacion_id_fkey" FOREIGN KEY ("apertura_caja_id", "organizacion_id") REFERENCES "aperturas_caja"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacciones" ADD CONSTRAINT "transacciones_cliente_id_organizacion_id_fkey" FOREIGN KEY ("cliente_id", "organizacion_id") REFERENCES "clientes"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacciones" ADD CONSTRAINT "transacciones_proveedor_id_organizacion_id_fkey" FOREIGN KEY ("proveedor_id", "organizacion_id") REFERENCES "proveedores"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacciones" ADD CONSTRAINT "transacciones_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_transaccion_id_organizacion_id_fkey" FOREIGN KEY ("transaccion_id", "organizacion_id") REFERENCES "transacciones"("id", "organizacion_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_cuenta_bancaria_id_organizacion_id_fkey" FOREIGN KEY ("cuenta_bancaria_id", "organizacion_id") REFERENCES "cuentas_bancarias"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_transaccion" ADD CONSTRAINT "detalles_transaccion_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_transaccion" ADD CONSTRAINT "detalles_transaccion_transaccion_id_organizacion_id_fkey" FOREIGN KEY ("transaccion_id", "organizacion_id") REFERENCES "transacciones"("id", "organizacion_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_transaccion" ADD CONSTRAINT "detalles_transaccion_membresia_id_organizacion_id_fkey" FOREIGN KEY ("membresia_id", "organizacion_id") REFERENCES "membresias"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_transaccion" ADD CONSTRAINT "detalles_transaccion_producto_id_organizacion_id_fkey" FOREIGN KEY ("producto_id", "organizacion_id") REFERENCES "productos"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_transaccion" ADD CONSTRAINT "detalles_transaccion_servicio_id_organizacion_id_fkey" FOREIGN KEY ("servicio_id", "organizacion_id") REFERENCES "servicios"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_transaccion" ADD CONSTRAINT "detalles_transaccion_gasto_plantilla_id_organizacion_id_fkey" FOREIGN KEY ("gasto_plantilla_id", "organizacion_id") REFERENCES "gastos_plantilla"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_plantilla" ADD CONSTRAINT "gastos_plantilla_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_plantilla" ADD CONSTRAINT "gastos_plantilla_sucursal_id_organizacion_id_fkey" FOREIGN KEY ("sucursal_id", "organizacion_id") REFERENCES "sucursales"("id", "organizacion_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_plantilla" ADD CONSTRAINT "gastos_plantilla_proveedor_id_organizacion_id_fkey" FOREIGN KEY ("proveedor_id", "organizacion_id") REFERENCES "proveedores"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gastos_plantilla" ADD CONSTRAINT "gastos_plantilla_cuenta_bancaria_id_organizacion_id_fkey" FOREIGN KEY ("cuenta_bancaria_id", "organizacion_id") REFERENCES "cuentas_bancarias"("id", "organizacion_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comprobantes" ADD CONSTRAINT "comprobantes_transaccion_id_organizacion_id_fkey" FOREIGN KEY ("transaccion_id", "organizacion_id") REFERENCES "transacciones"("id", "organizacion_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventarios" ADD CONSTRAINT "inventarios_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventarios" ADD CONSTRAINT "inventarios_producto_id_organizacion_id_fkey" FOREIGN KEY ("producto_id", "organizacion_id") REFERENCES "productos"("id", "organizacion_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventarios" ADD CONSTRAINT "inventarios_sucursal_id_organizacion_id_fkey" FOREIGN KEY ("sucursal_id", "organizacion_id") REFERENCES "sucursales"("id", "organizacion_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditorias" ADD CONSTRAINT "auditorias_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditorias" ADD CONSTRAINT "auditorias_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_usuario_destino_id_fkey" FOREIGN KEY ("usuario_destino_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organizacion_id_fkey" FOREIGN KEY ("organizacion_id") REFERENCES "organizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ==============================================================
-- Restricciones que Prisma no puede declarar en schema.prisma
-- (antes: prisma/constraints.sql, aplicado después de db push).
-- ==============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_caja_una_apertura_abierta
  ON aperturas_caja (caja_id)
  WHERE estado = 'ABIERTA';

CREATE UNIQUE INDEX IF NOT EXISTS uq_usuario_un_turno_abierto
  ON aperturas_caja (usuario_id)
  WHERE estado = 'ABIERTA';
