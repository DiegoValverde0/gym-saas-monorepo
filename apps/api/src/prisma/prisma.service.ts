import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly cls: ClsService) {
    super();
  }

  get extendedClient() {
    const cls = this.cls;
    return this.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            // ==========================================
            // 1. SOFT DELETE EXTENSION
            // ==========================================
            const isSoftDelete = ['delete', 'deleteMany'].includes(operation);
            if (isSoftDelete) {
              const newOperation = operation === 'delete' ? 'update' : 'updateMany';
              
              if (!args) args = {};
              if (!args['data']) args['data'] = {};
              
              args['data'] = { ...args['data'], deleted_at: new Date() };
              
              return query({
                ...args,
                operation: newOperation,
              } as any);
            }

            // Filtrar registros eliminados en consultas
            const isFind = ['findUnique', 'findFirst', 'findMany', 'count'].includes(operation);
            if (isFind) {
              const anyArgs = args as any;
              if (anyArgs && anyArgs.where) {
                if (anyArgs.where.deleted_at === undefined) {
                  anyArgs.where = { ...anyArgs.where, deleted_at: null };
                }
              } else {
                args = { ...anyArgs, where: { deleted_at: null } };
              }
            }

            // ==========================================
            // 2. ROW-LEVEL SECURITY (RLS) EXTENSION
            // ==========================================
            const organizacionId = cls.get('organizacion_id');
            const skipRlsModels = ['Usuario', 'Permiso']; // Modelos que no tienen organizacion_id
            
            if (organizacionId && !skipRlsModels.includes(model as string)) {
              const anyArgs = args as any;
              if (operation === 'create' || operation === 'createMany') {
                if (anyArgs && anyArgs.data) {
                   if (Array.isArray(anyArgs.data)) {
                       anyArgs.data = anyArgs.data.map((d: any) => ({ ...d, organizacion_id: organizacionId }));
                   } else {
                       anyArgs.data = { ...anyArgs.data, organizacion_id: organizacionId };
                   }
                }
              } else if (isFind || operation === 'update' || operation === 'updateMany') {
                if (anyArgs && anyArgs.where) {
                  anyArgs.where = { ...anyArgs.where, organizacion_id: organizacionId };
                } else {
                  args = { ...anyArgs, where: { organizacion_id: organizacionId } };
                }
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
