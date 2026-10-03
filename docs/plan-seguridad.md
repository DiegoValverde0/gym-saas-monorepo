# Plan: seguridad del sistema

Pedido del usuario (2026-10-02): poner las medidas de seguridad que faltan para que el sistema aguante ataques (abuso, fuerza bruta, denegación de servicio) y código malicioso, con todo configurable (nada fijo en el código), sin secretos en el repositorio ni en su historial, y con el código limpio y fácil de mantener.

Este plan sale de revisar el código, la configuración de producción y los 125 commits del historial (2026-10-02).

---

## 1. Lo que ya está bien (se conserva)

| Tema | Cómo está hoy |
|---|---|
| Sesión | El token vive en una cookie `HttpOnly`, `SameSite=strict` y `Secure` en producción; nunca en JavaScript. Al cerrar sesión, el token se revoca en Redis. |
| Secreto de las sesiones | `JWT_SECRET` obligatorio: la API no arranca sin él (y la web tampoco valida sin él). |
| Contraseñas | scrypt con sal y comparación en tiempo constante; mínimo 8 caracteres. El login responde lo mismo si el correo no existe o la clave está mal. |
| Límite de peticiones | 100 por minuto por IP en toda la API (`THROTTLE_LIMIT`) y 5 por minuto en `/auth/login`. |
| PIN del kiosco y del personal | Bloqueo de 5 minutos tras varios intentos fallidos (en Redis). El PIN se guarda con hash y no sale del servidor. |
| Entradas | Validación global estricta: se rechazan los campos que no están en el DTO. |
| SQL | Todo parametrizado (no hay `$queryRawUnsafe`); la reportería arma el SQL solo con piezas fijas de su catálogo. |
| Aislamiento entre gimnasios | Filtro por organización en cada consulta (extensión RLS de Prisma) y, en el SQL directo, a mano. |
| Cabeceras de la API | `helmet`. CORS solo para los dominios de `FRONTEND_URL`. |
| Errores | Los errores internos responden un mensaje genérico; el detalle va solo al registro del servidor. |
| Producción | HTTPS automático (Caddy); la base y Redis no se exponen afuera; los contenedores corren sin root (`USER node`); respaldos diarios. |
| Auditoría | Las acciones sensibles quedan registradas (`registrarAuditoria`). |
| Secretos en git | **Nunca se subió un `.env` real.** En los 125 commits no hay claves privadas, tokens de nube ni secretos de producción: solo los archivos `.example` con valores de muestra, el secreto de prueba del CI (para una base que se crea y se borra) y las contraseñas de las cuentas de prueba (ver 2.4). |

---

## 2. Lo que falta, de lo más a lo menos urgente

### 2.1 Dependencias con vulnerabilidades conocidas (`pnpm audit --prod`)

76 avisos: **2 críticos, 30 altos**, 37 moderados y 7 bajos. Casi todos son de denegación de servicio.

| De dónde vienen | Avisos | Arreglo |
|---|---|---|
| **Next.js 14** (incluye los 2 críticos) | 23 | Pasar a Next 15 (cambio grande: React 19). Mitiga que no se usen `next/image` ni Server Actions, pero algunos afectan a cualquier app con App Router. |
| **`shadcn` como dependencia de producción** (undici, js-yaml, hono, ip-address, fast-uri...) | ~25 | `shadcn` es una herramienta de línea de comandos para generar componentes: va en `devDependencies`. Sin tocar código. |
| **NestJS 10** (multer, qs, body-parser, file-type) | ~14 | Pasar a NestJS 11 (usa Express 5) o forzar versiones arregladas. Multer no se usa (no hay subida de archivos), así que el riesgo real es bajo. |
| exceljs (brace-expansion, uuid) | ~10 | Forzar versiones arregladas (`pnpm.overrides`). |

Además, nada avisa cuando sale una vulnerabilidad nueva: no hay revisión de dependencias en el CI ni Dependabot.

### 2.2 Límites de peticiones

- Los contadores viven **en la memoria de cada proceso**: se reinician al reiniciar la API y no se comparten si un día hay dos instancias. Redis ya está: deben vivir ahí.
- El login limita por IP, pero **no por cuenta**: alguien con muchas IP puede probar claves contra una misma cuenta sin límite.
- **Un correo que no existe responde más rápido** (no calcula el hash), y eso deja adivinar qué correos están registrados.
- Lo que más cuesta al servidor (exportar a Excel, correr reportes, crear organizaciones) tiene el mismo límite que una consulta liviana.
- Los valores están repartidos (el 5 del login está escrito en el controlador).

### 2.3 Cabeceras de la web y protección en el borde

