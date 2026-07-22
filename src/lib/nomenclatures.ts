/**
 * Maps technical database case status to official, defendable SENDA/PER labels.
 */
export function mapCaseStatusToLabel(status: string): string {
  switch (status) {
    case "REGISTRADA":
      return "Pendiente";
    case "VINCULACION":
    case "CONEXION":
    case "FINALIZACION":
      return "Al día";
    case "EGRESO":
      return "Egreso";
    case "RETIRO_VOLUNTARIO":
      return "Retiro voluntario";
    case "DESERCION":
      return "Deserción";
    case "SUSPENDIDA":
      return "Suspendido";
    default:
      return status;
  }
}

/**
 * Maps internal database alert types to the required institutional alert names.
 */
export function mapAlertTypeToLabel(type: string): string {
  switch (type) {
    case "CASO_SIN_SESION":
      return "Alerta de seguimiento";
    case "SESIONES_NEGATIVAS":
      return "Alerta de adherencia";
    case "TAREA_ATRASADA":
    case "PER_NO_HABILITADO":
      return "Alerta documental";
    case "ALERTA_SUPERVISION":
      return "Alerta de supervisión";
    case "ALERTA_CIERRE_INCOMPLETO":
      return "Alerta de cierre incompleto";
    default:
      // Fallback formatting for any dynamically generated types
      return type
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

/**
 * Maps the 4 emotions recorded in the IAP to discrete professional labels.
 */
export function mapEmotionToLabel(emotion: string): string {
  switch (emotion) {
    case "BIEN":
      return "😊 Bien";
    case "NEUTRO":
      return "😐 Neutral";
    case "TRISTE":
      return "😢 Triste";
    case "ENOJADO":
    case "MOLESTO":
      return "😠 Molesto";
    default:
      return emotion;
  }
}

/**
 * Color styling classes for discrete semáforo display of emotions.
 */
export function getEmotionColorClass(emotion: string): string {
  switch (emotion) {
    case "BIEN":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "NEUTRO":
      return "bg-slate-50 text-slate-700 border-slate-200";
    case "TRISTE":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "ENOJADO":
    case "MOLESTO":
      return "bg-red-50 text-red-700 border-red-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}
