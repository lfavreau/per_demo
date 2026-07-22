import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@prisma/client",
    ".prisma/client",
    "@libsql/client",
    "@prisma/adapter-libsql",
  ],
};

export default nextConfig;
