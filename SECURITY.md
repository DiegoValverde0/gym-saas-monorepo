# Seguridad

## Avisar de una vulnerabilidad

Si encuentras un problema de seguridad, **no abras un issue público**: avísalo en privado desde la pestaña **Security** del repositorio, con **Report a vulnerability**. Incluye qué encontraste, cómo reproducirlo y qué podría hacer alguien con eso.

Respondemos lo antes posible y te contamos cuándo queda arreglado.

## Qué se revisa solo

En cada cambio (ver `.github/workflows/`):

- **Secretos** en el código y en todo el historial de git (gitleaks).
- **Vulnerabilidades en las dependencias** de producción (`scripts/revisar-dependencias.mjs`): falla con una alta o crítica nueva.
- **Análisis del código** (CodeQL): inyecciones, rutas peligrosas y errores conocidos.
- **Dependabot** propone cada semana las versiones nuevas y, apenas sale, la que arregla una vulnerabilidad.

## Para quien trabaja en el código

- Los secretos van solo en variables de entorno (`.env`, `.env.produccion`), nunca en el código ni en un commit. Los archivos `.example` llevan valores de muestra.
- Si un secreto llega a subirse, **cámbialo de inmediato** (base de datos, `JWT_SECRET`): el repositorio es público y lo publicado no se puede borrar del todo.
- Las cuentas de prueba del seed son solo para bases de prueba. En producción se usa `prisma/inicial.ts`.

Las medidas y lo que falta están en [docs/plan-seguridad.md](docs/plan-seguridad.md).
