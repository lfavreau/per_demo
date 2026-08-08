import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensureCurrentStageTasks, getItineraryState, getCurrentGoalsForCase } from "@/server/services/itinerary.service";
import { getStepByActivityKey, RECOVERY_DOMAINS } from "@/lib/instrument-itinerary";
import { mapStageToLabel, formatCaseLabel } from "@/lib/nomenclatures";

export const dynamic = "force-dynamic";
import AppShell from "@/components/shell/AppShell";
import StageItineraryBoard from "@/components/per/StageItineraryBoard";
import NativeInstrumentForm from "@/components/per/NativeInstrumentForm";
import RegistroAcompanamientoForm from "@/components/per/RegistroAcompanamientoForm";
import SessionHighlightModal from "@/components/per/SessionHighlightModal";

function daysAgo(date: Date | null): string {
  if (!date) return "sin registro";
  const diff = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return "hoy";
  if (diff === 1) return "hace 1 día";
  return `hace ${diff} días`;
}

export default async function PERCaseStagePage({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string }>;
  searchParams: Promise<{ highlightCaseId?: string; highlightSessionId?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PER") {
    redirect("/login");
  }
  const { caseId } = await params;
  const { highlightCaseId, highlightSessionId } = await searchParams;

  const profile = await prisma.pERProfile.findUnique({ where: { userId: user.id } });
  if (!profile) {
    return (
      <main className="p-8 text-center text-xs bg-slate-50 text-slate-800 min-h-screen">
        <p className="font-bold text-red-700">⚠️ Tu perfil PER no se encuentra configurado en la base de datos.</p>
      </main>
    );
  }

  const isDemo = Boolean(user.isDemo);
  const paCase = await prisma.pACase.findUnique({ where: { id: caseId } });
  if (!paCase || paCase.perId !== profile.id || paCase.isDemo !== isDemo) {
    redirect("/per");
  }

  await ensureCurrentStageTasks(paCase.id, user.id, isDemo);
  const state = await getItineraryState(paCase.id, isDemo);

  const metaLine = `Iniciada ${daysAgo(paCase.startDate)} · Última sesión ${daysAgo(paCase.lastSessionDate)}`;

  const recentSessions =
    state.stage === "CONEXION"
      ? await prisma.sessionLog.findMany({
          where: { paCaseId: paCase.id, isDemo },
          orderBy: { date: "desc" },
          take: 5,
        })
      : [];

  const currentGoals = state.stage === "CONEXION" ? await getCurrentGoalsForCase(paCase.id) : [];

  const highlightSessionVisible =
    !!highlightSessionId && recentSessions.some((s) => s.id === highlightSessionId);

  let offscreenHighlightSession: (typeof recentSessions)[number] & { feedbackText: string | null } | null = null;
  if (highlightSessionId && !highlightSessionVisible) {
    const session = await prisma.sessionLog.findUnique({ where: { id: highlightSessionId } });
    if (session && session.paCaseId === paCase.id) {
      let feedbackText: string | null = null;
      if (session.coordinatorFeedbackId) {
        const feedback = await prisma.feedback.findUnique({ where: { id: session.coordinatorFeedbackId } });
        feedbackText = feedback?.text ?? null;
      }
      offscreenHighlightSession = { ...session, feedbackText };
    }
  }

  const isCaseHighlighted = highlightCaseId === paCase.id;

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        {state.pendingWithdrawalStep && state.pendingWithdrawalStep.status !== "VALIDADA" && (
          <NativeInstrumentForm
            taskId={state.pendingWithdrawalStep.taskId}
            caseId={paCase.id}
            title={`⚠️ ${state.pendingWithdrawalStep.title}`}
            contentTarget="TASK_JSON"
            fields={getStepByActivityKey(state.pendingWithdrawalStep.activityKey)?.fields ?? []}
            existingContentJson={state.pendingWithdrawalStep.contentJson}
          />
        )}

        <div className={isCaseHighlighted ? "rounded-2xl animate-highlight" : undefined}>
          <StageItineraryBoard
            caseId={paCase.id}
            caseCode={formatCaseLabel(paCase.code, paCase.alias)}
            stageLabel={mapStageToLabel(state.stage)}
            metaLine={metaLine}
            steps={state.steps}
          />
        </div>

        {state.continuousStep && (
          <div className="space-y-4">
            <div className="p-4 bg-card border border-border rounded-2xl shadow-sm">
              <h4 className="text-xs font-bold text-slate-500">
                {state.continuousStep.title} ({state.continuousStep.sessionLogCount || 0} registrados)
              </h4>
            </div>
            <RegistroAcompanamientoForm
              caseId={paCase.id}
              caseCode={paCase.code}
              domains={[...RECOVERY_DOMAINS]}
              goals={currentGoals.map((g) => ({ id: g.id, objective: g.objective, recoveryDomainId: g.recoveryDomainId }))}
              nextSessionNumber={(state.continuousStep.sessionLogCount || 0) + 1}
            />
            {recentSessions.length > 0 && (
              <div className="p-6 bg-card border border-border rounded-2xl shadow-sm">
                <h3 className="font-bold text-sm text-slate-800 mb-3">Últimos Registros (5)</h3>
                <div className="space-y-3 text-xs">
                  {recentSessions.map((s) => (
                    <div
                      key={s.id}
                      className={`p-3 border rounded-xl space-y-2 bg-white border-slate-200 ${
                        s.id === highlightSessionId ? "ring-2 ring-blue-300 animate-highlight" : ""
                      }`}
                    >
                      <div className="flex justify-between items-center border-b pb-1">
                        <span className="text-[10px] text-slate-500">Sesión #{s.sessionNumber}</span>
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[9px] ${
                            s.status === "VALIDADA"
                              ? "bg-emerald-100 text-emerald-800"
                              : s.status === "DEVUELTA"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {s.status}
                        </span>
                      </div>
                      <div className="text-slate-600 leading-relaxed text-[11px]">{s.summary}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {offscreenHighlightSession && (
        <SessionHighlightModal
          sessionNumber={offscreenHighlightSession.sessionNumber}
          date={new Date(offscreenHighlightSession.date).toLocaleDateString("es-CL")}
          status={offscreenHighlightSession.status}
          summary={offscreenHighlightSession.summary}
          feedbackText={offscreenHighlightSession.feedbackText}
        />
      )}
    </AppShell>
  );
}
