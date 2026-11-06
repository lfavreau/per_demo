// Contenido inventado para los casos del modo demo: da historia a las actividades anteriores de cada caso.
// Nada de esto describe a una persona real: no hay nombres, RUN ni datos identificables.
import { RECOVERY_DOMAINS } from "./instrument-itinerary";

const pick = <T>(items: readonly T[], variant: number): T => items[((variant % items.length) + items.length) % items.length];

const MOTIVATIONS = [
  "Quiere retomar su rutina diaria y recuperar la confianza de su familia. Siente que este es un buen momento para ordenar su situación.",
  "Le motiva volver a trabajar de forma estable y tener ingresos propios. Dice que quiere sentirse útil de nuevo.",
  "Busca reconstruir su red de apoyo y retomar los estudios que dejó pendientes. Le entusiasma la idea de tener metas claras.",
] as const;

const EXPECTATIONS = [
  "Espera contar con una persona que lo escuche sin juzgar y que lo ayude a conectarse con los servicios de la comuna.",
  "Espera avanzar paso a paso, con metas pequeñas que pueda cumplir, y recibir orientación para buscar empleo.",
  "Espera que el acompañamiento le ayude a mantener la constancia y a pedir ayuda cuando la necesite.",
] as const;

const REFLECTIONS = [
  "El primer encuentro fue cordial. La persona llegó puntual, se mostró algo nerviosa al comienzo y fue soltándose a medida que conversamos. Acordamos vernos una vez por semana.",
  "Conversamos en un lugar tranquilo cerca de su casa. Hubo buena disposición y varias preguntas sobre cómo funciona el acompañamiento. Quedó interesada en seguir.",
  "Fue un encuentro breve pero positivo. Se comprometió a asistir al siguiente y mencionó que le gustaría trabajar primero el tema laboral.",
] as const;

const NEEDS: Record<string, readonly string[]> = {
  "Apoyo social": ["Retomar el contacto con familiares cercanos.", "Ampliar su red más allá de la familia."],
  "Ejercicio de ciudadanía": ["Actualizar documentos personales.", "Informarse sobre trámites y beneficios a los que puede acceder."],
  "Tiempo libre": ["Encontrar actividades gratuitas en su comuna.", "Reservar tiempo semanal para el descanso."],
  Empleo: ["Armar un currículum y contactar a la oficina municipal de empleo.", "Conseguir un trabajo estable de media jornada."],
  "Situación judicial": ["Aclarar el estado de sus trámites pendientes.", "Contar con orientación jurídica gratuita."],
  "Educación y formación": ["Retomar la nivelación de estudios.", "Participar en un curso corto de capacitación."],
  Habitabilidad: ["Mejorar las condiciones de su vivienda.", "Mantener una situación de vivienda estable."],
  "Situación financiera": ["Ordenar sus gastos mensuales.", "Regularizar deudas pequeñas pendientes."],
  "Física y mental": ["Retomar controles de salud en el consultorio.", "Mantener rutinas de sueño y actividad física."],
};

const STRENGTHS = [
  "Constancia cuando una meta le hace sentido.",
  "Buena disposición para conversar y pedir orientación.",
  "Apoyo de una persona cercana que lo anima.",
  "Experiencia previa en trabajos manuales.",
  "Ganas de aprender y probar cosas nuevas.",
] as const;

/** Prioridad por ámbito; cambia de un caso a otro para que no todos se vean iguales. */
const PRIORITY_PATTERNS: ReadonlyArray<readonly string[]> = [
  ["MEDIO", "BAJO", "BAJO", "ALTO", "MEDIO", "ALTO", "MEDIO", "ALTO", "MEDIO"],
  ["ALTO", "MEDIO", "BAJO", "ALTO", "BAJO", "MEDIO", "ALTO", "MEDIO", "BAJO"],
  ["MEDIO", "MEDIO", "BAJO", "MEDIO", "ALTO", "ALTO", "ALTO", "BAJO", "MEDIO"],
];

export function demoDomainRows(variant: number) {
  const priorities = pick(PRIORITY_PATTERNS, variant);
  return RECOVERY_DOMAINS.map((domain, index) => ({
    recoveryDomainId: domain,
    needs: pick(NEEDS[domain], variant + index),
    strengths: pick(STRENGTHS, variant + index),
    importance: priorities[index],
  }));
}

