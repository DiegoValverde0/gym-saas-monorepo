# Plan: avisos automáticos

Rama `avisos-automaticos`. Decidido con el usuario el 2026-09-28:

- **Canales:** dentro del sistema (portal del cliente) y **WhatsApp con un clic** para recepción. Sin correo ni WhatsApp automático por ahora (el primero pide una cuenta de envío; el segundo, la API de Meta, que cobra por mensaje y pide verificar la empresa).
- **Avisos:**

| Aviso | Cuándo | Portal del cliente | Lista de WhatsApp de recepción |
|---|---|---|---|
| Membresía por vencer | 3 días antes y el día que vence | Sí (dos avisos) | Sí (uno por membresía) |
| Membresía vencida | Los 3 días después de vencer, si no renovó | Sí | Sí |
| Ya tienes lugar | Al subir de la lista de espera | Sí, en el acto | Sí |
| Se canceló tu clase | Cuando el gimnasio cancela una sesión que tenía reservada | Sí, en el acto | Sí |
| Recordatorio de clase | Unas 3 horas antes de su clase reservada | Sí | No (serían demasiados) |

Si el cliente ya renovó (tiene otra membresía activa o por empezar), no se le avisa que vence ni que venció.

## Sin cambios de base de datos

- Los avisos del portal usan la tabla `notificaciones`, que ya existe y no se usaba. Cada aviso se guarda con un `tipo` como `POR_VENCER:<membresía>` o `RECORDATORIO:<reserva>`: así no se repite aunque el proceso corra cada hora.
- La lista de WhatsApp se arma en el momento a partir de las membresías. "Ya avisé" se guarda en Redis (60 días). "Ya tienes lugar" y "Se canceló tu clase" se anotan en Redis cuando pasan, porque después ya no se pueden deducir de las reservas. En producción Redis guarda en disco (`appendonly yes`); si esos datos se perdieran, solo reaparecería o faltaría un recordatorio para recepción, nunca un aviso del portal.

## Estado (2026-09-28)

Las 4 fases están hechas: API `fa57bff`, portal `e0cd2e0`, panel `14275e2` y este cierre.

Probado contra la API real (22 comprobaciones): "¡Ya tienes lugar!" al cancelar otro cliente, "Se canceló tu clase" al cancelar la sesión, por vencer y recordatorio desde el proceso de cada hora (correrlo dos veces no repite avisos), leídos, "hecho" en la lista de WhatsApp, recepción limitada a una sucursal ve la lista y un cliente no. En el navegador: campana del portal a 390 px y campana del panel en modo claro y oscuro.

Para más adelante: dejar que el dueño cambie los días y horas de aviso (hoy fijos en `avisos.util.ts`), y correo o WhatsApp automático si hace falta.

## Fases (un commit por fase)

1. **API.** Módulo `avisos`: proceso cada hora por organización (por vencer, vencida y recordatorios), avisos en el acto al subir de la lista de espera y al cancelar una sesión, `GET/POST /portal/avisos` y `GET /avisos/whatsapp` + `POST /avisos/whatsapp/:clave/hecho`. Pruebas Vitest.
2. **Portal.** Campana con los avisos sin leer en la cabecera y pantalla de avisos; al abrirla quedan leídos.
3. **Panel.** Campana "Avisos para enviar" en la barra superior (dueño y recepción, permiso `membresias:crear`): cada aviso con el mensaje ya escrito, botón de WhatsApp y "Hecho". Sin teléfono: se puede marcar como hecho.
4. **Pruebas en navegador** y `pnpm db:reset`.
