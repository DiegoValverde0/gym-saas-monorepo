import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly cls: ClsService) {
    super();
  }

  private _extendedClient: ReturnType<PrismaService['buildExtendedClient']> | undefined;

  get extendedClient() {
    if (!this._extendedClient) {
      this._extendedClient = this.buildExtendedClient();
    }
    return this._extendedClient;
  }

  // Aislado en su propio método para que TypeScript pueda inferir el tipo real
  // del cliente extendido (en vez de `any`) en el getter público de arriba.
  // Dentro, `self` se tipa `any` deliberadamente: la conversión delete->update
  // necesita invocarse a sí misma recursivamente (this._extendedClient) para
  // que la actualización vuelva a pasar por este mismo pipeline (RLS incluido),
  // algo que TypeScript no puede tipar por la referencia circular.
  private buildExtendedClient() {
      const cls = this.cls;
      const self = this as any; // Capturar la instancia original de PrismaClient

      return this.$extends({
        query: {
          $allModels: {
            async $allOperations({ model, operation, args, query }) {
              // ==========================================
              // 1. SOFT DELETE EXTENSION
              // ==========================================
              const isSoftDelete = ['delete', 'deleteMany'].includes(operation);
              if (isSoftDelete && model) {
                const { Prisma } = require('@prisma/client');
                const modelDef = Prisma.dmmf.datamodel.models.find((m: any) => m.name === model);
                const hasDeletedAt = modelDef?.fields.some((f: any) => f.name === 'deletedAt');
                
                if (hasDeletedAt) {
                  const newOperation = operation === 'delete' ? 'update' : 'updateMany';
                  const deleteArgs = args as any || {};
                  const data = deleteArgs.data || {};
                  
                  // Invocar la actualización en el cliente Prisma extendido para que pase por RLS
                  const modelCamel = (model as string).charAt(0).toLowerCase() + (model as string).slice(1);
                  return (self as any)._extendedClient[modelCamel][newOperation]({
                    ...deleteArgs,
                    data: { ...data, deletedAt: new Date() }
                  });
                }
              }

              // Filtrar registros eliminados en consultas, SOLO para modelos que tienen deletedAt
              const isFind = ['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy'].includes(operation);
              if (isFind && model) {
                const { Prisma } = require('@prisma/client');
                const modelDef = Prisma.dmmf.datamodel.models.find((m: any) => m.name === model);
                const hasDeletedAt = modelDef?.fields.some((f: any) => f.name === 'deletedAt');
                
                if (hasDeletedAt) {
                  const findArgs = args as any || {};
                  const where = findArgs.where || {};
                  
                  if (where.deletedAt === undefined) {
                     findArgs.where = { ...where, deletedAt: null };
                  }
                  args = findArgs;
                }
              }

              // ==========================================
              // 2. ROW-LEVEL SECURITY (RLS) EXTENSION
              // ==========================================
              const organizacionId = cls.get('organizacionId');
              const isSuperAdmin = cls.get('is_superadmin');
              const sucursalId = cls.get('sucursalId');
              
              if (model) {
                 const { Prisma } = require('@prisma/client');
                 const modelDef = Prisma.dmmf.datamodel.models.find((m: any) => m.name === model);
                 const orgField = modelDef?.fields.find((f: any) => f.name === 'organizacionId');
                 const sucField = modelDef?.fields.find((f: any) => f.name === 'sucursalId' || f.name === 'sucursalBaseId');
                 
                 // Solo aplicamos RLS a los modelos que tengan el campo organizacionId
                 if (orgField) {
                    const rlsArgs = args as any || {};

                    // 0. BLOQUEO DE ESCRITURA PARA SUPERADMIN
                    // El superadmin es de solo lectura sobre datos de cualquier tenant,
                    // tenga o no una organización impersonada vía x-tenant-id. Sus únicas
                    // escrituras de plataforma (crear organización, suspenderla/reactivarla)
                    // operan sobre el modelo Organizacion, que no tiene `organizacionId` y
                    // por eso nunca entra a este bloque (ver organizacion.service.ts).
                    const isWrite = ['create', 'createMany', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert'].includes(operation);
                    if (isSuperAdmin && isWrite) {
                       throw new Error(`[Seguridad RLS] El superadmin no puede escribir datos de tenant ('${operation}' sobre '${model as string}'). Usa el flujo de administración de plataforma.`);
                    }

                    // 1. INYECCIÓN DE CONTEXTO Y FORZADO (Solo para CREATE, solo usuarios de tenant)
                    if (operation === 'create' || operation === 'createMany') {
                       const data = rlsArgs.data;
                       if (data) {
                          // FORZADO estricto: organizacionId siempre viene del contexto, nunca del cliente
                          if (Array.isArray(data)) {
                              rlsArgs.data = data.map((d: any) => {
                                  const item = { ...d, organizacionId: organizacionId };
                                  if (sucursalId && sucField) item[sucField.name] = sucursalId;
                                  return item;
                              });
                          } else {
                              rlsArgs.data = { ...data, organizacionId: organizacionId };
                              if (sucursalId && sucField) rlsArgs.data[sucField.name] = sucursalId;
                          }
                       }
                    }

                    // 2. RESTRICCIONES DE SEGURIDAD (Se aplica a todos, excepto a SuperAdmin cuando NO tiene organizacionId)
                    if (!isSuperAdmin || organizacionId) {
                        if (!organizacionId && !isSuperAdmin) {
                           throw new Error(`[Seguridad RLS] Intento de acceso a modelo tenant '${model as string}' sin organizacionId en contexto.`);
                        }

                        const isDelete = operation === 'delete' || operation === 'deleteMany';
                        if (isFind || operation === 'update' || operation === 'updateMany' || isDelete) {
                           const where = rlsArgs.where || {};
                           // Si el campo es opcional (String?), permitimos leer registros globales (organizacionId: null)
                           if (!orgField.isRequired && isFind) {
                               rlsArgs.where = { 
                                   ...where, 
                                   OR: [
                                       { organizacionId: organizacionId },
                                       { organizacionId: null }
                                   ]
                               };
                           } else {
                               rlsArgs.where = { ...where, organizacionId: organizacionId };
                           }

                           if (sucursalId && sucField) {
                               if (!sucField.isRequired && isFind) {
                                   const existingOr = rlsArgs.where.OR;
                                   const sucCondition = {
                                       OR: [
                                           { [sucField.name]: sucursalId },
                                           { [sucField.name]: null }
                                       ]
                                   };
                                   if (existingOr) {
                                       rlsArgs.where.AND = [ { OR: existingOr }, sucCondition ];
                                       delete rlsArgs.where.OR;
                                   } else {
                                       rlsArgs.where.OR = sucCondition.OR;
                                   }
                               } else {
                                   rlsArgs.where[sucField.name] = sucursalId;
                               }
                           }
                        }
                    }
                    args = rlsArgs;
                 }
              }

              return query(args);
            },
          },
        },
      });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