const GOAL_TEXTS: Record<string, { objective: string; resources: string; activities: string }> = {
  Empleo: {
    objective: "Conseguir un trabajo estable de al menos media jornada.",
    resources: "Oficina municipal de empleo, currículum actualizado, contactos personales.",
    activities: "Armar el currículum, inscribirse en la bolsa de empleo y postular a dos ofertas por semana.",
  },
  "Educación y formación": {
    objective: "Retomar la nivelación de estudios.",
    resources: "Centro de educación para adultos de la comuna.",
    activities: "Consultar horarios y requisitos, matricularse y asistir a las primeras clases.",
  },
  "Situación financiera": {
    objective: "Ordenar los gastos del mes y regularizar las deudas pendientes.",
    resources: "Planilla simple de gastos, orientación financiera gratuita.",
    activities: "Anotar ingresos y gastos cada semana y definir un plan de pago de las deudas.",
  },
  Habitabilidad: {
    objective: "Mejorar las condiciones de la vivienda.",
    resources: "Programas de mejoramiento de la municipalidad, apoyo familiar.",
    activities: "Reunir la documentación y consultar por los programas disponibles.",
  },
  "Apoyo social": {
    objective: "Fortalecer la red de apoyo cercana.",
    resources: "Familiares, vecinos y organizaciones del barrio.",
    activities: "Retomar el contacto con dos familiares y participar en una actividad comunitaria.",
  },
  "Física y mental": {
    objective: "Retomar los controles de salud y mantener rutinas saludables.",
    resources: "Consultorio de la comuna, programa de salud mental local.",
    activities: "Pedir hora de control y caminar al menos tres veces por semana.",
  },
};

/** Objetivos de la Actividad 4: los ámbitos de mayor prioridad del mapa de la Actividad 3. */
export function demoGoalRows(variant: number) {
  const rows = demoDomainRows(variant);
  const rank = { ALTO: 0, MEDIO: 1, BAJO: 2 } as Record<string, number>;
  const chosen = rows
    .filter((r) => GOAL_TEXTS[r.recoveryDomainId])
    .sort((a, b) => rank[a.importance] - rank[b.importance])
    .slice(0, 2 + (variant % 2));
  return chosen.map((r, index) => ({ recoveryDomainId: r.recoveryDomainId, ...GOAL_TEXTS[r.recoveryDomainId], targetWeek: 6 + index * 8 + (variant % 3) }));
}

/** Respuestas de los formularios de texto simple (TASK_JSON) de cada actividad. */
export function demoTaskContent(activityKey: string, variant: number, date: string): Record<string, unknown> | null {
  switch (activityKey) {
    case "PRIMER_ENCUENTRO_REFLEXION":
      return { date, reflection: pick(REFLECTIONS, variant) };
    case "ACTIVIDAD_1_MOTIVACIONES":
      return { date, motivations: pick(MOTIVATIONS, variant), expectations: pick(EXPECTATIONS, variant) };
    case "ACTIVIDAD_2_ANTECEDENTES":
      return {
        date,
        alias: "",
        talksAboutSelf: "Prefiere conversar de temas concretos y, con el tiempo, se abre a hablar de sí misma.",
        freeTimeActivities: "Caminar, escuchar música y ver series con su familia.",
        hobbies: "Cocinar y cuidar las plantas de su casa.",
        wantToLearn: "Computación básica para postular a empleos.",
        currentWork: "Trabajos esporádicos; busca algo más estable.",
        proudMoment: "Haber terminado un curso corto que empezó con dudas.",
        groupOrAlone: "Se siente más cómoda en grupos pequeños.",
        favoriteConversations: "Las que parten de experiencias del día a día.",
        comfortFactors: "Un lugar tranquilo y que no la interrumpan.",
        mediaPreferences: "Música y programas de cocina.",
        favoritePlace: "La plaza cercana a su casa.",
        anythingElse: "Quiere avanzar a su ritmo.",
        howDidYouFeel: "Se sintió escuchada y a gusto con la conversación.",
        extraQuestions: "Preguntó cuánto dura el acompañamiento y cada cuánto nos veremos.",
      };
    case "ACTIVIDAD_5_INTERMEDIA":
    case "ACTIVIDAD_5_FINAL": {
      const final = activityKey === "ACTIVIDAD_5_FINAL";
      return {
        date,
        advances: final
          ? "Cumplió la mayor parte de las metas que se propuso y mantiene una rutina estable."
          : "Ha avanzado en sus metas de empleo y estudios; asiste con regularidad a los encuentros.",
        difficulties: "Los horarios y el cansancio de algunas semanas hicieron más lento el avance.",
        keyResources: "El apoyo de su familia y los servicios municipales fueron clave.",
        skillsLearned: "Aprendió a organizar su tiempo y a pedir ayuda cuando la necesita.",
        autonomyReadiness: final ? "Se siente preparada para seguir sola, con apoyo puntual." : "Se siente cada vez más segura, aunque aún necesita acompañamiento.",
        futureActions: "Mantener los controles de salud y seguir postulando a empleos.",
        adjustmentsNeeded: final ? "Ninguno." : "Revisar los plazos de las metas de empleo.",
        jointComments: "La evaluación se conversó con calma y quedó conforme con el balance.",
      };
    }
    case "ACTIVIDAD_6_REFLEXION_FINAL":
      return {
        date,
        personalReflections: "Fue un proceso de aprendizaje mutuo. Valoro la constancia de la persona acompañada y lo que significó para mí poder acompañarla.",
      };
    default:
      return null;
  }
}

export const DEMO_SURVEY_URL = "https://forms.example.org/encuesta-satisfaccion-demo";
