import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as crypto from 'crypto';

// Helper de encriptación nativa
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

@Injectable()
export class OrganizacionService {
  constructor(private prisma: PrismaService) {}

  async crearOrganizacionConAdmin(datos: { nombreOrg: string; nombreAdmin: string; correo: string; contrasena: string }): Promise<any> {
    // Al crear un tenant, debemos usar la instancia global (admin/root mode)
    // Ya que el RLS todavía no aplica para la creación de un nuevo namespace.
    
    // Hasheamos la contraseña con crypto nativo
    const contrasena_hash = hashPassword(datos.contrasena);

    return this.prisma.$transaction(async (tx) => {
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

      const { contrasena_hash: _, ...usuarioSinContrasena } = usuario;
      return { organizacion: org, admin: usuarioSinContrasena };
    });
  }
}
