import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Mitigación pragmática (ver Auditoria_Claude.md, Fase E5): el JWT real vive
// en localStorage, invisible para un middleware de servidor, así que no
// podemos validar permisos aquí. Lo que SÍ podemos evitar es el "flash" de
// contenido protegido: `has_session` es una cookie no sensible (nunca lleva
// el token) que el login setea y el logout borra; si no está, redirigimos
// antes de que el bundle del dashboard llegue a montarse. La autorización
// real sigue ocurriendo en cada request al backend con el Bearer token.
export function middleware(request: NextRequest) {
  const hasSession = request.cookies.get('has_session')?.value === '1';

  if (!hasSession) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
