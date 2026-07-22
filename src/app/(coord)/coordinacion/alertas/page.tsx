import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AppShell from "@/components/shell/AppShell";
import { validateTaskAction, returnTaskAction, resolveAlertAction } from "@/app/actions/coordinator";
import { mapAlertTypeToLabel } from "@/lib/nomenclatures";

export const dynamic = "force-dynamic";

export default async function CoordinatorAlertasPage() {
  const user = await getCurrentUser();

  // Enforce Coordinator role access
  if (!user || user.role !== "COORDINATOR" || !user.regionId) {
    redirect("/login");
  }

  // Fetch pending tasks needing coordinator approval
  const pendingTasks = await prisma.task.findMany({
    where: {
      regionId: user.regionId,
      status: { in: ["ENVIADA", "EN_REVISION"] },
    },
    include: {
      paCase: true,
      assignedTo: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Fetch active regional alerts for follow-up logs
  const activeAlerts = await prisma.alert.findMany({
    where: {
      regionId: user.regionId,
      status: "ABIERTA",
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        
        {/* Page Header */}
        <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <h3 className="font-extrabold text-base text-slate-900">Validación de Tareas y Notas de Apoyo</h3>
          <p className="text-xs text-slate-500 mt-1">
            Aprueba hitos documentales y regístralo en las notas de seguimiento y apoyo metodológico para los acompañamientos con retraso.
          </p>
        </div>

        {/* Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Pending Tasks Queue (Left side, takes 2 cols) */}
          <div className="lg:col-span-2 p-6 bg-card border border-border rounded-2xl shadow-sm space-y-4">
            <h4 className="font-semibold text-xs text-slate-500 uppercase tracking-wider">
              Hitos y Entregables en Espera de Validación ({pendingTasks.length})
            </h4>

            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1 text-xs">
              {pendingTasks.map((task) => (
                <div key={task.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition duration-300 hover:shadow-sm">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-800">{task.title}</span>
                      {task.paCase && (
                        <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold text-[9px]">
                          {task.paCase.code}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 leading-normal">{task.description}</p>
                    <div className="text-[10px] text-slate-400">
                      Entregado por: <span className="font-semibold text-slate-600">{task.assignedTo.name}</span>
                    </div>
                  </div>

                  <div className="flex flex-col xs:flex-row gap-2 items-stretch xs:items-center w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-200 mt-2 sm:mt-0">
                    <form action={returnTaskAction} className="flex flex-col xs:flex-row gap-1.5 items-stretch xs:items-center flex-1 w-full">
                      <input type="hidden" name="taskId" value={task.id} />
                      <input
                        type="text"
                        name="feedback"
                        placeholder="Observación de retorno..."
                        required
                        className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-[10px] flex-1 outline-none w-full"
                      />
                      <button
                        type="submit"
                        className="py-1.5 px-3 text-red-600 hover:bg-red-50 border border-red-200 rounded-xl font-bold text-center shrink-0 text-[10px]"
                      >
                        Devolver
                      </button>
                    </form>

                    <form action={async () => {
                      "use server";
                      await validateTaskAction(task.id);
                    }} className="w-full sm:w-auto">
                      <button
                        type="submit"
                        className="w-full sm:w-auto py-1.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl cursor-pointer text-center text-[10px]"
                      >
                        Aprobar
                      </button>
                    </form>
                  </div>
                </div>
              ))}

              {pendingTasks.length === 0 && (
                <p className="text-xs text-slate-400 py-4 text-center">No hay hitos pendientes de validación.</p>
              )}
            </div>
          </div>

          {/* Action Log / support notes sidebar (Right side, takes 1 col) */}
          <div className="p-6 bg-card border border-border rounded-2xl shadow-sm space-y-4">
            <h4 className="font-bold text-xs text-slate-500 uppercase tracking-wider">
              Casos que Requieren Apoyo Metodológico
            </h4>
            
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {activeAlerts.map((alert) => (
                <div key={alert.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="font-bold text-slate-900">
                      {mapAlertTypeToLabel(alert.type)}
                    </span>
                  </div>
                  <form action={resolveAlertAction} className="space-y-2">
                    <input type="hidden" name="alertId" value={alert.id} />
                    <textarea
                      name="note"
                      placeholder="Registrar notas de apoyo o resolución..."
                      required
                      rows={3}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-[10px] outline-none focus:border-primary resize-none"
                    ></textarea>
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        className="py-1 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded text-[9px] font-semibold cursor-pointer"
                      >
                        Guardar Registro
                      </button>
                    </div>
                  </form>
                </div>
              ))}
              {activeAlerts.length === 0 && (
                <p className="text-xs text-slate-450 py-4 text-center">✔️ Todos los acompañamientos al día.</p>
              )}
            </div>
          </div>

        </div>

      </div>
    </AppShell>
  );
}
