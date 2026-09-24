import { promisify } from 'util';
import * as crypto from 'crypto';

const scryptAsync = promisify(crypto.scrypt);

// Formato "salt:hash" (scrypt, 64 bytes) -- el mismo que verifica AuthService al iniciar sesión.
export async function hashContrasena(contrasena: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(contrasena, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}
