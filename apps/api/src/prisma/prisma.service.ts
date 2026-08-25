import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly cls: ClsService) {
    super();
  }

  private _extendedClient: any;

  get extendedClient() {
    if (!this._extendedClient) {
      const cls = this.cls;
      this._extendedClient = this.$extends({
        query: {
          $allModels: {
            async $allOperations({ model, operation, args, query }) {
              // ==========================================
              // 1. SOFT DELETE EXTENSION
              // ==========================================
              const isSoftDelete = ['delete', 'deleteMany'].includes(operation);
              if (isSoftDelete) {
                const newOperation = operation === 'delete' ? 'update' : 'updateMany';
                
                const deleteArgs = args as any || {};
                const data = deleteArgs.data || {};
                
                return query({
                  ...deleteArgs,
                  data: { ...data, deleted_at: new Date() },
                  operation: newOperation,
                } as any);
              }

              // Filtrar registros eliminados en consultas
              const isFind = ['findUnique', 'findFirst', 'findMany', 'count'].includes(operation);
              if (isFind) {
                const findArgs = args as any || {};
                const where = findArgs.where || {};
                
                if (where.deleted_at === undefined) {
                   findArgs.where = { ...where, deleted_at: null };
                }
                args = findArgs;
              }

              // ==========================================
              // 2. ROW-LEVEL SECURITY (RLS) EXTENSION
              // ==========================================
              const organizacionId = cls.get('organizacion_id');
              const isSuperAdmin = cls.get('is_superadmin');
              
              // Modelos que no tienen organizacion_id obligatorio o son globales
              const skipRlsModels = ['Usuario', 'Permiso', 'Rol_Permiso', 'Rol']; 
              
              if (!skipRlsModels.includes(model as string)) {
                // BYPASS para administradores
                if (!isSuperAdmin) {
                   // MODO ESTRICTO: Si no hay organizacion en el contexto y NO es superadmin, rechazar acceso
                   if (!organizacionId) {
                      throw new Error(`[Seguridad RLS] Intento de acceso a modelo tenant '${model as string}' sin organizacion_id en contexto.`);
                   }

                   const rlsArgs = args as any || {};
                   if (operation === 'create' || operation === 'createMany') {
                      const data = rlsArgs.data;
                      if (data) {
                         if (Array.isArray(data)) {
                             rlsArgs.data = data.map((d: any) => ({ ...d, organizacion_id: organizacionId }));
                         } else {
                             rlsArgs.data = { ...data, organizacion_id: organizacionId };
                         }
                      }
                   } else if (isFind || operation === 'update' || operation === 'updateMany') {
                      const where = rlsArgs.where || {};
                      rlsArgs.where = { ...where, organizacion_id: organizacionId };
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
    return this._extendedClient;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
