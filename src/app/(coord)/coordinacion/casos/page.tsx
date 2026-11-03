import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AppShell from "@/components/shell/AppShell";
import CaseName from "@/components/cases/CaseName";
import CaseAliasForm from "@/components/cases/CaseAliasForm";
import { CASE_ALIAS_MAX_LENGTH, formatCaseName, mapCaseStatusToLabel, mapEmotionToLabel, mapStageToLabel } from "@/lib/nomenclatures";
import {
  createDirectContinuityCaseAction,
  reassignCaseAction,
} from "@/app/actions/coordinator";
import { getItineraryState } from "@/server/services/itinerary.service";
import ItineraryValidationPanel from "@/components/coordinator/ItineraryValidationPanel";
import StageAdvanceButton from "@/components/coordinator/StageAdvanceButton";
import WithdrawalModal from "@/components/coordinator/WithdrawalModal";
import { REQUIRE_TEXT_FIELDS } from "@/lib/program-config";

export const dynamic = "force-dynamic";

export default async function CoordinatorCasosPage({
  searchParams,
}: {
  searchParams: Promise<{
    caseCode?: string;
    highlightCaseId?: string;
    error?: string;
  }>;
}) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const highlightCaseId = params.highlightCaseId;
  const errorMsg = params.error;

  // Enforce Coordinator role access
  if (!user || user.role !== "COORDINATOR" || !user.regionId) {
    redirect("/login");
  }

  const isDemo = Boolean(user.isDemo);

  // 1. Fetch Cases and PERs in region
  const regionalCases = await prisma.pACase.findMany({
    where: { regionId: user.regionId, isDemo },
    include: {
      candidate: true,
      per: { include: { user: true } },
    },
    orderBy: { code: "asc" },
  });

  const allRegionalPers = await prisma.pERProfile.findMany({
    where: { regionId: user.regionId, user: { active: true } },
    include: {
      user: true,
      cases: {
        where: {
          status: { notIn: ["EGRESO", "RETIRO_VOLUNTARIO", "DESERCION"] },
          isDemo,
        },
      },
    },
  });
  const regionalPers = allRegionalPers.filter((p) => Boolean(p.user?.isDemo) === isDemo);

  // 2. Generate Timeline if a case is selected
  const timelineEvents: Array<{
    date: Date;
    title: string;
    description: string;
    type: "status" | "contact" | "session" | "task";
    badgeColor: string;
  }> = [];

  let selectedCaseDetails = null;
  // "Al día" o "Atrasado" del caso, según tareas vencidas sin entregar y alertas abiertas de atraso.
  let isUpToDate = true;
  let itineraryState: Awaited<ReturnType<typeof getItineraryState>> | null = null;

  const targetCode = params.caseCode || (regionalCases.length > 0 ? regionalCases[0].code : null);

  if (targetCode) {
    const selectedCase = await prisma.pACase.findFirst({
      where: { code: targetCode, regionId: user.regionId, isDemo },
      include: {
        statusHistory: true,
        contactAttempts: true,
        sessionLogs: true,
        iapRecords: true,
        tasks: {
          include: {
            events: true,
          },
        },
        per: {
          include: {
            user: true,
          },
        },
      },
    });

    if (selectedCase) {
      selectedCaseDetails = selectedCase;

      const now = new Date();
      const hasOverdueTask = selectedCase.tasks.some(
        (t) => t.dueDate && t.dueDate < now && ["PENDIENTE", "EN_CURSO", "DEVUELTA", "ATRASADA"].includes(t.status)
      );
      const openDelayAlerts = await prisma.alert.count({
        where: {
          paCaseId: selectedCase.id,
          status: "ABIERTA",
          isDemo,
          type: { in: ["CASO_SIN_SESION", "TAREA_ATRASADA", "CASO_ETAPA_ESTANCADA"] },
        },
      });
      isUpToDate = !hasOverdueTask && openDelayAlerts === 0;

      if (["VINCULACION", "CONEXION", "FINALIZACION"].includes(selectedCase.status)) {
        itineraryState = await getItineraryState(selectedCase.id, isDemo);
      }

      // Map Status History
      selectedCase.statusHistory.forEach((h) => {
        timelineEvents.push({
          date: h.at,
          title: `Cambio de Fase: ${mapCaseStatusToLabel(h.toStatus)}`,
          description: `Transición desde ${mapCaseStatusToLabel(h.fromStatus)}. Motivo: ${h.reason || "No especificado"}`,
          type: "status",
          badgeColor: "bg-blue-50 text-blue-700 border border-blue-200",
        });
      });

      // Map Contact Attempts
      selectedCase.contactAttempts.forEach((c) => {
        timelineEvents.push({
          date: c.date,
          title: `Intento de Contacto (${c.channel})`,
          description: `Resultado: ${c.outcome}. Nota: ${c.note || "Ninguna"}`,
          type: "contact",
          badgeColor: "bg-amber-50 text-amber-700 border border-amber-200",
        });
      });

      // Map Sessions
      selectedCase.sessionLogs.forEach((s) => {
        timelineEvents.push({
          date: s.date,
          title: `Registro de Acompañamiento - Sesión #${s.sessionNumber} (${s.modality})`,
          description: `Asistencia: ${s.attendance}. Resumen: ${s.summary}. Estado emocional registrado en IAP: ${mapEmotionToLabel(s.perEmotion || "BIEN")}. Acuerdos: ${s.agreements || "Ninguno"}`,
          type: "session",
          badgeColor: "bg-emerald-50 text-emerald-700 border border-emerald-200",
        });
      });

      // Map Tasks & Events
      selectedCase.tasks.forEach((t) => {
        t.events.forEach((ev) => {
          timelineEvents.push({
            date: ev.at,
            title: `Hito: ${t.title}`,
            description: `Transición de estado: ${ev.fromStatus} ➡️ ${ev.toStatus}. ${ev.note ? `Comentario: ${ev.note}` : ""}`,
            type: "task",
            badgeColor: "bg-slate-50 text-slate-700 border border-slate-200",
          });
        });
      });

      // Sort timeline events chronologically (newest first)
      timelineEvents.sort((a, b) => b.date.getTime() - a.date.getTime());
    }
  }

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        
        {/* Page Header */}
        <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="font-extrabold text-base text-slate-900">Seguimiento y Línea de Tiempo de Casos</h3>
            <p className="text-xs text-slate-500 mt-1">
              Selecciona un caso en curso para monitorear el avance cronológico del itinerario de acompañamiento personalizado.
            </p>
          </div>

          <form method="GET" className="flex items-center gap-2">
            <select
              name="caseCode"
              defaultValue={targetCode || ""}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-1 focus:ring-primary font-semibold"
            >
              <option value="">-- Seleccionar Caso --</option>
              {regionalCases.map((c) => (
                <option key={c.id} value={c.code}>
                  {formatCaseName(c)} — {c.candidate?.sourceCenter || c.genderSelfId || "Ingreso Directo"} [PER: {c.per?.user?.name || "Sin PER"}] ({mapCaseStatusToLabel(c.status)})
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl cursor-pointer"
            >
              Cargar
            </button>
          </form>
        </div>

        {/* Selected Case Details & Timeline */}
        {selectedCaseDetails ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Timeline (Left side, takes 2 cols) */}
            <div className="lg:col-span-2 p-6 bg-card border border-border rounded-2xl shadow-sm space-y-6">
              <h4 className="font-bold text-sm text-slate-800">Historial Cronológico de Hitos</h4>
              
              <div className="relative border-l border-slate-200 pl-6 ml-3 space-y-6">
                {timelineEvents.map((ev, index) => (
                  <div key={index} className="relative">
                    {/* Node Bullet */}
                    <span className="absolute -left-[31px] top-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-slate-300 flex items-center justify-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                    </span>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-bold text-xs text-slate-900">{ev.title}</h4>
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${ev.badgeColor}`}>
                          {ev.type.toUpperCase()}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {ev.date.toLocaleString("es-CL")}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {ev.description}
                      </p>
                    </div>
                  </div>
                ))}
                {timelineEvents.length === 0 && (
                  <p className="text-xs text-slate-400 py-4">No se han registrado hitos en el Registro de Acompañamiento de este caso.</p>
                )}
              </div>
            </div>

            {/* Case Details Card & Actions (Right side, takes 1 col) */}
            <div className="space-y-6">
              {errorMsg && (
                <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-xs font-semibold rounded-2xl flex items-start gap-2 shadow-sm animate-pulse">
                  <span className="text-sm shrink-0">⚠️</span>
                  <div className="flex-1 space-y-1">
                    <p className="font-bold text-red-900">Requisito Metodológico del Convenio</p>
                    <p className="font-normal text-[11px] leading-relaxed text-red-755">{decodeURIComponent(errorMsg)}</p>
                  </div>
                </div>
              )}

              <div className={`p-6 bg-card border rounded-2xl shadow-sm space-y-4 transition duration-300 ${
                selectedCaseDetails.id === highlightCaseId 
                  ? "border-blue-400 bg-blue-50/10 shadow-md animate-highlight" 
                  : "border-border"
              }`}>
                <h4 className="font-bold text-sm text-slate-800">Detalles del Acompañamiento</h4>
                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Persona Acompañada</span>
                    <CaseName
                      code={selectedCaseDetails.code}
                      alias={selectedCaseDetails.alias}
                      className="font-bold text-slate-800 text-sm block"
                    />
                    <CaseAliasForm
                      key={`${selectedCaseDetails.id}-${selectedCaseDetails.alias || ""}`}
                      caseId={selectedCaseDetails.id}
                      alias={selectedCaseDetails.alias}
                    />
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Acompañante PER</span>
                    <span className="font-semibold text-slate-800">{selectedCaseDetails.per.user.name}</span>
                  </div>

                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Fase Metodológica</span>
                    {["VINCULACION", "CONEXION", "FINALIZACION"].includes(selectedCaseDetails.status) ? (
                      <span
                        className={`px-2 py-0.5 rounded border font-bold text-[10px] inline-block ${
                          isUpToDate
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : "bg-amber-50 text-amber-800 border-amber-200"
                        }`}
                      >
                        {isUpToDate ? "Al día" : "Atrasado"} ({mapStageToLabel(selectedCaseDetails.status)})
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-bold text-[10px] inline-block">
                        {mapCaseStatusToLabel(selectedCaseDetails.status)}
                      </span>
                    )}
                  </div>

                </div>
              </div>

              {!["EGRESO", "RETIRO_VOLUNTARIO", "DESERCION"].includes(selectedCaseDetails.status) && (
                <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
                  <div>
                    <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
                      Reasignar Acompañante
                    </h4>
                    <p className="text-[10px] text-slate-500 mt-1">
                      Cambia el PER a cargo de este caso. Se libera el cupo del PER actual y se notifica a ambos.
                    </p>
                  </div>

                  <form action={reassignCaseAction} className="space-y-3">
                    <input type="hidden" name="caseId" value={selectedCaseDetails.id} />
                    <input type="hidden" name="caseCode" value={selectedCaseDetails.code} />
                    <div className="space-y-1">
                      <label className="font-semibold text-xs text-slate-700 block">Nuevo PER a cargo</label>
                      <select
                        name="newPerId"
                        required
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold"
                      >
                        <option value="">-- Seleccionar --</option>
                        {regionalPers.map((p) => (
                          <option key={p.id} value={p.id}>{p.user.name} ({p.cases.length} casos activos)</option>
                        ))}
                      </select>
                      {regionalPers.length === 0 && (
                        <p className="text-[10px] text-amber-600 mt-1">
                          No hay otro PER habilitado en la región.
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label className="font-semibold text-xs text-slate-700 block">Motivo de la reasignación</label>
                      <textarea
                        name="reason"
                        required={REQUIRE_TEXT_FIELDS}
                        rows={2}
                        placeholder="Ej. Retiro del PER, sobrecarga, cambio de dupla acordado..."
                        className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs resize-none"
                      ></textarea>
                    </div>
                    <button
                      type="submit"
                      disabled={regionalPers.length === 0}
                      className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs"
                    >
                      Reasignar Caso
                    </button>
                  </form>
                </div>
              )}

              {/* Itinerary Validation Panel */}
              {itineraryState && (
                <ItineraryValidationPanel
                  caseId={selectedCaseDetails.id}
                  stageLabel={mapStageToLabel(itineraryState.stage)}
                  steps={itineraryState.steps}
                  continuousStep={itineraryState.continuousStep}
                />
              )}

              {/* Status Transition Actions */}
              {["VINCULACION", "CONEXION", "FINALIZACION"].includes(selectedCaseDetails.status) && itineraryState && (
                <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
                  <h4 className="font-bold text-xs text-slate-500 uppercase tracking-wider">Acciones de Fase</h4>

                  {/* Next Phase Transition Button */}
                  {selectedCaseDetails.status === "VINCULACION" && (
                    <StageAdvanceButton
                      caseId={selectedCaseDetails.id}
                      toStatus="CONEXION"
                      label="➡️ Avanzar a Conexión (Fase 3)"
                      reason="Tránsito a fase de Conexión"
                      gateSatisfied={itineraryState.gate.satisfied}
                      missingTitles={itineraryState.gate.missing.map((s) => s.title)}
                    />
                  )}

                  {selectedCaseDetails.status === "CONEXION" && (
                    <StageAdvanceButton
                      caseId={selectedCaseDetails.id}
                      toStatus="FINALIZACION"
                      label="➡️ Avanzar a Finalización (Fase 4)"
                      reason="Tránsito a fase de Finalización"
                      gateSatisfied={itineraryState.gate.satisfied}
                      missingTitles={itineraryState.gate.missing.map((s) => s.title)}
                    />
                  )}

                  {selectedCaseDetails.status === "FINALIZACION" && (
                    <div className="space-y-2">
                      <StageAdvanceButton
                        caseId={selectedCaseDetails.id}
                        toStatus="EGRESO"
                        label="🎓 Concluir y Egresar Caso"
                        reason="Egreso por cumplimiento de objetivos"
                        gateSatisfied={itineraryState.gate.satisfied}
                        missingTitles={itineraryState.gate.missing.map((s) => s.title)}
                        colorClass="bg-emerald-600 hover:bg-emerald-700"
                      />
                      <p className="text-[9px] text-slate-400 leading-normal">
                        Nota: Requiere que Actividad 5 (Final), Actividad 6 y la Encuesta de Satisfacción estén validados.
                      </p>
                    </div>
                  )}

                  {/* Forced Withdrawal (Retiro Voluntario / Deserción) */}
                  <div className="border-t border-slate-100 pt-4">
                    <WithdrawalModal
                      caseId={selectedCaseDetails.id}
                      caseCode={selectedCaseDetails.code}
                      withdrawalStep={itineraryState.pendingWithdrawalStep}
                    />
                  </div>

                </div>
              )}

            </div>

          </div>
        ) : (
          /* When no case is selected: Display notice + Direct Continuity form side-by-side */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            <div className="lg:col-span-2 p-12 text-center text-xs text-slate-400 bg-white border border-slate-200 rounded-2xl flex flex-col items-center justify-center space-y-2">
              <span className="text-4xl">🤝</span>
              <p className="font-medium text-slate-500">Selecciona un caso en el menú superior derecho para desplegar su ficha operativa y línea de tiempo.</p>
            </div>

            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
              <div className="border-b pb-2">
                <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🚀</span> Ingreso Directo de Continuidad
                </h4>
                <p className="text-[10px] text-slate-400 mt-1">
                  Omite el embudo de preselección para ingresar un caso de continuidad directamente asignado a un PER.
                </p>
              </div>

              <form action={createDirectContinuityCaseAction} className="space-y-3.5 text-xs">

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Asignar a PER:</label>
                  <select
                    name="perId"
                    required
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none font-semibold"
                  >
                    <option value="">Selecciona PER...</option>
                    {regionalPers.map(p => (
                      <option key={p.id} value={p.id}>{p.user.name} ({p.cases.length} casos activos)</option>
                    ))}
                  </select>
                  {regionalPers.length === 0 && (
                    <p className="text-[10px] text-amber-600">
                      No hay PER habilitados en la región.
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Justificación del Emparejamiento:</label>
                  <textarea 
                    name="matchRationale" 
                    required={REQUIRE_TEXT_FIELDS} 
                    rows={2} 
                    placeholder="Escribe el motivo del emparejamiento..."
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none resize-none"
                  ></textarea>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Género:</label>
                  <select name="gender" required className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none font-semibold">
                    <option value="Femenino">Femenino</option>
                    <option value="Masculino">Masculino</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Rango Etario:</label>
                  <select name="ageRange" required className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none font-semibold">
                    <option value="18-29">18 - 29 años</option>
                    <option value="30-49">30 - 49 años</option>
                    <option value="50+">50+ años</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Nivel Educativo:</label>
                  <select name="educationLevel" required className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none font-semibold">
                    <option value="Basica">Básica Completa/Incompleta</option>
                    <option value="Media">Media Completa</option>
                    <option value="Tecnica">Técnica Superior</option>
                    <option value="Profesional">Universitaria / Profesional</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Situación Laboral:</label>
                  <select name="employmentStatus" required className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none font-semibold">
                    <option value="Desocupado">Desocupado / Buscando trabajo</option>
                    <option value="Informal">Independiente / Informal</option>
                    <option value="Formal">Trabajador Formal contratado</option>
                  </select>
                </div>

                <button
                  type="submit" 
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition shadow cursor-pointer text-center block"
                >
                  🚀 Crear Caso e Iniciar
                </button>
              </form>
            </div>

          </div>
        )}

      </div>
    </AppShell>
  );
}
