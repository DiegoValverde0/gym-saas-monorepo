import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '../../.env') });

import { PrismaClient, EstadoRegistro, TipoPlan } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando la creación de semillas...');

  // Limpiar la base de datos (Opcional, depende de la configuración de test)
  // Como estamos agregando y podría haber restricciones, es mejor no hacer deleteAll, 
  // sino asumir base limpia en desarrollo o reset previo.

  // ==========================================
  // 1. Crear Organización A: Gym Titan
  // ==========================================
  const gymTitan = await prisma.organizacion.create({
    data: {
      nombre: 'Gym Titan',
      estado: EstadoRegistro.ACTIVO,
      sucursales: {
        create: [
          {
            nombre: 'Sede Principal - Norte',
            direccion: 'Av. Norte 123',
          }
        ]
      },
      roles: {
        create: [
          { nombre: 'Admin Supremo' },
          { nombre: 'Recepcionista' }
        ]
      }
    },
    include: {
      sucursales: true,
      roles: true
    }
  });

  const titanSucursalId = gymTitan.sucursales[0].id;
  const titanRoleId = gymTitan.roles[0].id;

  // Crear Usuario Admin para Gym Titan
  const userTitan = await prisma.usuario.create({
    data: {
      nombre_completo: 'Carlos Titan',
      correo: 'admin@gymtitan.com',
      contrasena_hash: 'hashed_password_123', // Simulado
      asignaciones_acceso: {
        create: {
          organizacion_id: gymTitan.id,
          rol_id: titanRoleId,
          sucursal_id: titanSucursalId
        }
      }
    }
  });

  // Crear Plan y Cliente para Gym Titan
  const planTitan = await prisma.plan.create({
    data: {
      organizacion_id: gymTitan.id,
      nombre: 'Plan Mensual Ilimitado',
      precio: 50.0,
      tipo_plan: TipoPlan.TIEMPO
    }
  });

  const clienteTitan = await prisma.cliente.create({
    data: {
      organizacion_id: gymTitan.id,
      sucursal_base_id: titanSucursalId,
      nombre: 'Juan Perez (Titan)',
      correo: 'juan.titan@test.com'
    }
  });

  // Crear Membresía para el Cliente de Gym Titan
  await prisma.membresia.create({
    data: {
      organizacion_id: gymTitan.id,
      cliente_id: clienteTitan.id,
      plan_id: planTitan.id,
      fecha_inicio: new Date(),
      fecha_fin: new Date(new Date().setMonth(new Date().getMonth() + 1)) // 1 mes
    }
  });

  console.log('✅ Gym Titan creado exitosamente.');


  // ==========================================
  // 2. Crear Organización B: CrossFit Alpha
  // ==========================================
  const cfAlpha = await prisma.organizacion.create({
    data: {
      nombre: 'CrossFit Alpha',
      estado: EstadoRegistro.ACTIVO,
      sucursales: {
        create: [
          {
            nombre: 'Box Centro',
            direccion: 'Calle Centro 456',
          }
        ]
      },
      roles: {
        create: [
          { nombre: 'Head Coach' }
        ]
      }
    },
    include: {
      sucursales: true,
      roles: true
    }
  });

  const alphaSucursalId = cfAlpha.sucursales[0].id;
  const alphaRoleId = cfAlpha.roles[0].id;

  // Crear Usuario para CrossFit Alpha
  const userAlpha = await prisma.usuario.create({
    data: {
      nombre_completo: 'Maria Alpha',
      correo: 'coach@cfalpha.com',
      contrasena_hash: 'hashed_password_456', 
      asignaciones_acceso: {
        create: {
          organizacion_id: cfAlpha.id,
          rol_id: alphaRoleId,
          sucursal_id: alphaSucursalId
        }
      }
    }
  });

  // Crear Plan y Cliente para CrossFit Alpha
  const planAlpha = await prisma.plan.create({
    data: {
      organizacion_id: cfAlpha.id,
      nombre: 'Pack 10 Sesiones',
      precio: 80.0,
      tipo_plan: TipoPlan.SESIONES
    }
  });

  const clienteAlpha = await prisma.cliente.create({
    data: {
      organizacion_id: cfAlpha.id,
      sucursal_base_id: alphaSucursalId,
      nombre: 'Ana Gomez (Alpha)',
      correo: 'ana.alpha@test.com'
    }
  });

  // Crear Membresía para el Cliente de CrossFit Alpha
  await prisma.membresia.create({
    data: {
      organizacion_id: cfAlpha.id,
      cliente_id: clienteAlpha.id,
      plan_id: planAlpha.id,
      fecha_inicio: new Date(),
      sesiones_disponibles: 10
    }
  });

  console.log('✅ CrossFit Alpha creado exitosamente.');
  
  console.log('🎉 Seed finalizado. Datos de prueba listos para validar RLS.');
}

main()
  .catch((e) => {
    console.error('❌ Error ejecutando el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
