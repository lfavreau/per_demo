// Vitest corre fuera del compilador de Next.js, así que el paquete real "server-only"
// (que revienta a propósito si no detecta el bundler de Next) también reventaría acá.
// vitest.config.ts alias "server-only" -> este archivo, que no hace nada.
export {};
