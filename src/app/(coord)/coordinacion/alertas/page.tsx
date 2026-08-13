import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AppShell from "@/components/shell/AppShell";
import SessionValidationQueue from "@/components/sessions/SessionValidationQueue";
import TaskValidationQueue from "@/components/coordinator/TaskValidationQueue";

export const dynamic = "force-dynamic";

export default async function CoordinatorValidacionPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; highlightSessionId?: string }>;
}) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const errorMsg = params.error;
  const highlightSessionId = params.highlightSessionId;

  // Enforce Coordinator role access
  if (!user || user.role !== "COORDINATOR" || !user.regionId) {
    redirect("/login");
  }

  const isDemo = Boolean(user.isDemo);

  // Fetch pending session logs — lo que el PER envió como registro de acompañamiento
  const pendingSessions = await prisma.sessionLog.findMany({
    where: {
      regionId: user.regionId,
      status: "ENVIADA",
      isDemo,
    },
    include: {
      paCase: {
        select: {
          code: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Fetch pending tasks needing coordinator approval — lo que el PER envió como instrumento
  const pendingTasks = await prisma.task.findMany({
    where: {
      regionId: user.regionId,
      status: { in: ["ENVIADA", "EN_REVISION"] },
      isDemo,
    },
    include: {
      paCase: { select: { code: true } },
      assignedTo: { select: { name: true } },
      instrument: { select: { activityKey: true, submissionMode: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AppShell user={user}>
      <div className="space-y-6">

        {errorMsg && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-xs font-semibold rounded-2xl flex items-start gap-2 shadow-sm">
            <span className="text-sm shrink-0">⚠️</span>
            <p className="font-normal text-[11px] leading-relaxed text-red-755">{decodeURIComponent(errorMsg)}</p>
          </div>
        )}

        {/* Page Header */}
        <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <h3 className="font-extrabold text-base text-slate-900">Bandeja de Validación</h3>
          <p className="text-xs text-slate-500 mt-1">
            Todo lo que los PER de tu región enviaron y está esperando tu revisión: registros de acompañamiento e instrumentos/hitos del itinerario.
          </p>
        </div>

        {/* Sessions queue */}
        <SessionValidationQueue pendingSessions={pendingSessions} highlightSessionId={highlightSessionId} />

        {/* Pending Tasks Queue */}
        <TaskValidationQueue pendingTasks={pendingTasks} />

      </div>
    </AppShell>
  );
}
