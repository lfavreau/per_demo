import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AppShell from "@/components/shell/AppShell";
import { logSupervisionAction, updatePerStatusAction } from "@/app/actions/coordinator";

export const dynamic = "force-dynamic";

export default async function CoordinatorSupervisionesPage({
  searchParams,
}: {
  searchParams: Promise<{ highlightSupervisionId?: string }>;
}) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const highlightSupervisionId = params.highlightSupervisionId;

  // Enforce Coordinator role access
  if (!user || user.role !== "COORDINATOR" || !user.regionId) {
    redirect("/login");
  }

  // Fetch regional PER profiles with active cases
  const perProfiles = await prisma.pERProfile.findMany({
    where: { regionId: user.regionId },
    include: {
      user: true,
      cases: {
        where: {
          status: { notIn: ["EGRESO", "RETIRO_VOLUNTARIO", "DESERCION"] },
        },
      },
    },
    orderBy: { user: { name: "asc" } },
  });

  const isDemo = Boolean(user.isDemo);

  // Fetch recent regional supervisions from the region
  const recentSupervisions = await prisma.supervision.findMany({
    where: { regionId: user.regionId, isDemo },
    orderBy: { date: "desc" },
    take: 8,
  });

  const now = new Date();
  const perComplianceList = perProfiles.map((per) => {
    // Filter supervisions in memory for this PER profile
    const perSups = recentSupervisions.filter(s => s.perId === per.id);
    const latestSup = perSups[0];
    const lastDate = latestSup ? new Date(latestSup.date) : null;
    
    let daysSinceLast = 999;
    if (lastDate) {
      daysSinceLast = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    }
    
    let alertStatus: "RED" | "YELLOW" | "GREEN" = "GREEN";
    if (daysSinceLast >= 30) {
      alertStatus = "RED";
    } else if (daysSinceLast >= 15) {
      alertStatus = "YELLOW";
    }
    
    const totalMinutes = perSups.reduce((acc, sup) => acc + sup.durationMinutes, 0);
    const totalHours = Math.round((totalMinutes / 60) * 10) / 10;

    return {
      per,
      lastDate,
      daysSinceLast,
      alertStatus,
      totalHours,
    };
  });

  const perUserMap = new Map(perProfiles.map((p) => [p.id, p.user.name]));

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        
        {/* Page Header */}
        <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <h3 className="font-extrabold text-base text-slate-900">Dotación PER y Supervisiones</h3>
          <p className="text-xs text-slate-500 mt-1">
            Monitorea el estado de habilitación técnica, registra supervisiones de dupla y controla el cumplimiento metodológico semanal y quincenal de los acompañantes.
          </p>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main List: PER Profiles & Compliance Status (Takes 2 cols) */}
          <div className="lg:col-span-2 space-y-6">
            
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
              <h4 className="font-bold text-xs text-slate-500 uppercase tracking-wider">
                Profesionales de Acompañamiento Habilitados ({perProfiles.length})
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {perComplianceList.map(({ per, lastDate, daysSinceLast, alertStatus, totalHours }) => {
                  const isCertified = per.certificationStatus === "HABILITADO";
                  return (
                    <div 
                      key={per.id} 
                      className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 text-xs ${
                        alertStatus === "RED" 
                          ? "bg-rose-50/50 border-rose-200" 
                          : alertStatus === "YELLOW" 
                          ? "bg-amber-50/50 border-amber-200" 
                          : "bg-slate-50 border-slate-200"
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-bold text-slate-800 text-sm">{per.user.name}</h4>
                            <p className="text-[10px] text-slate-500 mt-0.5">Generación: {per.generation}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                            <span
                              className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                isCertified
                                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                                  : per.certificationStatus === "PENDIENTE"
                                  ? "bg-amber-50 text-amber-800 border border-amber-200"
                                  : "bg-red-50 text-red-800 border border-red-200"
                              }`}
                            >
                              {per.certificationStatus}
                            </span>
                            <form action={updatePerStatusAction}>
                              <input type="hidden" name="perId" value={per.id} />
                              <input type="hidden" name="status" value={isCertified ? "PENDIENTE" : "HABILITADO"} />
                              <button
                                type="submit"
                                className={`px-2 py-0.5 rounded text-[8px] font-bold cursor-pointer transition border ${
                                  isCertified
                                    ? "bg-slate-100 hover:bg-rose-50 text-rose-700 border-slate-200 hover:border-rose-200"
                                    : "bg-blue-600 hover:bg-blue-700 text-white border-blue-700"
                                }`}
                              >
                                {isCertified ? "⚙️ Suspender" : "⚙️ Habilitar"}
                              </button>
                            </form>
                          </div>
                        </div>

                        {/* Case load & cumulative hours */}
                        <div className="grid grid-cols-2 gap-2 py-2 border-t border-b border-slate-200/60 text-[10px]">
                          <div>
                            <span className="text-slate-400 block">Casos Activos:</span>
                            <span className="font-bold text-slate-700">{per.cases.length} / 5 cupos</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Horas Supervisión:</span>
                            <span className="font-bold text-slate-700">{totalHours} hrs</span>
                          </div>
                        </div>

                        {/* Last supervision tracking */}
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-[10px] text-slate-500">Última Supervisión:</span>
                          <span className="font-bold text-slate-700">
                            {lastDate ? lastDate.toLocaleDateString("es-CL") : "Sin registros"}
                          </span>
                        </div>
                      </div>

                      {/* Compliance Alert Indicator */}
                      {alertStatus === "RED" ? (
                        <div className="p-2 bg-red-100/70 text-red-900 border border-red-200 rounded-lg text-[9px] font-bold text-center">
                          🔴 CRÍTICO: Más de 30 días sin supervisión ({daysSinceLast} días)
                        </div>
                      ) : alertStatus === "YELLOW" ? (
                        <div className="p-2 bg-amber-100/70 text-amber-900 border border-amber-200 rounded-lg text-[9px] font-bold text-center">
                          ⚠️ ALERTA: Más de 15 días sin supervisión ({daysSinceLast} días)
                        </div>
                      ) : (
                        <div className="p-2 bg-emerald-100/70 text-emerald-950 border border-emerald-200 rounded-lg text-[9px] font-bold text-center">
                          💚 CUMPLIMIENTO AL DÍA
                        </div>
                      )}
                    </div>
                  );
                })}

                {perProfiles.length === 0 && (
                  <div className="col-span-full py-8 text-center text-slate-400">
                    No hay profesionales asignados en tu región.
                  </div>
                )}
              </div>
            </div>

            {/* List of Recent Supervisions */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
              <h4 className="font-bold text-xs text-slate-500 uppercase tracking-wider">
                Bitácora de Supervisiones Recientes
              </h4>
              <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1 text-xs">
                {recentSupervisions.map((sup) => (
                  <div 
                    key={sup.id} 
                    className={`p-3 border rounded-xl flex justify-between items-center transition duration-300 ${
                      sup.id === highlightSupervisionId 
                        ? "bg-blue-50 border-blue-400 shadow-sm animate-highlight" 
                        : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800">{perUserMap.get(sup.perId) || "PER"}</span>
                        <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[9px] font-bold">
                          {sup.durationMinutes} min
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-normal">Tema: {sup.observations || "Sin temario"}</p>
                    </div>
                    <span className="text-[10px] text-slate-400 font-semibold">
                      {new Date(sup.date).toLocaleDateString("es-CL")}
                    </span>
                  </div>
                ))}

                {recentSupervisions.length === 0 && (
                  <p className="text-xs text-slate-400 py-4 text-center">No se han registrado supervisiones aún.</p>
                )}
              </div>
            </div>

          </div>

          {/* Sidebar Form: Register Supervision (Takes 1 col) */}
          <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4 h-fit">
            <div className="border-b pb-2">
              <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <span>📝</span> Registrar Reunión de Supervisión
              </h4>
              <p className="text-[10px] text-slate-400 mt-1">
                Completa los datos para registrar la supervisión técnica y agendar automáticamente el evento en Google Calendar.
              </p>
            </div>

            <form action={logSupervisionAction} className="space-y-4 text-xs">
              
              {/* PER Select */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Profesional a Supervisar (PER):</label>
                <select 
                  name="perId" 
                  required 
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold outline-none focus:border-blue-600"
                >
                  <option value="">Selecciona un PER...</option>
                  {perProfiles.map(p => (
                    <option key={p.id} value={p.id}>{p.user.name}</option>
                  ))}
                </select>
              </div>

              {/* Date Input */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Fecha del Encuentro:</label>
                <input 
                  type="date" 
                  name="date" 
                  required 
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold outline-none focus:border-blue-600" 
                />
              </div>

              {/* Duration Input */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Duración (Minutos):</label>
                <select 
                  name="durationMinutes" 
                  required
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold outline-none focus:border-blue-600"
                >
                  <option value="30">30 minutos</option>
                  <option value="45">45 minutos</option>
                  <option value="60">1 hora</option>
                  <option value="90">1.5 horas</option>
                  <option value="120">2 horas</option>
                </select>
              </div>

              {/* Topic TextArea */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 block">Temario y Acuerdos:</label>
                <textarea 
                  name="topic" 
                  required 
                  rows={4} 
                  placeholder="Escribe los temas abordados, dificultades y compromisos de la dupla..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-semibold outline-none focus:border-blue-600 resize-none"
                ></textarea>
              </div>

              {/* Submit button */}
              <button 
                type="submit" 
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition duration-150 shadow-md cursor-pointer text-center block"
              >
                💾 Registrar y Agendar
              </button>

            </form>
          </div>

        </div>

      </div>
    </AppShell>
  );
}
