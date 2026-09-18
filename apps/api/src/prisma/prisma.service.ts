import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

// ==========================================
// UTILS
// ==========================================

function getModelDef(modelName: string) {
  return Prisma.dmmf.datamodel.models.find((m: Prisma.DMMF.Model) => m.name === modelName);
}

function hasField(modelName: string, fieldName: string) {
  const def = getModelDef(modelName);
  return !!def?.fields.find((f: Prisma.DMMF.Field) => f.name === fieldName);
}

function getField(modelName: string, fieldNameOptions: string[]) {
  const def = getModelDef(modelName);
  return def?.fields.find((f: Prisma.DMMF.Field) => fieldNameOptions.includes(f.name));
}

// Inyección recursiva de WHERE para Soft Delete y RLS en lectura
function injectReadFiltersRecursively(args: Record<string, unknown>, modelName: string, cls: ClsService) {
  if (!args || typeof args !== 'object') return;
  
  const modelDef = getModelDef(modelName);
  if (!modelDef) return;

  const organizacionId = cls.get('organizacionId');
  const isSuperAdmin = cls.get('is_superadmin');
  const sucursalId = cls.get('sucursalId');

  const hasDeletedAt = hasField(modelName, 'deletedAt');
  const orgField = getField(modelName, ['organizacionId']);
  const sucField = getField(modelName, ['sucursalId', 'sucursalBaseId']);

  args.where = (args.where as Record<string, unknown>) || {};
  const where = args.where as Record<string, unknown>;

  // 1. Soft Delete
  const onlyDeleted = cls.get('onlyDeleted');

  // Esta función también se llama para `update`/`updateMany` (ver más abajo
  // en $allOperations), no solo para lecturas. Un restore() es exactamente
  // eso: `update({ where: { id }, data: { deletedAt: null } })`. Sin este
  // caso especial, la rama `else` de abajo fuerza `where.deletedAt = null`
  // sobre un registro que hoy tiene `deletedAt` seteado (por eso se está
  // restaurando) -- cero filas coinciden y Prisma tira P2025 "Record to
  // update not found" en TODOS los módulos con papelera, siempre. Se detectó
  // probando manualmente turnos-plantilla y clientes tras implementar los
  // hallazgos del QA (ver docs/plan-correccion-hallazgos.md).
  const data = args.data as Record<string, unknown> | undefined;
  const esRestoreExplicito = !!data && Object.prototype.hasOwnProperty.call(data, 'deletedAt') && data.deletedAt === null;

  if (hasDeletedAt && where.deletedAt === undefined) {
    if (onlyDeleted || esRestoreExplicito) {
      where.deletedAt = { not: null };
    } else {
      where.deletedAt = null;
    }
  }

  // 2. RLS
  if (orgField) {
     if (!isSuperAdmin || organizacionId) {
         if (!organizacionId && !isSuperAdmin) {
             throw new Error(`[Seguridad RLS] Intento de acceso a modelo tenant '${modelName}' sin organizacionId en contexto.`);
         }

         if (!orgField.isRequired) {
             where.OR = where.OR || [];
             (where.OR as Record<string, unknown>[]).push({ organizacionId }, { organizacionId: null });
         } else {
             where.organizacionId = organizacionId;
         }

         if (sucursalId && sucField) {
             if (!sucField.isRequired) {
                 where.AND = where.AND || [];
                 (where.AND as Record<string, unknown>[]).push({
                     OR: [
                         { [sucField.name]: sucursalId },
                         { [sucField.name]: null }
                     ]
                 });
             } else {
                 where[sucField.name] = sucursalId;
             }
         }
     }
  }

  // 3. Recorrer anidados
  for (const key of ['include', 'select']) {
      if (args[key] && typeof args[key] === 'object') {
          const argsObj = args[key] as Record<string, unknown>;
          for (const relName of Object.keys(argsObj)) {
              const relVal = argsObj[relName];
              const relField = modelDef.fields.find((f: Prisma.DMMF.Field) => f.name === relName);
              
              // Prisma solo acepta un `where` anidado dentro de include/select
              // para relaciones de lista (uno-a-muchos); en una relación
              // singular (muchos-a-uno, ej. Membresia.cliente) es un error de
              // Prisma ("Unknown argument `where`"). El aislamiento de tenant
              // ahí ya lo garantiza la FK compuesta (id, organizacionId) a
              // nivel de base de datos, así que no hace falta filtrar --  y
              // para soft delete, preferimos mostrar el nombre de un registro
              // relacionado ya borrado antes que romper la consulta entera.
              if (relField && relField.kind === 'object' && relField.isList) {
                  const relModelName = relField.type;

                  if (relVal === true) {
                      const tempArgs: Record<string, unknown> = { where: {} };
                      injectReadFiltersRecursively(tempArgs, relModelName, cls);
                      if (Object.keys(tempArgs.where as Record<string, unknown>).length > 0) {
                          argsObj[relName] = tempArgs;
                      }
                  } else if (typeof relVal === 'object') {
                      injectReadFiltersRecursively(relVal as Record<string, unknown>, relModelName, cls);
                  }
              }
          }
      }
  }
}

