# Resumen Maestro - Fase 2 (RBAC, Multi-Tenant y Componentes Globales UI)

Este documento sirve como auditoría de lo construido durante la Fase 2 y como **Plantilla Definitiva de Arquitectura** para escalar los módulos (Fase 3 y en adelante) de Gym Manager SaaS.

---

## 1. Auditoría y Hallazgos (Mejoras Aplicadas)

Durante la fase de construcción de Roles, Permisos y Sucursales, se detectaron y corrigieron las siguientes deudas técnicas que ahora son parte del estándar:

1. **Bug Crítico de Borrado Lógico en Prisma (Falso 500)**: La extensión original de borrado lógico interceptaba tablas que no poseían la columna `deletedAt` (como `roles_permisos`), provocando caídas al actualizar o eliminar. Se implementó una verificación dinámica en `prisma.service.ts` que escanea el `dmmf` de Prisma en tiempo de ejecución. **Solo se aplica Soft Delete a tablas que realmente declaren `deletedAt`.**
2. **Invalidación de Caché (Redis) en Efecto Cascada**: Se detectó que si un administrador actualizaba los permisos de un *Rol*, los usuarios que poseían ese rol no perdían sus permisos hasta que su token en Redis expirara. **Se implementó una invalidación forzada:** cuando `RolService.update` modifica un rol, busca todos los usuarios con dicho rol y purga activamente sus llaves `rbac:usuario:tenant` de Redis.
3. **UI Glitch en Radix Select**: Se arregló un problema donde al inyectar valores iniciales (UUIDs) en `<Select>`, estos se mostraban crudos en vez del nombre del recurso, ya que la red renderizaba el trigger antes que el DOM del listado. Solucionado forzando un binding directo en `GlobalFormModal`.

---

## 2. Arquitectura de Permisos (RBAC Multi-Tenant)

El sistema de seguridad implementa un modelo **Role-Based Access Control (RBAC)** altamente restrictivo y basado en strings compuestas.

### 2.1 Formato de Permisos
Todo permiso se valida contra la estructura `accion:modulo` (ej. `roles:leer`, `usuarios:crear`, `sucursales:actualizar`). El SuperAdmin (`is_superadmin = true`) tiene un bypass inyectado a nivel `JwtAuthGuard` y `RolesGuard` por lo que puede ignorar esta matriz de forma segura.

### 2.2 Capa Backend (Protección de Rutas)
Para crear un nuevo módulo en el backend, utiliza el decorador `@RequirePermissions()`:

```typescript
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sucursales')
export class SucursalController {
  @Get()
  @RequirePermissions({ accion: 'leer', modulo: 'sucursales' })
  findAll() { /* ... */ }
}
```

**Flujo interno:**
1. `JwtAuthGuard` valida el JWT e inyecta `user` (y extrae `x-tenant-id` de las cabeceras).
2. `RolesGuard` consulta Redis por la llave `rbac:{userId}:{tenantId}`. Si no existe, realiza un query intensivo en DB a través de `AsignacionAcceso`, calcula el string array de permisos y lo guarda en caché por 15 minutos.
3. Si el usuario no tiene la coincidencia exacta, se arroja `ForbiddenException (403)`.

### 2.3 Capa Frontend (Protección UI)
Todo componente o botón que dispare una acción restringida DEBE estar envuelto en el componente global `<Protect>`:

```tsx
import { Protect } from '@/components/ui/protect';

// Para ocultar un botón a usuarios sin permisos:
<Protect permission="sucursales:crear">
   <Button>Crear Sucursal</Button>
</Protect>

// Para proteger una vista entera y redirigir con un Toast si falla:
<Protect permission="sucursales:leer" fallbackType="redirect">
   <MisComponentesDePagina />
</Protect>
```
El hook subyacente `usePermissions` lee el caché, cruza contra el array inyectado en el servidor y decide de forma reactiva.

---

## 3. Manejo de Aislamiento Tenant (RLS)

Nunca envíes ni manejes `organizacionId` en tus validaciones de payload (DTOs), esquemas Zod o en el body de tus peticiones (POST/PUT).

El **PrismaClient Extendido** inyecta silenciosamente el Tenant:
- **Al crear (`create` / `createMany`)**: Forza la inyección del `organizacionId` que reside en el contexto de NestJS (`nestjs-cls`).
- **Al consultar (`findMany` / `findUnique`)**: Inyecta la cláusula `WHERE organizacionId = '{id}'`. 

**Para el desarrollador Frontend:** Solo es necesario asegurarse de pasar en cada petición el header:
`'x-tenant-id': activeTenantId || 'all'`

---

## 4. Estandarización de Componentes y Diseño UI (Clonación para Fase 3)

Al construir cualquier nuevo módulo CRUD (ej. Planes, Productos, Clientes), debe copiarse la metodología establecida en las vistas de `roles/page.tsx` o `sucursales/page.tsx`:

### 4.1. GlobalFormModal
Nunca construyas modales personalizados a menos que sea estrictamente necesario. Usa `<GlobalFormModal>`:
- Mapea de forma dinámica los inputs (text, email, password, select, switch).
- Maneja automáticamente los estilos de error (Bordes rojos `border-red-500` y backgrounds `bg-red-50`).
- Renderiza tooltips de alerta si falla la validación de `zod`.

### 4.2. Soft Delete y Undo (Toast)
Cualquier acción de borrado en la UI DEBE pasar por el hook `useSoftDelete`. Esto garantiza que si el usuario cometió un error, el `Toast` emitirá una barra de carga de 5 segundos con un botón "Deshacer" antes de ejecutar el DELETE HTTP real:

```tsx
import { useSoftDelete } from '@/hooks/use-soft-delete';

const { handleDelete, DeleteToastUI } = useSoftDelete({
  itemName: 'la sucursal',
  onExecute: (id) => deleteMutation.mutate(id), // Llama tu mutación de react-query
});

// En el botón: onClick={() => handleDelete(sucursal.id, sucursal.nombre)}
// Y siempre renderizar: <DeleteToastUI /> al final de la página.
```

### 4.3. Listados (Table & TanStack Query)
- Usa `useQuery` de `@tanstack/react-query` para alimentar la data (Ej: `queryKey: ['mi-recurso', activeTenantId]`).
- Si la tabla no tiene data, muestra siempre el fallback vacío estilizado.
- Nunca muestres IDs crudos en la tabla, resuélvelos a nombres comprensibles.

---

**Siguientes Pasos (Fase 3)**:
Al poseer una base sólida de autenticación multi-tenant y estandarización UI, el desarrollo de las funcionalidades de negocio (Módulo de Gimnasio: Planes, Miembros, Control de Acceso Físico, Facturación) puede comenzar mediante clonación rápida utilizando los componentes globales aquí descritos.
