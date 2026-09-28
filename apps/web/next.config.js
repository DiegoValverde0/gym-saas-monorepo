const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@repo/database"],
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Servidor mínimo para la imagen Docker de producción (ver Dockerfile).
  output: 'standalone',
  experimental: {
    // Monorepo: incluir las dependencias que están en la raíz.
    outputFileTracingRoot: path.join(__dirname, '../../'),
  },
};

module.exports = nextConfig;
