const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Las pruebas e2e compilan en otra carpeta (.next-e2e) para no pisar la del
  // servidor de desarrollo (docs/plan-pruebas-e2e.md).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  transpilePackages: ["@repo/database"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Servidor mínimo para la imagen Docker de producción (ver Dockerfile). Las
  // pruebas e2e usan `next start` y no lo necesitan (en Windows, además, no
  // puede crear sus enlaces sin permisos de administrador).
  output: process.env.NEXT_DIST_DIR ? undefined : 'standalone',
  experimental: {
    // Monorepo: incluir las dependencias que están en la raíz.
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
};

module.exports = nextConfig;
