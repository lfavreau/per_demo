import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
import AppShell from "@/components/shell/AppShell";
import SessionLogForm from "@/components/sessions/SessionLogForm";
import TaskSubmitForm from "@/components/tasks/TaskSubmitForm";
import { mapCaseStatusToLabel } from "@/lib/nomenclatures";

export default async function PERDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ highlightCaseId?: string; highlightSessionId?: string; highlightSupervisionId?: string }>;
}) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const highlightCaseId = params.highlightCaseId;
  const highlightSessionId = params.highlightSessionId;
  const highlightSupervisionId = params.highlightSupervisionId;

  // Enforce auth and PER role access
  if (!user || user.role !== "PER") {
    redirect("/login");
  }

  // 1. Fetch PER Profile
  const profile = await prisma.pERProfile.findUnique({
    where: { userId: user.id },
  });
  if (!profile) {
    return (
      <main className="p-8 text-center text-xs space-y-4 bg-slate-50 text-slate-800 min-h-screen">
        <p className="font-bold text-red-700">⚠️ Tu perfil PER no se encuentra configurado en la base de datos.</p>
        <p className="text-slate-500">Por favor contacta a administración o al coordinador regional.</p>
      </main>
    );
  }

  const isDemo = Boolean(user.isDemo);

  // 2. Fetch Active Cases for this PER
  const activeCases = await prisma.pACase.findMany({
    where: {
      perId: profile.id,
      isDemo,
      status: { notIn: ["EGRESO", "RETIRO_VOLUNTARIO", "DESERCION"] },
    },
    select: {
      id: true,
      code: true,
      status: true,
      type: true,
    },
  });

  // 3. Fetch Tasks assigned to this PER
  const tasks = await prisma.task.findMany({
    where: {
      assignedToUserId: user.id,
      isDemo,
    },
    include: {
      paCase: {
        select: {
          code: true,
        },
      },
      feedbacks: {
        select: {
          text: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    },
    orderBy: {
      dueDate: "asc",
    },
  });

  // 4. Fetch recent avisos/notificaciones (Feedbacks)
  const notifications = await prisma.feedback.findMany({
    where: {
      perId: user.id,
      status: "ENVIADA",
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 5,
  });

  // 5. Fetch recent session logs submitted by this PER
  const sessionHistory = await prisma.sessionLog.findMany({
    where: {
      perId: user.id,
      isDemo,
    },
    include: {
      paCase: true,
    },
    orderBy: {
      date: "desc",
    },
    take: 5,
  });

  // 6. Fetch recent supervisions for this PER
  const supervisions = await prisma.supervision.findMany({
    where: {
      perId: profile.id,
      isDemo,
    },
    orderBy: {
      date: "desc",
    },
    take: 5,
  });

  // Recovery domains catalog
  const recoveryDomains = [
    "Apoyo social",
    "Ejercicio de ciudadanía",
    "Tiempo libre",
    "Empleo",
    "Situación judicial",
    "Educación y formación",
    "Habitabilidad",
    "Situación financiera",
    "Física y mental",
  ];

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        
        {/* Verification of Certification status banner for unhabilitated PERs */}
        {profile.certificationStatus !== "HABILITADO" && (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-2xl space-y-2 text-xs">
            <h4 className="font-bold text-destructive">🛑 Estado: No Habilitado para Terreno</h4>
            <p className="text-slate-700 leading-relaxed">
              Motivo: {profile.certificationNote || "Falta completar inducción o código de ética."}
            </p>
            <p className="text-[10px] text-slate-500">
              Las tareas críticas del programa (ej. Acta primer encuentro, IAP) se encuentran bloqueadas para tu usuario hasta que el coordinador valide tus antecedentes.
            </p>
          </div>
        )}

        {/* Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Column: Session log registration & active cases summary */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Session log registration Form */}
            <SessionLogForm cases={activeCases} domains={recoveryDomains} />

            {/* Active Cases Cohort Summary */}
            <div className="p-6 bg-card border border-border rounded-2xl shadow-sm">
              <h3 className="font-bold text-sm text-slate-800 mb-3">
                Mis Acompañamientos Activos ({activeCases.length})
              </h3>
              <div className="space-y-3 text-xs">
                {activeCases.map((c) => (
                  <div 
                    key={c.id} 
                    className={`p-3 border rounded-xl flex justify-between items-center transition duration-300 ${
                      c.id === highlightCaseId 
                        ? "bg-blue-50 border-blue-400 shadow-sm animate-highlight font-bold" 
                        : "bg-secondary/35 border-border/50"
                    }`}
                  >
                    <div>
                      <span className="font-bold text-primary">{c.code}</span>
                      <span className="text-[10px] text-slate-500 ml-2">Tipo: {c.type}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold text-[10px]">
                      {mapCaseStatusToLabel(c.status)}
                    </span>
                  </div>
                ))}
                {activeCases.length === 0 && (
                  <p className="text-slate-400 text-center py-4">No tienes acompañamientos activos asignados.</p>
                )}
              </div>
            </div>

            {/* Recent Session Logs History */}
            <div className="p-6 bg-card border border-border rounded-2xl shadow-sm">
              <h3 className="font-bold text-sm text-slate-800 mb-3">
                Historial de Mis Bitácoras Enviadas (Últimas 5)
              </h3>
              <div className="space-y-3 text-xs">
                {sessionHistory.map((s) => (
                  <div 
                    key={s.id} 
                    className={`p-3 border rounded-xl space-y-2 transition duration-300 ${
                      s.id === highlightSessionId 
                        ? "bg-blue-50 border-blue-400 shadow-sm animate-highlight" 
                        : "bg-white border-slate-200"
                    }`}
                  >
                    <div className="flex justify-between items-center border-b pb-1">
                      <div>
                        <span className="font-bold text-primary">{s.paCase.code}</span>
                        <span className="text-[10px] text-slate-500 ml-2">Sesión #{s.sessionNumber}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded font-bold text-[9px] ${
                        s.status === "VALIDADA" 
                          ? "bg-emerald-100 text-emerald-800" 
                          : s.status === "DEVUELTA" 
                            ? "bg-rose-100 text-rose-800" 
                            : "bg-amber-100 text-amber-800"
                      }`}>
                        {s.status}
                      </span>
                    </div>
                    <div className="text-slate-600 leading-relaxed text-[11px]">
                      <span className="font-bold text-slate-500">Resumen:</span> {s.summary}
                    </div>
                    {s.agreements && (
                      <div className="text-[10px] text-slate-400">
                        <span className="font-bold">Acuerdos:</span> {s.agreements}
                      </div>
                    )}
                  </div>
                ))}
                {sessionHistory.length === 0 && (
                  <p className="text-slate-400 text-center py-4">No has enviado bitácoras en este periodo.</p>
                )}
              </div>
            </div>

          </div>

          {/* Right Column: Tasks Submission & Avisos/Notifications */}
          <div className="space-y-6">
            
            {/* Tasks submit form checklist */}
            <TaskSubmitForm tasks={tasks} />

            {/* Avisos/Notifications Panel */}
            <div className="p-6 bg-card border border-border rounded-2xl shadow-sm">
              <h3 className="font-bold text-sm text-slate-800 mb-3">
                Notificaciones y Avisos de Coordinación
              </h3>
              <div className="space-y-3 text-xs">
                {notifications.map((notif) => (
                  <div key={notif.id} className="p-3 bg-secondary/30 rounded-xl border border-border/50 space-y-1">
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span className="font-bold text-slate-500">De: Coordinador</span>
                      <span>{new Date(notif.createdAt).toLocaleDateString("es-CL")}</span>
                    </div>
                    <p className="text-slate-700 italic">
                      &quot;{notif.text}&quot;
                    </p>
                  </div>
                ))}
                {notifications.length === 0 && (
                  <p className="text-slate-400 text-center py-4">No tienes notificaciones pendientes.</p>
                )}
              </div>
            </div>

            {/* Supervisiones Panel */}
            <div className="p-6 bg-card border border-border rounded-2xl shadow-sm">
              <h3 className="font-bold text-sm text-slate-800 mb-3">
                Mis Supervisiones Registradas ({supervisions.length})
              </h3>
              <div className="space-y-3 text-xs">
                {supervisions.map((sup) => (
                  <div 
                    key={sup.id} 
                    className={`p-3 border rounded-xl space-y-1 transition duration-300 ${
                      sup.id === highlightSupervisionId 
                        ? "bg-blue-50 border-blue-400 shadow-sm animate-highlight" 
                        : "bg-secondary/30 border-border/50"
                    }`}
                  >
                    <div className="flex justify-between text-[10px] text-slate-400 font-semibold">
                      <span>Modalidad: {sup.modality}</span>
                      <span>{new Date(sup.date).toLocaleDateString("es-CL")}</span>
                    </div>
                    <p className="text-slate-700">
                      Tema: {sup.observations || "Sin observaciones"}
                    </p>
                    <div className="text-[9px] text-slate-500 font-bold">
                      Duración: {sup.durationMinutes} minutos
                    </div>
                  </div>
                ))}
                {supervisions.length === 0 && (
                  <p className="text-slate-400 text-center py-4">No tienes supervisiones registradas aún.</p>
                )}
              </div>
            </div>

          </div>

        </div>

      </div>
    </AppShell>
  );
}
