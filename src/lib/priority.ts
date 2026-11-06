/**
 * Prioridad de cada ámbito de recuperación (Actividad 3). Se guarda en IAPDomainMap.importance con los
 * valores históricos "ALTO" | "MEDIO" | "BAJO"; la pantalla la llama "Prioridad" (Alta / Media / Baja).
 * Los colores dicen al PER qué ámbitos atender primero; siempre se acompañan de texto.
 */
export type PriorityValue = "ALTO" | "MEDIO" | "BAJO";

export interface PriorityLevel {
  value: PriorityValue;
  label: string;
  /** Punto de color, chip y bordes (clases Tailwind completas para que no se purguen). */
  dot: string;
  chip: string;
  selected: string;
}

export const PRIORITY_LEVELS: PriorityLevel[] = [
  {
    value: "ALTO",
    label: "Alta",
    dot: "bg-red-500",
    chip: "bg-red-50 text-red-800 border-red-300 hover:bg-red-100",
    selected: "bg-red-600 text-white border-red-700",
  },
  {
    value: "MEDIO",
    label: "Media",
    dot: "bg-yellow-400",
    chip: "bg-yellow-50 text-yellow-900 border-yellow-300 hover:bg-yellow-100",
    selected: "bg-yellow-400 text-yellow-950 border-yellow-500",
  },
  {
    value: "BAJO",
    label: "Baja",
    dot: "bg-green-500",
    chip: "bg-green-50 text-green-800 border-green-300 hover:bg-green-100",
    selected: "bg-green-600 text-white border-green-700",
  },
];

const BY_VALUE = new Map<string, PriorityLevel>(PRIORITY_LEVELS.map((p) => [p.value, p]));

export function getPriority(value?: string | null): PriorityLevel | null {
  return value ? (BY_VALUE.get(value) ?? null) : null;
}

/** Orden para mostrar: Alta primero, luego Media, Baja y los ámbitos sin prioridad. */
export function priorityRank(value?: string | null): number {
  const index = PRIORITY_LEVELS.findIndex((p) => p.value === value);
  return index === -1 ? PRIORITY_LEVELS.length : index;
}
