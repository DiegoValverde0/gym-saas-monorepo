import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

// El JWT ahora vive en una cookie HttpOnly llamada `gym_token`.
export async function middleware(request: NextRequest) {
  const token = request.cookies.get('gym_token')?.value;

  if (!token) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  if (!process.env.JWT_SECRET) {
    // Igual que auth.module.ts en la API: sin secreto no hay forma segura de
    // validar el token, así que fallamos cerrado en vez de caer a un valor
    // por defecto (nunca hardcodear el secreto real en el código fuente).
    throw new Error('JWT_SECRET no está configurado. Define la variable de entorno JWT_SECRET antes de iniciar la aplicación.');
  }

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    await jwtVerify(token, secret);
    return NextResponse.next();
  } catch {
    const loginUrl = new URL('/login', request.url);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete('gym_token');
    return response;
  }
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