// ==========================================
// EXTENSIONES
// ==========================================

function withSoftDeleteAndRLS(cls: ClsService, extendedClientGetter: () => unknown) {
  return Prisma.defineExtension((client) => {
    return client.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            if (!model) return query(args);

            const isSoftDelete = ['delete', 'deleteMany'].includes(operation);
            const isFind = ['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy'].includes(operation);
            const isWrite = ['create', 'createMany', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert'].includes(operation);

            // ==========================================
            // SOFT DELETE (Convertir Delete a Update)
            // ==========================================
            if (isSoftDelete && hasField(model, 'deletedAt')) {
                const newOperation = operation === 'delete' ? 'update' : 'updateMany';
                const deleteArgs = (args as Record<string, unknown>) || {};
                const data = (deleteArgs.data as Record<string, unknown>) || {};
                
                const extClient = extendedClientGetter() as Record<string, Record<string, (args: unknown) => Promise<unknown>>>;
                const modelCamel = model.charAt(0).toLowerCase() + model.slice(1);
                return extClient[modelCamel][newOperation]({
                    ...deleteArgs,
                    data: { ...data, deletedAt: new Date() }
                });
            }

            // ==========================================
            // RLS ESCRITURA Y BLOQUEOS
            // ==========================================
            const organizacionId = cls.get('organizacionId');
            const isSuperAdmin = cls.get('is_superadmin');
            const sucursalId = cls.get('sucursalId');
            
            const orgField = getField(model, ['organizacionId']);
            const sucField = getField(model, ['sucursalId', 'sucursalBaseId']);

            if (orgField) {
                if (isSuperAdmin && isWrite) {
                   throw new Error(`[Seguridad RLS] El superadmin no puede escribir datos de tenant ('${operation}' sobre '${model}'). Usa el flujo de administración de plataforma.`);
                }

                if (operation === 'create' || operation === 'createMany') {
                   const rlsArgs = (args as Record<string, unknown>) || {};
                   const data = rlsArgs.data;
                   if (data) {
                      if (Array.isArray(data)) {
                          rlsArgs.data = data.map((d: Record<string, unknown>) => {
                              const item = { ...d, organizacionId };
                              if (sucursalId && sucField) item[sucField.name] = sucursalId;
                              return item;
                          });
                      } else {
                          rlsArgs.data = { ...(data as Record<string, unknown>), organizacionId };
                          if (sucursalId && sucField) (rlsArgs.data as Record<string, unknown>)[sucField.name] = sucursalId;
                      }
                   }
                   args = rlsArgs;
                }
            }

            // ==========================================
            // INYECCIÓN RECURSIVA DE LECTURA (Soft Delete + RLS)
            // ==========================================
             if (isFind || operation === 'update' || operation === 'updateMany' || isSoftDelete) {
                args = args || {};
                // Para updates/deletes el where es obligatorio en prisma, y el injectReadFiltersRecursively lo rellenará
                injectReadFiltersRecursively(args as Record<string, unknown>, model, cls);
             }

            return query(args);
          },
        },
      },
    });
  });
}

// ==========================================
// SERVICIO PRINCIPAL
// ==========================================

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly cls: ClsService) {
    super();
  }

  private _extendedClient: unknown;

  get extendedClient() {
    if (!this._extendedClient) {
      this._extendedClient = this.$extends(withSoftDeleteAndRLS(this.cls, () => this._extendedClient));
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return this._extendedClient as any;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
