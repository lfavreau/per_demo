// Los 5 Coordinadores Regionales son reales — son las coordinaciones reales del proyecto PER,
// no datos de prueba. Se usan tanto en el seed demo completo como en el bootstrap seguro de
// producción, para no mantener dos copias de la misma nómina.

export interface CoordinatorSeed {
  name: string;
  email: string;
  regionId: string;
}

export const REGIONAL_COORDINATORS: CoordinatorSeed[] = [
  { name: "Coordinador Metropolitana", email: "coord.metro@per2026.cl", regionId: "Metropolitana" },
  { name: "Coordinador Valparaíso", email: "coord.valpo@per2026.cl", regionId: "Valparaíso" },
  { name: "Coordinador Tarapacá", email: "coord.tarapaca@per2026.cl", regionId: "Tarapacá" },
  { name: "Coordinador Biobío", email: "coord.biobio@per2026.cl", regionId: "Biobío" },
  { name: "Coordinador Los Ríos", email: "coord.losrios@per2026.cl", regionId: "Los Ríos" },
];
