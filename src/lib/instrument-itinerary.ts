// Catálogo puro (sin acceso a DB) del itinerario de instrumentos por etapa del caso.
// Fuente de verdad textual: usado tanto por el server (gating, seed) como por el cliente (UI del PER).

export type CaseStage = "VINCULACION" | "CONEXION" | "FINALIZACION";
export type SourceModel = "TASK" | "SESSION_LOG";
export type SubmissionMode = "EXTERNAL_LINK" | "NATIVE_FORM";
export type TriggerCondition = "SEQUENTIAL" | "CONTINUOUS" | "ON_WITHDRAWAL";
export type ContentTarget = "TASK_JSON" | "IAP_DOMAIN_MAP" | "IAP_GOAL";

export interface ItineraryFieldDef {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "date";
  required: boolean;
  options?: string[];
  /** Agrupa visualmente campos bajo un mismo titulo de seccion (ej. Actividad 2, 5 secciones). */
  section?: string;
}

export interface ItineraryStepDef {
  activityKey: string;
  stage: CaseStage;
  order: number;
  title: string;
  description?: string;
  sourceModel: SourceModel;
  submissionMode: SubmissionMode;
  contentTarget: ContentTarget | null;
  optional: boolean;
  triggerCondition: TriggerCondition;
  /** false para el registro semanal (continuo) y los formularios de abandono (condicionales) */
  countsTowardStageGate: boolean;
  /** solo para NATIVE_FORM. Actividad 3 y Actividad 4 usan una UI tabular dedicada (ver contentTarget) en vez de esta lista plana. */
  fields?: ItineraryFieldDef[];
}

// Los 9 ámbitos oficiales del IAP. Única fuente — reemplaza copias hardcodeadas en per/page.tsx y reportes/page.tsx.
// Se guardan como el string literal (no un id codificado) porque así ya están persistidos en SessionLog.recoveryDomainId
// e IAPDomainMap/IAPGoal.recoveryDomainId en datos existentes.
export const RECOVERY_DOMAINS = [
  "Apoyo social",
  "Ejercicio de ciudadanía",
  "Tiempo libre",
  "Empleo",
  "Situación judicial",
  "Educación y formación",
  "Habitabilidad",
  "Situación financiera",
  "Física y mental",
] as const;

// Actividad 5: Evaluación conjunta del proceso. Las 7 preguntas se responden en conjunto con la
// persona acompañada (según IAP.md), más comentarios finales de la evaluación.
const EVALUATION_FIELDS: ItineraryFieldDef[] = [
  { key: "date", label: "Fecha", type: "date", required: true },
  { key: "advances", label: "¿Qué avances se obtuvieron respecto a los objetivos planteados?", type: "textarea", required: true },
  { key: "difficulties", label: "¿Cuáles fueron las principales dificultades encontradas en el camino?", type: "textarea", required: false },
  { key: "keyResources", label: "¿Qué recursos o estrategias fueron clave para avanzar en este objetivo?", type: "textarea", required: false },
  { key: "skillsLearned", label: "¿Qué habilidades, fortalezas y/o aprendizajes se desarrollaron durante el proceso?", type: "textarea", required: false },
  { key: "autonomyReadiness", label: "¿Qué tan preparado me siento para continuar de forma autónoma con mi proceso de recuperación?", type: "textarea", required: false },
  { key: "futureActions", label: "¿Qué acciones futuras pueden ayudar a consolidar los logros obtenidos?", type: "textarea", required: false },
  { key: "adjustmentsNeeded", label: "¿Se requiere algún ajuste o seguimiento adicional? ¿Cuál?", type: "textarea", required: false },
  { key: "jointComments", label: "Comentarios evaluación conjunta", type: "textarea", required: false },
];

const WITHDRAWAL_FIELDS: ItineraryFieldDef[] = [
  { key: "date", label: "Fecha", type: "date", required: true },
  { key: "reason", label: "Motivo del abandono", type: "textarea", required: true },
  { key: "observations", label: "Observaciones adicionales", type: "textarea", required: false },
];

