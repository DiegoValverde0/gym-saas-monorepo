const path = require('path');
const { cabecerasDeSeguridad } = require('./cabeceras');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Sin "X-Powered-By: Next.js": no hace falta anunciar con qué está hecha.
  poweredByHeader: false,
  // Cabeceras de seguridad en todas las páginas (ver cabeceras.js).
  async headers() {
    return [
      {
        source: '/:ruta*',
        headers: cabecerasDeSeguridad({ desarrollo: process.env.NODE_ENV !== 'production', apiUrl: process.env.NEXT_PUBLIC_API_URL }),
      },
    ];
  },
  // Las pruebas e2e compilan en otra carpeta (.next-e2e) para no pisar la del
  // servidor de desarrollo (docs/plan-pruebas-e2e.md).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  transpilePackages: ["@repo/database"],
  // La app no usa next/image: el optimizador de imágenes (/_next/image) queda
  // apagado (y bloqueado en Caddy). Lo que no se usa no se deja abierto: tuvo
  // una vulnerabilidad grave en Next 14 (docs/plan-seguridad.md).
  images: { unoptimized: true },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Servidor mínimo para la imagen Docker de producción (ver Dockerfile; se
  // compila en Linux). No hace falta en las pruebas e2e (usan `next start`) ni
  // en Windows, donde además falla: crear sus enlaces pide permisos de
  // administrador (EPERM al correr `pnpm build`).
  output: process.env.NEXT_DIST_DIR || process.platform === 'win32' ? undefined : 'standalone',
  // Monorepo: incluir las dependencias que están en la raíz.
  outputFileTracingRoot: path.join(__dirname, '../../'),
};

module.exports = nextConfig;
