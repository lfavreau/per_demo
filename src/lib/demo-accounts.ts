// Cuentas del seed (prisma/seed.ts) habilitadas para el acceso directo en modo demo.
// Mantener sincronizado con los correos y nombres del seed.
export interface DemoAccount {
  name: string;
  username: string;
  email: string;
  role: "ADMIN" | "COORDINATOR" | "PER";
  roleLabel: string;
  region: string;
}

export const DEMO_REGIONS = ["Metropolitana", "Valparaíso", "Tarapacá", "Biobío", "Los Ríos"] as const;

const coord = (name: string, username: string, region: string): DemoAccount => ({
  name,
  username,
  email: `${username}@per2026.cl`,
  role: "COORDINATOR",
  roleLabel: "Coordinador Regional",
  region,
});

const per = (name: string, username: string, region: string): DemoAccount => ({
  name,
  username,
  email: `${username}@per2026.cl`,
  role: "PER",
  roleLabel: "Acompañante PER",
  region,
});

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    name: "Administrador Nacional",
    username: "admin",
    email: "admin@per2026.cl",
    role: "ADMIN",
    roleLabel: "Administrador Nacional",
    region: "Nacional",
  },
  coord("Coordinadora Metropolitana", "coord.metro", "Metropolitana"),
  coord("Coordinador Valparaíso", "coord.valpo", "Valparaíso"),
  coord("Coordinador Tarapacá", "coord.tarapaca", "Tarapacá"),
  coord("Coordinador Biobío", "coord.biobio", "Biobío"),
  coord("Coordinador Los Ríos", "coord.losrios", "Los Ríos"),
  per("Carla Muñoz", "per.carla", "Metropolitana"),
  per("Diego Rojas", "per.diego", "Metropolitana"),
  per("Juan Pérez", "per.juan", "Metropolitana"),
  per("Andrés Silva", "per.valpo", "Valparaíso"),
  per("Sonia Reyes", "per.sonia", "Valparaíso"),
  per("Lucas Díaz", "per.lucas", "Tarapacá"),
  per("Mario Soto", "per.mario", "Tarapacá"),
  per("Camila Vera", "per.camila", "Biobío"),
  per("Pedro Castillo", "per.pedro", "Los Ríos"),
  per("Elena Gómez", "per.elena", "Los Ríos"),
];