export const ITINERARY_CATALOG: ItineraryStepDef[] = [
  {
    activityKey: "PRIMER_ENCUENTRO_REFLEXION",
    stage: "VINCULACION",
    order: 1,
    title: "Primer encuentro. Reflexión personal del PER.",
    sourceModel: "TASK",
    submissionMode: "NATIVE_FORM",
    contentTarget: "TASK_JSON",
    optional: false,
    triggerCondition: "SEQUENTIAL",
    countsTowardStageGate: true,
    fields: [
      { key: "date", label: "Fecha del encuentro", type: "date", required: true },
      { key: "reflection", label: "Reflexión personal del PER sobre el primer encuentro", type: "textarea", required: true },
    ],
  },
  {
    activityKey: "ACTIVIDAD_1_MOTIVACIONES",
    stage: "VINCULACION",
    order: 2,
    title: "Actividad 1: Motivaciones y expectativas del acompañado",
    sourceModel: "TASK",
    submissionMode: "NATIVE_FORM",
    contentTarget: "TASK_JSON",
    optional: false,
    triggerCondition: "SEQUENTIAL",
    countsTowardStageGate: true,
    fields: [
      { key: "date", label: "Fecha", type: "date", required: true },
      { key: "motivations", label: "Motivaciones de la persona acompañada", type: "textarea", required: true },
      { key: "expectations", label: "Expectativas frente al proceso de acompañamiento", type: "textarea", required: true },
    ],
  },
  {
    activityKey: "ACTIVIDAD_2_ANTECEDENTES",
    stage: "VINCULACION",
    order: 3,
    title: "Actividad 2: Guía para la exploración de antecedentes y contexto personal",
    sourceModel: "TASK",
    submissionMode: "NATIVE_FORM",
    contentTarget: "TASK_JSON",
    optional: false,
    triggerCondition: "SEQUENTIAL",
    countsTowardStageGate: true,
    fields: [
      { key: "date", label: "Fecha", type: "date", required: true },
      // 1. Presentacion y contexto
      { key: "alias", label: "¿Cómo te gustaría que te llamara?", type: "text", required: false, section: "1. Presentación y contexto" },
      { key: "talksAboutSelf", label: "¿Te gusta hablar de ti o prefieres que conversemos de otros temas?", type: "textarea", required: true, section: "1. Presentación y contexto" },
      // 2. Intereses y actividades
      { key: "freeTimeActivities", label: "¿Qué cosas te gusta hacer en tu tiempo libre?", type: "textarea", required: true, section: "2. Intereses y actividades" },
      { key: "hobbies", label: "¿Hay alguna actividad o hobby que te motive o relaje?", type: "textarea", required: false, section: "2. Intereses y actividades" },
      { key: "wantToLearn", label: "Si pudieras aprender algo nuevo, ¿qué sería?", type: "textarea", required: false, section: "2. Intereses y actividades" },
      { key: "currentWork", label: "¿Trabajas actualmente? Si estás trabajando, ¿en qué trabajas? Cuéntame sobre eso.", type: "textarea", required: false, section: "2. Intereses y actividades" },
      // 3. Experiencias generales
      { key: "proudMoment", label: "¿Recuerdas algún momento que te haya hecho sentir orgulloso/a de ti mismo/a?", type: "textarea", required: false, section: "3. Experiencias generales" },
      { key: "groupOrAlone", label: "¿Prefieres hacer actividades en grupo o solo/a?", type: "textarea", required: false, section: "3. Experiencias generales" },
      { key: "favoriteConversations", label: "¿Qué tipo de conversaciones disfrutas más?", type: "textarea", required: false, section: "3. Experiencias generales" },
      // 4. Preferencias y comodidad
      { key: "comfortFactors", label: "¿Hay algo que te haga sentir más cómodo/a en una conversación?", type: "textarea", required: false, section: "4. Preferencias y comodidad" },
      { key: "mediaPreferences", label: "¿Prefieres escuchar música, leer o ver películas/series? ¿Alguna recomendación?", type: "textarea", required: false, section: "4. Preferencias y comodidad" },
      { key: "favoritePlace", label: "¿Tienes algún lugar favorito donde te guste pasar el tiempo?", type: "textarea", required: false, section: "4. Preferencias y comodidad" },
      // 5. Cierre
      { key: "anythingElse", label: "¿Te gustaría agregar algo más sobre ti?", type: "textarea", required: false, section: "5. Cierre" },
      { key: "howDidYouFeel", label: "¿Cómo te sentiste en esta conversación?", type: "textarea", required: true, section: "5. Cierre" },
      { key: "extraQuestions", label: "Si se te ocurren más preguntas puedes escribirlas aquí", type: "textarea", required: false, section: "5. Cierre" },
    ],
  },
  {
    activityKey: "ACTIVIDAD_3_MAPA_RECURSOS",
    stage: "VINCULACION",
    order: 4,
    title: "Actividad 3: Mapa de recursos y necesidades",
    description: "Una fila por cada uno de los 9 ámbitos de recuperación (necesidades, fortalezas, importancia).",
    sourceModel: "TASK",
    submissionMode: "NATIVE_FORM",
    contentTarget: "IAP_DOMAIN_MAP",
    optional: false,
    triggerCondition: "SEQUENTIAL",
    countsTowardStageGate: true,
  },
  {
    activityKey: "ACTIVIDAD_4_PLANIFICACION",
    stage: "VINCULACION",
    order: 5,
    title: "Actividad 4: Planificación de objetivos y acciones",
    description: "Filas dinámicas: ámbito, objetivo, recursos, actividades, plazo.",
    sourceModel: "TASK",
    submissionMode: "NATIVE_FORM",
    contentTarget: "IAP_GOAL",
    optional: false,
    triggerCondition: "SEQUENTIAL",
    countsTowardStageGate: true,
  },
  {
    activityKey: "REGISTRO_ACOMPANAMIENTO",
    stage: "CONEXION",
    order: 0,
    title: "Registro de Acompañamiento",
    description: "Cada vez que se realiza un contacto semanal para implementar el plan de trabajo.",
    sourceModel: "SESSION_LOG",
    submissionMode: "NATIVE_FORM",
    contentTarget: null,
    optional: false,
    triggerCondition: "CONTINUOUS",
    countsTowardStageGate: false,
  },
  {
    activityKey: "ACTIVIDAD_5_INTERMEDIA",
    stage: "CONEXION",
    order: 1,
    title: "Actividad 5: Evaluación conjunta del proceso (Intermedia)",
    sourceModel: "TASK",
    submissionMode: "NATIVE_FORM",
    contentTarget: "TASK_JSON",
    optional: false,
    triggerCondition: "SEQUENTIAL",
    countsTowardStageGate: true,
    fields: EVALUATION_FIELDS,
  },
  {
    activityKey: "REFORMULAR_ACTIVIDAD_4",
    stage: "CONEXION",
    order: 2,
    title: "Reformular Actividad 4: Planificación de objetivos y acciones",
    description: "Solo si la Evaluación Intermedia determina que el plan debe ajustarse.",
    sourceModel: "TASK",
    submissionMode: "NATIVE_FORM",
    contentTarget: "IAP_GOAL",
    optional: true,
    triggerCondition: "SEQUENTIAL",
    countsTowardStageGate: true,
  },
  {
    activityKey: "ACTIVIDAD_5_FINAL",
    stage: "FINALIZACION",
    order: 1,
    title: "Actividad 5: Evaluación conjunta del proceso (Final)",
    sourceModel: "TASK",
    submissionMode: "NATIVE_FORM",
    contentTarget: "TASK_JSON",
    optional: false,
    triggerCondition: "SEQUENTIAL",
    countsTowardStageGate: true,
    fields: EVALUATION_FIELDS,
  },
  {
    activityKey: "ACTIVIDAD_6_REFLEXION_FINAL",
    stage: "FINALIZACION",
    order: 2,
    title: "Actividad 6: Reflexiones finales del PER",
    sourceModel: "TASK",
    submissionMode: "NATIVE_FORM",
    contentTarget: "TASK_JSON",
    optional: false,
    triggerCondition: "SEQUENTIAL",
    countsTowardStageGate: true,
    fields: [
      { key: "date", label: "Fecha", type: "date", required: true },
      { key: "personalReflections", label: "Reflexiones personales", type: "textarea", required: true },
    ],
  },
  {
    activityKey: "ENCUESTA_SATISFACCION",
    stage: "FINALIZACION",
    order: 3,
    title: "Encuesta de satisfacción del proceso",
    sourceModel: "TASK",
    submissionMode: "EXTERNAL_LINK",
    contentTarget: null,
    optional: false,
    triggerCondition: "SEQUENTIAL",
    countsTowardStageGate: true,
  },
  {
    activityKey: "FORMULARIO_ABANDONO_PA",
    stage: "FINALIZACION",
    order: 0,
    title: "Formulario de Abandono — Persona Acompañada",
    sourceModel: "TASK",
    submissionMode: "NATIVE_FORM",
    contentTarget: "TASK_JSON",
    optional: false,
    triggerCondition: "ON_WITHDRAWAL",
    countsTowardStageGate: false,
    fields: WITHDRAWAL_FIELDS,
  },
  {
    activityKey: "FORMULARIO_ABANDONO_PER",
    stage: "FINALIZACION",
    order: 0,
    title: "Formulario de Abandono — PER",
    sourceModel: "TASK",
    submissionMode: "NATIVE_FORM",
    contentTarget: "TASK_JSON",
    optional: false,
    triggerCondition: "ON_WITHDRAWAL",
    countsTowardStageGate: false,
    fields: WITHDRAWAL_FIELDS,
  },
];

export function getStepsForStage(stage: CaseStage): ItineraryStepDef[] {
  return ITINERARY_CATALOG.filter((s) => s.stage === stage).sort((a, b) => a.order - b.order);
}

export function getStepByActivityKey(activityKey: string): ItineraryStepDef | undefined {
  return ITINERARY_CATALOG.find((s) => s.activityKey === activityKey);
}

export function getSequentialStepsForStage(stage: CaseStage): ItineraryStepDef[] {
  return getStepsForStage(stage).filter((s) => s.triggerCondition === "SEQUENTIAL");
}
