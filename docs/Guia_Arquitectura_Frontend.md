# Guía de Arquitectura para Diseño Frontend (Gym Manager SaaS)

Este documento está diseñado para proporcionar a los diseñadores y desarrolladores frontend una comprensión clara de la estructura actual del proyecto Gym Manager (SaaS Multi-tenant). El objetivo es que puedan integrar el nuevo diseño visual (por ejemplo, generado vía Google Stitch) entendiendo perfectamente cómo se comunican las distintas capas de nuestra aplicación.

## 1. El Modelo de Datos (Prisma Schema)
Nuestra base de datos está modelada con **Prisma** sobre **PostgreSQL**. Es un sistema SaaS multi-tenant, lo que significa que varios gimnasios (clientes) usan el mismo sistema de forma simultánea pero aislada.

### Concepto Clave: Aislamiento por `Organizacion`
- **Organización (Tenant):** Todo en el sistema (clientes, ingresos, planes) pertenece a un gimnasio.
- **Sucursal:** Un gimnasio puede tener múltiples sucursales físicas.
- **Identidad Global:** Los `Usuarios` (empleados, dueños) tienen una cuenta única en todo el sistema. Su acceso, roles y pertenencia a un gimnasio se definen mediante una asignación de acceso.
- **Seguridad:** A nivel de base de datos, cada registro (ej. una membresía) requiere su ID propio y el ID de la organización. Esto evita estrictamente que los datos de un gimnasio se mezclen con los de otro.

### Módulos Principales de Datos
1. **Core Institucional:** `Organizacion`, `Sucursal`, `CajaRegistradora`.
2. **Seguridad y Accesos (RBAC):** `Usuario`, `Rol`, `Permiso`, `AsignacionAcceso`.
3. **Personal y Horarios:** `Staff`, `Disciplinas`, `ClasesProgramadas`.
4. **Clientes y Membresías:** `Cliente`, `Plan`, `Promocion`, `Membresia`, `RegistroAsistencia`.
5. **Finanzas:** `Transaccion`, `Pago`, `AperturaCaja`, `CuentaBancaria`.

---

## 2. El Backend (API NestJS)
El backend está construido con **NestJS** (`apps/api`) y estructurado de forma modular y limpia.

### Estructura de Módulos
Cada entidad importante tiene un módulo correspondiente (ej. `clientes`, `membresia`, `auth`, `dashboard`). Dentro de cada módulo encontrarás:
- **Controladores (`*.controller.ts`):** Exponen los endpoints REST (ej. `GET /clientes`, `POST /membresia`). Es el "puente" que recibe la petición del frontend.
- **Servicios (`*.service.ts`):** Contienen toda la lógica de negocio pesada (cálculo de descuentos, validación de membresías vencidas, atomicidad financiera).
- **Seguridad (Guards):** Todo endpoint está protegido de forma centralizada por autenticación con Token JWT (`JwtAuthGuard`) y permisos por módulo (`RolesGuard`).

### Interceptores Globales
Usamos interceptores en NestJS para estandarizar la respuesta de la API. Todo JSON que devuelve el backend (ya sea un éxito o un error) viene envuelto en una estructura estandarizada. El frontend solo tiene que "desenvolver" la propiedad `data`.

---

## 3. El Frontend Actual (Next.js)
El frontend (`apps/web`) está construido con **Next.js 14 (App Router)**, **React 18** y estilizado con **TailwindCSS**. Actualmente es completamente funcional pero visualmente es "básico" y carece de dinamismo.

### Estructura del Proyecto Web (`apps/web/src`)
- `/app`: Define las rutas y páginas de la aplicación (Dashboard, Login, Clientes, Punto de Venta, etc.).
- `/components`: Componentes visuales reutilizables de UI (modales, formularios, botones).
- `/lib`: Utilidades y configuración.
- `/hooks` y `/store`: Lógica de estado global y peticiones a la API.
- `middleware.ts`: Archivo clave que se ejecuta en el servidor antes de cargar una página para verificar si el usuario tiene una sesión válida, redirigiendo al login si no la tiene.

### Cómo se conecta el Frontend con el Backend
1. **Autenticación (JWT):** Cuando un usuario ingresa sus credenciales en el Login, el backend devuelve un Token (JWT). El frontend lo guarda y lo utiliza como "llave" para el resto del uso de la app.
2. **Peticiones HTTP:** Para pintar la lista de clientes o cobrar una membresía, el frontend envía peticiones HTTP (mediante `fetch` o clientes como Axios/React Query) a la API, adjuntando siempre el JWT en las cabeceras (`Authorization: Bearer <token>`).
3. **Manejo del Tenant (Superadmins):** Para los administradores globales que gestionan múltiples gimnasios, el frontend envía una cabecera adicional (`x-tenant-id`) que le dice al backend sobre qué gimnasio se están consultando los datos.

### Consideraciones Críticas para el Diseñador Frontend
1. **Separación de Lógica y UI:** El diseñador frontend puede concentrarse 100% en crear un marcado HTML/JSX hermoso y las clases de Tailwind. No necesita preocuparse por cómo hacer el `fetch` al backend; nosotros acoplaremos la lógica de datos a sus componentes puros.
2. **TailwindCSS Nativo:** La integración de la nueva UI será directa ya que nuestro proyecto ya usa TailwindCSS. Actualizaremos el `tailwind.config.ts` y la hoja de estilos global con la nueva paleta de colores (prioridad Modo Claro), tipografías premium y variables.
3. **Modularidad:** Se espera que el nuevo diseño sea entregado en componentes aislados (ej. `ClientCard`, `DashboardChart`, `Sidebar`) para inyectarles los datos dinámicos fácilmente.
