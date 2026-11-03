import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
import AppShell from "@/components/shell/AppShell";
import CaseName from "@/components/cases/CaseName";
import { mapCaseStatusToLabel } from "@/lib/nomenclatures";

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

  // Lo habitual es 1 PER con 1 persona acompañada: en ese caso se entra directo al
  // itinerario. Si el PER lleva más de un caso, se muestra la lista para elegir.
  const activeCases = await prisma.pACase.findMany({
    where: {
      perId: profile.id,
      isDemo,
      status: { notIn: ["EGRESO", "RETIRO_VOLUNTARIO", "DESERCION"] },
    },
    select: { id: true, code: true, alias: true, status: true },
    orderBy: { createdAt: "asc" },
  });

  if (activeCases.length === 1) {
    redirect(`/per/casos/${activeCases[0].id}/etapa`);
  }

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        {profile.certificationStatus === "NO_HABILITADO" && (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-2xl space-y-2 text-xs">
            <h4 className="font-bold text-destructive">🛑 Estado: PER Deshabilitado</h4>
            <p className="text-slate-700 leading-relaxed">
              Motivo: {profile.certificationNote || "Deshabilitado por coordinación."}
            </p>
            <p className="text-[10px] text-slate-500">
              Las tareas críticas del programa se encuentran bloqueadas para tu usuario hasta que el coordinador valide tus antecedentes.
            </p>
          </div>
        )}

        <div className="p-6 bg-card border border-border rounded-2xl shadow-sm">
          <h3 className="font-bold text-sm text-slate-800 mb-3">Mi Agenda</h3>
          {activeCases.length === 0 ? (
            <p className="text-slate-400 text-center py-4 text-xs">No tienes un acompañamiento activo asignado.</p>
          ) : (
            <div className="space-y-2 text-xs">
              {activeCases.map((c) => (
                <Link
                  key={c.id}
                  href={`/per/casos/${c.id}/etapa`}
                  className="flex justify-between items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl hover:border-slate-300 hover:bg-slate-100 transition"
                >
                  <CaseName code={c.code} alias={c.alias} className="font-bold text-slate-800" />
                  <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold text-[10px] shrink-0">
                    {mapCaseStatusToLabel(c.status)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