- **Las páginas de la web no llevan cabeceras de seguridad** (la API sí, por helmet): falta HSTS, `X-Frame-Options` / `frame-ancestors` (que nadie meta el sistema en un iframe para engañar clics), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` y una política de contenido (CSP) que limite de dónde se cargan scripts.
- Caddy no limita el tamaño de lo que recibe ni corta conexiones lentas.
- **Denegación de servicio:** contra un ataque grande, ningún código en un solo servidor alcanza; lo que sirve es un servicio delante que lo absorba. Lo habitual (y gratis) es Cloudflare como proxy del DNS. Hoy la guía de despliegue no lo menciona.
- La cookie dura 7 días pero el token 1 día: después del primer día la cookie sigue llegando con un token vencido. Deben durar lo mismo.

### 2.4 Configuración, datos fijos y secretos

- **El seed no tiene freno**: `pnpm db:reset` / `db:seed` contra una base de producción la borraría y crearía cuentas con contraseñas conocidas. Producción usa `prisma/inicial.ts` (bien), pero nada impide el error.
- **Contraseñas de las cuentas de prueba escritas en 3 lugares** (seed, pruebas e2e y la caja "Cuentas de prueba" del login). No son secretos (solo existen en bases de prueba y no llegan al navegador en producción: se comprobó en el paquete compilado), pero están repetidas.
- **Las variables de entorno no se validan al arrancar** (salvo `JWT_SECRET`): un `JWT_SECRET` corto o un `FRONTEND_URL` mal escrito no avisan.
- **El cálculo del hash de contraseñas está copiado en 3 lugares** (`auth.service`, `contrasena.util`, `organizacion.service`).
- No hay `SECURITY.md` (cómo avisar de una vulnerabilidad) ni revisión automática de secretos en cada commit.

### 2.5 El CI

- El trabajo de GitHub Actions no declara `permissions`: corre con los permisos por defecto del token.
- No hay análisis de código (CodeQL, gratis en repos públicos), ni búsqueda de secretos (gitleaks), ni `pnpm audit`.

---

## 3. Sobre limpiar el historial de git

**Recomendación: no reescribir el historial.** No hay secretos reales que borrar (sección 1). Lo único "fijo" son las contraseñas de las cuentas de prueba, que no protegen nada.

Reescribirlo (con `git filter-repo` y un `push --force`) cambia los 125 commits, rompe cualquier copia o fork, y **no borra lo que ya se publicó**: el repositorio es público, así que GitHub, los forks y los buscadores ya lo pueden tener. Por eso, si un día se sube un secreto de verdad, lo que sirve es **cambiar ese secreto de inmediato** (y después, si se quiere, limpiar el historial). Este plan agrega la revisión automática (gitleaks) para que no llegue a pasar.

---

## 4. Decisiones (aprobadas el 2026-10-02: todas las recomendaciones)

| # | Pregunta | Opciones | Recomendación |
|---|---|---|---|
| S1 | ¿Reescribir el historial de git? | No · Sí (borra las contraseñas de prueba de los commits viejos) | **No** (sección 3). Se prueba que no hay secretos y se agrega la revisión automática. |
| S2 | ¿Cómo se guardan los contadores de los límites? | Redis (ya está) · Memoria del proceso (como hoy) | **Redis:** sobreviven a reinicios y sirven con varias instancias. |
| S3 | ¿Bloqueo por cuenta además de por IP? | Sí: tras 10 intentos fallidos en 15 minutos, la cuenta espera 15 minutos · Solo por IP | **Sí,** con aviso claro ("Demasiados intentos, espera 15 minutos") y registro en la auditoría. Los números, configurables. |
| S4 | ¿Protección contra denegación de servicio grande? | Cloudflare gratis delante (solo DNS, sin código) · Un módulo de límites en Caddy (compilar Caddy aparte) | **Cloudflare,** documentado paso a paso en `docs/despliegue.md`, más los límites propios de la API y de Caddy. |
| S5 | ¿Next 15 y NestJS 11? | Cada uno en su fase, con todas las pruebas · Solo forzar versiones arregladas | **Cada uno en su fase,** al final: cierran los 2 críticos y la mayoría de los altos. Antes, lo rápido (shadcn y versiones forzadas). |
| S6 | ¿Política de contenido (CSP) estricta? | Estricta con nonce (más trabajo) · Base (sin scripts de otros dominios) | **Base primero,** que ya bloquea scripts y marcos de otros sitios; la estricta, si después se agregan scripts de terceros. |
| S7 | ¿Las contraseñas de prueba? | Un solo archivo con las cuentas de prueba (seed, e2e y login lo usan) · Variables de entorno | **Un solo archivo,** marcado como solo para pruebas; y el seed se niega a correr en producción. |

---

## 5. Fases (un commit por fase, con pruebas)

Rama: `seguridad`.

### Fase 1: dependencias y CI (HECHA)
- `shadcn` a `devDependencies`; `pnpm.overrides` con las versiones arregladas de lo que se puede sin cambiar de versión mayor.
- CI: `permissions: contents: read`; `pnpm audit --prod --audit-level=high` (falla con un aviso alto nuevo); gitleaks sobre todo el historial; CodeQL; `.github/dependabot.yml` semanal.
- `SECURITY.md`: cómo avisar de una vulnerabilidad.
- **Listo cuando:** el CI pasa con las revisiones nuevas, gitleaks no encuentra nada en los 125 commits, y `pnpm audit` baja de 76 a los que dependen de Next 15 y NestJS 11.
- Hecho así:
  - `pnpm audit --prod`: de 76 avisos a 26. `shadcn` pasó a `devDependencies` (se usa al compilar el CSS, y la imagen Docker instala todo en esa etapa): -21. `pnpm.overrides` en el `package.json` de la raíz, sin cambiar de versión mayor: multer, fast-uri, brace-expansion (1 y 2), postcss, qs, body-parser y uuid (de exceljs; la exportación a Excel se probó con las e2e): -29. Quedan los de Next 14 (23) y NestJS 10 (3), para las fases 5 y 6.
  - **Adelantado por ser grave:** de los 2 críticos de Next, uno es una ejecución remota en el optimizador de imágenes (`/_next/image`), que existe aunque la app no use `next/image`. Quedó apagado en Next (`images.unoptimized`) y bloqueado en Caddy: los dos responden 404 (probado con la web compilada y con la imagen `caddy:2-alpine`). El otro crítico solo afecta a servidores Windows.
  - `scripts/revisar-dependencias.mjs`: corre `pnpm audit` y falla con una vulnerabilidad alta o crítica que no esté en su lista de aceptadas (cada una con su motivo y la fase en que se va), y también si una aceptada ya no aparece (para borrarla). Se usó un script porque pnpm 9.0 solo deja ignorar por CVE y 4 avisos de Next no tienen. Comprobado: pasa con las conocidas y falla al quitar una de la lista.
  - gitleaks v8.30.1 sobre el historial: **ningún secreto** en todo el historial de main (124 commits; gitleaks informa 113 revisados, porque se salta los que no tienen cambios propios que revisar, como los merges).
  - CI: `permissions: contents: read` y un trabajo `seguridad` (gitleaks sobre todo el historial y la revisión de dependencias). `codeql.yml` (javascript-typescript, consultas de seguridad y calidad; también los lunes). `.github/dependabot.yml`: npm, GitHub Actions y Docker, semanal, con las menores y de parche agrupadas.
  - `SECURITY.md`: avisar por el reporte privado de GitHub (pestaña Security), sin datos personales en el repositorio. **Hay que encenderlo una vez en GitHub:** Settings → Code security → Private vulnerability reporting.

### Fase 2: límites de peticiones
- Contadores en Redis (S2). Todos los límites en un solo archivo de configuración, cada uno con su variable de entorno.
- Límites por tipo: login, kiosco y PIN; exportar y correr reportes; crear organizaciones; el resto, el general.
- Bloqueo por cuenta (S3) y tiempo de respuesta igual exista o no el correo.
- Respuesta 429 en español y con `Retry-After`.
- **Listo cuando:** pruebas que muestran cada límite y el bloqueo por cuenta, y que un reinicio de la API no los borra.

### Fase 3: cabeceras, borde y sesión
- Caddy: HSTS, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP base (S6), límite de tamaño de lo que recibe y tiempos de espera.
- La cookie dura lo mismo que el token.
- `docs/despliegue.md`: Cloudflare delante (S4).
- **Listo cuando:** las cabeceras aparecen en la web y en la API (probado con `curl` contra Caddy en local) y la app funciona igual (e2e).

### Fase 4: configuración y datos fijos
- Validación de las variables de entorno al arrancar (largo mínimo de `JWT_SECRET`, URLs válidas), con un mensaje claro de qué falta.
- El seed se niega a correr en producción (S7) y las cuentas de prueba en un solo archivo.
- Un solo lugar para el hash de contraseñas.
- **Listo cuando:** la API no arranca con una configuración insegura y lo dice; el seed se niega con `NODE_ENV=production`.

### Fase 5: NestJS 11
- Subir NestJS (y Express 5); ajustar lo que cambie.
- **Listo cuando:** todas las pruebas pasan y `pnpm audit` ya no muestra los avisos de NestJS.

### Fase 6: Next 15
- Subir Next y React 19; ajustar lo que cambie (parámetros asíncronos, etc.).
- **Listo cuando:** todas las pruebas pasan, el recorrido en el navegador está bien y `pnpm audit --prod` no tiene avisos altos ni críticos.

---

## 6. Para más adelante

- Doble factor (2FA) para el dueño y el superadmin.
- Aviso por correo al iniciar sesión desde un lugar nuevo.
- Política de contraseñas más fuerte (rechazar las más comunes).
- CSP estricta con nonce.
