# Plan: portal del cliente

Rama `portal-cliente`. Alcance acordado el 2026-09-28:

1. El cliente entra con su propia cuenta. La cuenta se crea desde su ficha y lleva el rol CLIENTE.
2. **Mi membresía:** qué plan tiene, cuándo vence, cuántas sesiones le quedan y el historial de pagos.
3. **Mis asistencias:** sus ingresos recientes.
4. **Clases:** ver el horario, reservar y cancelar, con las mismas reglas de acceso que usa recepción.
5. Pantalla pensada para el celular, separada del panel del gimnasio (`/portal`).

Queda fuera por ahora: pagar en línea, que el cliente edite sus datos, avisos automáticos (tema siguiente).

## Decisión: cómo se une la cuenta con la ficha

**CAMBIO DE BASE DE DATOS (DB-6): columna opcional `clientes.usuario_id`**, elegida por el usuario el 2026-09-28.

- `usuario_id uuid NULL` → `usuarios.id` (al borrar la cuenta queda en NULL).
- Única por organización: `@@unique([organizacionId, usuarioId])`. No es única global a propósito: una misma persona puede ser cliente de dos gimnasios con una sola cuenta, y al entrar elige el gimnasio (el login ya lo permite).
- Migración: `pnpm db:migrate --name portal_cliente`.
- Alternativa descartada, sin cambio de BD: unir por correo. Se rompía al editar el correo y confundía clientes con el mismo correo.

## Seguridad

- El rol CLIENTE hoy trae `reservas:crear/leer/eliminar` y `membresias:leer`. Con esos permisos un cliente podría llamar a `/reservas` o `/membresias` y **ver o crear reservas de otros clientes**. **Se le quitan todos los permisos** (dato en `prisma/base.ts`, no es cambio de estructura): el portal usa rutas propias `/portal/*` que solo leen y tocan la ficha de quien entra.
- Guard `PortalClienteGuard`: exige rol CLIENTE y una ficha enlazada en esa organización, y deja el `clienteId` en el contexto (CLS). Las rutas del portal nunca reciben un `clienteId` desde el navegador.
- Revisar las rutas que solo piden sesión (sin `@RequirePermissions`) para que un cliente no obtenga datos del gimnasio por ahí.
- El panel `/dashboard` manda al cliente a `/portal`, y `/portal` manda al equipo a `/dashboard`.

## Estado (2026-09-28)

Las 4 fases están hechas y probadas: fase 1 `c42875d`, fase 2 `4208229`, fase 3 `2bd3c7b`, fase 4 en el commit que agrega este estado. Cuenta de prueba del seed: `juan.titan@ejemplo.com` / `juan123` (Gym Titan).

Probado en el navegador a 390 px: recepción (limitada a una sucursal) da acceso a un cliente nuevo desde su ficha; el cliente entra con el formulario real y llega a `/portal`; sin membresía ve el motivo en cada clase; con membresía reserva, se anota en la lista de espera y sube sola cuando otro cancela; al quitarle el acceso, su sesión se cierra.

Pendiente para más adelante: avisarle al cliente (correo o WhatsApp automático) cuando sube de la lista de espera, que llega con el tema de avisos automáticos.

## Fases (un commit por fase)

### Fase 1 — Base de datos y API del portal
- Migración DB-6 y rol CLIENTE sin permisos.
- `modules/portal`: guard + servicio + controller.
  - `GET /portal/yo`: nombre, gimnasio, membresía vigente (plan, vence, sesiones restantes, estado).
  - `GET /portal/membresias`: historial de membresías con lo pagado.
  - `GET /portal/asistencias`: últimos ingresos (paginado).
  - `GET /portal/clases?desde&hasta`: sesiones activas de las próximas 2 semanas, con cupos libres, mi reserva (si tengo) y si puedo reservar y por qué no (`evaluarReserva`).
  - `POST /portal/clases/:id/reservar` (con lista de espera si está llena) y `POST /portal/reservas/:id/cancelar`: reutilizan `ReservaClaseService` para no duplicar reglas.
  - `PUT /portal/contrasena`: cambia su contraseña temporal (pide la actual).
- Pruebas Vitest del guard y de que las reservas no pueden tocar a otro cliente.

### Fase 2 — Dar acceso desde la ficha del cliente
- En la ficha: tarjeta **"Acceso al portal"** con tres acciones: dar acceso, restablecer contraseña y quitar acceso. Permiso `clientes:actualizar` (dueño y recepción).
- Dar acceso usa el correo de la ficha (si no tiene, lo pide):
  - correo nuevo → crea la cuenta con contraseña temporal, que se muestra una sola vez para dictarla o mandarla por WhatsApp (igual que en Equipo);
  - correo de una cuenta de otro gimnasio → reutiliza la cuenta, sin tocar su contraseña;
  - correo de alguien del equipo de este gimnasio → se rechaza con un mensaje claro.
- Restablecer contraseña solo si la cuenta es solo de este gimnasio (`cuentaSoloDeEstaOrganizacion`).
- Todo con `registrarAuditoria` y limpieza de la caché `rbac:*` al quitar el acceso.

### Fase 3 — Pantallas del portal (celular primero)
- Layout `/portal` con barra inferior: **Inicio**, **Clases**, **Asistencias**, **Cuenta**.
- Inicio: tarjeta grande de la membresía ("Te quedan 12 días" / "8 sesiones") y mis próximas clases reservadas.
- Clases: lista por día; botón Reservar / Anotarme en espera / Cancelar; si no puede, el motivo en claro.
- Asistencias: lista simple con fecha, hora y sucursal.
- Cuenta: cambiar contraseña, cerrar sesión y el historial de membresías.
- Redirecciones del login según el rol.

### Fase 4 — Pruebas en navegador y datos del seed
- El seed suma un cliente con acceso al portal (Juan) para probar.
- Recorrido completo en 390px: dar acceso como recepción → entrar como cliente → reservar, cancelar y lista de espera → quitar acceso.
