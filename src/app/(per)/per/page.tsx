import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
import AppShell from "@/components/shell/AppShell";

export default async function PERDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ highlightCaseId?: string; highlightSessionId?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PER") {
    redirect("/login");
  }

  const profile = await prisma.pERProfile.findUnique({ where: { userId: user.id } });
  if (!profile) {
    return (
      <main className="p-8 text-center text-xs space-y-4 bg-slate-50 text-slate-800 min-h-screen">
        <p className="font-bold text-red-700">⚠️ Tu perfil PER no se encuentra configurado en la base de datos.</p>
        <p className="text-slate-500">Por favor contacta a administración o al coordinador regional.</p>
      </main>
    );
  }

  const { highlightCaseId, highlightSessionId } = await searchParams;
  const isDemo = Boolean(user.isDemo);

  // Session notifications only carry the sessionId; resolve it to its case so
  // we can route straight into the case detail (the "instrumento" view) where
  // that session is actually rendered.
  let resolvedCaseId = highlightCaseId;
  if (!resolvedCaseId && highlightSessionId) {
    const session = await prisma.sessionLog.findUnique({
      where: { id: highlightSessionId },
      select: { paCaseId: true },
    });
    resolvedCaseId = session?.paCaseId;
  }

  if (resolvedCaseId) {
    const highlightQuery = new URLSearchParams();
    if (highlightCaseId) highlightQuery.set("highlightCaseId", highlightCaseId);
    if (highlightSessionId) highlightQuery.set("highlightSessionId", highlightSessionId);
    redirect(`/per/casos/${resolvedCaseId}/etapa?${highlightQuery.toString()}`);
  }

  // Un PER lleva como máximo un acompañamiento activo a la vez, así que esta
  // vista solo necesita decidir entre redirigir al instrumento o mostrar el
  // estado vacío — nunca hay una lista que recorrer.
  const activeCase = await prisma.pACase.findFirst({
    where: {
      perId: profile.id,
      isDemo,
      status: { notIn: ["EGRESO", "RETIRO_VOLUNTARIO", "DESERCION"] },
    },
  });

  if (activeCase) {
    redirect(`/per/casos/${activeCase.id}/etapa`);
  }

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        {profile.certificationStatus !== "HABILITADO" && (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-2xl space-y-2 text-xs">
            <h4 className="font-bold text-destructive">🛑 Estado: No Habilitado para Terreno</h4>
            <p className="text-slate-700 leading-relaxed">
              Motivo: {profile.certificationNote || "Falta completar inducción o código de ética."}
            </p>
            <p className="text-[10px] text-slate-500">
              Las tareas críticas del programa se encuentran bloqueadas para tu usuario hasta que el coordinador valide tus antecedentes.
            </p>
          </div>
        )}

        <div className="p-6 bg-card border border-border rounded-2xl shadow-sm">
          <h3 className="font-bold text-sm text-slate-800 mb-3">Mi Agenda</h3>
          <p className="text-slate-400 text-center py-4 text-xs">No tienes un acompañamiento activo asignado.</p>
        </div>
      </div>
    </AppShell>
  );
}
