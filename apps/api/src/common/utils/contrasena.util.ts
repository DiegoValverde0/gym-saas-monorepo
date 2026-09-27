import { promisify } from 'util';
import * as crypto from 'crypto';

const scryptAsync = promisify(crypto.scrypt);

// Contraseña temporal fácil de dictar o enviar por WhatsApp: sin caracteres
// que se confunden (0/O, 1/l/I). 10 caracteres de un alfabeto de 31.
export function generarContrasenaTemporal(): string {
  const letras = 'abcdefghjkmnpqrstuvwxyz';
  const numeros = '23456789';
  const azar = (conjunto: string, n: number) =>
    Array.from({ length: n }, () => conjunto[crypto.randomInt(conjunto.length)]).join('');
  return `${azar(letras, 4)}${azar(numeros, 4)}${azar(letras, 2)}`;
}

// Formato "salt:hash" (scrypt, 64 bytes) -- el mismo que verifica AuthService al iniciar sesión.
export async function verificarHash(texto: string, guardado: string): Promise<boolean> {
  const [salt, hash] = guardado.split(':');
  if (!salt || !hash) return false;
  const derivado = (await scryptAsync(texto, salt, 64)) as Buffer;
  const esperado = Buffer.from(hash, 'hex');
  return esperado.length === derivado.length && crypto.timingSafeEqual(esperado, derivado);
}

export async function hashContrasena(contrasena: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(contrasena, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}
