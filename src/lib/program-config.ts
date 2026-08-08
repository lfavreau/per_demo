/**
 * Parámetros operativos del programa que cambian por convenio, no por código.
 * Un solo lugar para editarlos en vez de literales repetidos por la app —
 * sin pantalla de configuración: esto se toca una vez por temporada, a mano.
 */

export const REGIONS = [
  { name: "Metropolitana", quota: 20 },
  { name: "Valparaíso", quota: 8 },
  { name: "Tarapacá", quota: 6 },
  { name: "Biobío", quota: 4 },
  { name: "Los Ríos", quota: 11 },
] as const;

export const REGION_NAMES = REGIONS.map((r) => r.name);

// Un PER lleva como máximo este número de acompañamientos activos a la vez.
export const MAX_ACTIVE_CASES_PER_PER = 1;

// Días sin supervisión técnica antes de que la dotación PER pase a amarillo/rojo
// en /coordinacion/supervisiones.
export const SUPERVISION_ALERT_DAYS = {
  YELLOW: 15,
  RED: 30,
} as const;
