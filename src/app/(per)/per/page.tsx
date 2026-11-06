import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
import AppShell from "@/components/shell/AppShell";
import CaseName from "@/components/cases/CaseName";
import { formatStageHeading, mapCaseStatusToLabel } from "@/lib/nomenclatures";
import { getCasesAgendaPreviews, type CaseAgendaPreview } from "@/server/services/itinerary.service";

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
    select: { id: true, code: true, alias: true, status: true, stage: true },
    orderBy: { createdAt: "asc" },
  });

  if (activeCases.length === 1) {
    redirect(`/per/casos/${activeCases[0].id}/etapa`);
  }

  // Qué le toca hacer en cada caso: lo que hay que corregir va primero, luego lo que sigue.
  const URGENCY: Record<CaseAgendaPreview["kind"], number> = { RETIRO: 0, CORREGIR: 1, SIGUIENTE: 2, REVISION: 3, COMPLETA: 4 };
  const previews = await getCasesAgendaPreviews(activeCases.map((c) => ({ id: c.id, stage: c.stage })));
  const cases = activeCases
    .map((c) => ({ ...c, preview: previews.get(c.id) ?? null }))
    .sort((a, b) => (a.preview ? URGENCY[a.preview.kind] : 5) - (b.preview ? URGENCY[b.preview.kind] : 5));

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        <div className="p-6 bg-card border border-border rounded-2xl shadow-sm">
          <h3 className="font-bold text-sm text-slate-800 mb-3">Mis casos</h3>
          {cases.length === 0 ? (
            <p className="text-slate-400 text-center py-4 text-xs">No tienes un acompañamiento activo asignado.</p>
          ) : (
            <div className="space-y-2 text-xs">
              {cases.map((c) => (
                <Link
                  key={c.id}
                  href={`/per/casos/${c.id}/etapa`}
                  className="block p-3 bg-slate-50 border border-slate-200 rounded-xl hover:border-slate-300 hover:bg-slate-100 transition space-y-1.5"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <CaseName code={c.code} alias={c.alias} className="font-bold text-slate-800" />
                    {c.preview ? (
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold text-[10px]">
                        {formatStageHeading(c.preview.stage)}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold text-[10px]">
                        {mapCaseStatusToLabel(c.status)}
                      </span>
                    )}
                    {c.preview && c.preview.total > 0 && (
                      <span className="text-[10px] text-slate-400">
                        {c.preview.done} de {c.preview.total} actividades
                      </span>
                    )}
                  </div>
                  {c.preview && <AgendaLine preview={c.preview} />}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function AgendaLine({ preview }: { preview: CaseAgendaPreview }) {
  const from = preview.activityStage ? ` (${formatStageHeading(preview.activityStage)})` : "";
  const title = `${preview.title ?? ""}${from}`;
  switch (preview.kind) {
    case "RETIRO":
      return <p className="font-semibold text-amber-800">⚠️ Completar formulario de abandono</p>;
    case "CORREGIR":
      return <p className="font-semibold text-pink-700">✏️ Corregir: {title}</p>;
    case "SIGUIENTE":
      return <p className="font-semibold text-slate-700">➡️ Siguiente: {title}</p>;
    case "REVISION":
      return <p className="text-blue-700">📤 En revisión de coordinación: {title}</p>;
    default:
      return <p className="text-emerald-700">✔ Etapa completa, coordinación revisa el avance</p>;
  }
}
