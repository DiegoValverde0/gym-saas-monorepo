# Disertación del Sistema Gym Manager SaaS

Este documento está diseñado como una guía estructurada para exponer o presentar el proyecto a stakeholders, evaluadores o equipos técnicos. Organiza las características clave del repositorio en "Slides" o Secciones Lógicas.

---

## Slide 1: Visión General y Arquitectura
**Título**: Un Ecosistema Moderno y Escalable

- **El Problema**: Construir un sistema Multi-Tenant (SaaS) donde múltiples gimnasios puedan operar en la misma base de datos sin riesgo de fuga de información.
- **La Solución**: Un monorepositorio potenciado por Turborepo.
  - **Backend**: NestJS (puerto 3001) para orquestación, seguridad y lógica de negocio.
  - **Frontend**: Next.js App Router con React 18 (puerto 3000), enfocado en velocidad y diseño de alta calidad (Tailwind v4, Shadcn).
  - **Persistencia**: Prisma ORM sobre PostgreSQL, respaldado por Redis para el manejo de caché ultrarrápida.

---

## Slide 2: Seguridad Multi-Tenant Inquebrantable (RLS)
**Título**: Aislamiento de Datos Nivel Empresarial

- **¿Cómo evitamos que el "Gym A" vea los datos del "Gym B"?**
  - **Prisma Client Extensions**: Hemos interceptado el ORM a bajo nivel. Cada vez que el backend intenta hacer un `findMany`, `count`, o `aggregate` (estadísticas), Prisma captura la petición y le **inyecta automáticamente** el identificador del tenant en la consulta SQL subyacente.
  - **Contexto Seguro (CLS)**: Al recibir un token JWT, el guardián de NestJS averigua a qué organización pertenece el usuario y graba ese ID en un "Storage Local por Petición". El programador no tiene que preocuparse por filtrar los datos manualmente; el sistema lo hace por él.

---

## Slide 3: Roles y Permisos (RBAC Dinámico)
**Título**: Control Total de Accesos

- **La Estructura**: Todo el acceso se rige por un string compuesto: `accion:modulo` (ej. `usuarios:crear`, `cajas:leer`).
- **El Flujo Backend**: Un decorador `@RequirePermissions()` protege los endpoints. El servidor cruza esta exigencia con los roles del usuario. Para no saturar la base de datos, el árbol de permisos de cada usuario se compila y se guarda en la memoria ultrarrápida de **Redis**.
- **La UI Protegida**: En el Frontend, los botones y páginas están envueltos en un componente `<Protect>`. Si un recepcionista no tiene permiso para borrar facturas, el botón de borrado simplemente no existe en su pantalla.

---

## Slide 4: El Core de Negocio (Membresías y Clientes)
**Título**: Flexibilidad en la Venta

- **Estructura Dinámica**:
  - Un **Cliente** es una entidad registrada en una Sucursal Base.
  - Un **Plan** es el servicio a vender (Ej: Plan Mensual Pesas).
  - Una **Promoción** es un descuento que se le puede inyectar al plan de manera dinámica (porcentual o fijo).
  - Una **Membresía** es el resultado: La unión del Cliente con el Plan, definiendo sus fechas de expiración.
- Al vender una membresía, el precio "Final" se congela (historial intacto) para que si el gimnasio sube sus precios el año siguiente, el reporte financiero del pasado no se rompa.

---

## Slide 5: Operativa Financiera y Flujo de Caja
**Título**: Trazabilidad del Dinero al Céntimo

- **La Separación del Dinero**:
  - Todo dinero digital (Transferencias, Tarjetas, QR) va directamente a **Cuentas Bancarias**.
  - Todo dinero en **Efectivo** exige que el cajero tenga una **Apertura de Caja** iniciada.
- **Transacciones y Transacciones de Prisma**: Al procesar una venta, el pago (con métodos múltiples o mixtos) y la activación de la membresía ocurren dentro de un `$transaction` atómico de Prisma. Si el monto no cuadra matemáticamente por un céntimo, la venta entera se revierte y no se genera registro alguno.

---

## Slide 6: Interfaz de Usuario (UI) y Estandarización
**Título**: Estética Premium y Experiencia de Usuario

- **Consistencia Visual**: Se ha desarrollado un `<GlobalFormModal>` que maneja validaciones (Zod), tooltips de error, e inputs unificados para no tener que reinventar modales en cada módulo.
- **Prevención de Errores (Soft Delete)**: Cualquier intento de borrado dispara un "Toast" (notificación) con una cuenta regresiva de 5 segundos. El usuario tiene tiempo de hacer clic en **Deshacer** antes de que la petición de borrado golpee el servidor.
- **Visualización Compleja**: Vistas como el *Historial de Transacciones* utilizan Acordeones responsivos que empaquetan el detalle extenso (qué compró, quién lo atendió, cómo pagó) en una línea elegante y expandible. Dashboard con gráficos generados a través de las métricas agregadas del RLS.
