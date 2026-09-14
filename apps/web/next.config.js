/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@repo/database"],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
