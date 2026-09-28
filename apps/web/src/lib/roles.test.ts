import { describe, expect, it } from 'vitest';
import { descripcionRol, nombreAccion, nombreModulo, nombreRol, ordenRol } from './roles';

describe('nombres de roles y permisos', () => {
  it('muestra los roles base con su nombre legible y deja los propios como están', () => {
    expect(nombreRol('ADMIN_GYM')).toBe('Administrador');
    expect(nombreRol('RECEPCIONISTA')).toBe('Recepción');
    expect(nombreRol('ENTRENADOR')).toBe('Instructor');
    expect(nombreRol('Gerente de ventas')).toBe('Gerente de ventas');
    expect(nombreRol(null)).toBe('');
    expect(descripcionRol('RECEPCIONISTA')).toContain('membresías');
  });

  it('traduce módulos y acciones de permisos', () => {
    expect(nombreModulo('asistencias')).toBe('Control de acceso');
    expect(nombreModulo('modulo_nuevo')).toBe('modulo_nuevo');
    expect(nombreAccion('leer')).toBe('Ver');
    expect(nombreAccion('forzar')).toBe('Dejar pasar aunque no cumpla');
  });

  it('ofrece primero los roles más comunes al dar de alta', () => {
    const orden = ['ADMIN_GYM', 'Propio', 'RECEPCIONISTA', 'ENTRENADOR'].sort((a, b) => ordenRol(a) - ordenRol(b));
    expect(orden).toEqual(['RECEPCIONISTA', 'ENTRENADOR', 'ADMIN_GYM', 'Propio']);
  });
});
