import { Injectable } from '@nestjs/common';
import { prisma } from '@repo/database';

@Injectable()
export class OrganizacionService {
  async crearOrganizacionConAdmin(datos: { nombreOrg: string; nombreAdmin: string; correo: string; contrasena: string }): Promise<any> {
    // Al crear un tenant, debemos usar la instancia global (admin/root mode)
    // Ya que el RLS todavía no aplica para la creación de un nuevo namespace.
    
    // Aquí idealmente hasheamos la contraseña con bcrypt.
    const contrasena_hash = datos.contrasena; // TODO: Usar bcrypt

    return prisma.$transaction(async (tx) => {
      // 1. Crear Organización
      const org = await tx.organizacion.create({
        data: { nombre: datos.nombreOrg },
      });

      // 2. Crear Usuario Global
      const usuario = await tx.usuario.create({
        data: {
          nombre_completo: datos.nombreAdmin,
          correo: datos.correo,
          contrasena_hash,
        },
      });

      // 3. Crear Rol Admin Global de la Organización
      const rolAdmin = await tx.rol.create({
        data: {
          nombre: 'ADMINISTRADOR',
          organizacion_id: org.id,
        },
      });

      // 4. Asignar acceso total
      await tx.asignacion_Acceso.create({
        data: {
          usuario_id: usuario.id,
          organizacion_id: org.id,
          rol_id: rolAdmin.id,
        },
      });

      return { organizacion: org, admin: usuario };
    });
  }
}
