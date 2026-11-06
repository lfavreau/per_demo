import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AppShell from "@/components/shell/AppShell";
import ActivityHistoryViewer from "@/components/shared/ActivityHistoryViewer";
import { getCaseActivityHistory } from "@/server/services/itinerary.service";
import { formatCaseLabel, mapStageToLabel } from "@/lib/nomenclatures";

export const dynamic = "force-dynamic";

/**
 * Casos de todas las regiones para el administrador: ver las actividades enviadas por los PER y devolverlas
 * con un texto de corrección (el mismo historial que usa coordinación en su región).
 */
export default async function AdminCasosPage({ searchParams }: { searchParams: Promise<{ caseCode?: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") redirect("/login");

  const isDemo = Boolean(user.isDemo);
  const { caseCode } = await searchParams;

  const cases = await prisma.pACase.findMany({
    where: { isDemo },
    orderBy: [{ regionId: "asc" }, { code: "asc" }],
    include: { per: { include: { user: { select: { name: true } } } } },
  });
  const selected = cases.find((c) => c.code === caseCode) ?? null;
  const history = selected ? await getCaseActivityHistory(selected.id, isDemo) : [];

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <h3 className="font-extrabold text-base text-[#0f2d59]">Acompañamientos de todas las regiones</h3>
          <p className="text-xs text-slate-500 mt-1">
            Elige un caso para ver lo que enviaron los PER y devolverles una actividad con el texto de lo que hay que corregir.
          </p>
        </div>

        <div className="p-6 bg-card border border-border rounded-2xl shadow-sm overflow-x-auto text-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border text-muted-foreground font-semibold">
                <th className="pb-3">Caso</th>
                <th className="pb-3">Región</th>
                <th className="pb-3">PER</th>
                <th className="pb-3">Etapa</th>
                <th className="pb-3">Estado</th>
                <th className="pb-3" />
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => (
                <tr key={c.id} className={`border-b border-border/50 ${c.id === selected?.id ? "bg-blue-50/60" : "hover:bg-secondary/10"}`}>
                  <td className="py-2.5 font-bold text-blue-700">{formatCaseLabel(c.code, c.alias)}</td>
                  <td className="py-2.5 text-slate-600">{c.regionId}</td>
                  <td className="py-2.5 text-slate-600">{c.per.user.name}</td>
                  <td className="py-2.5 text-slate-600">{mapStageToLabel(c.stage)}</td>
                  <td className="py-2.5 text-slate-600">{c.status}</td>
                  <td className="py-2.5 text-right">
                    <a
                      href={`/admin/casos?caseCode=${c.code}`}
                      className="px-2.5 py-1 rounded-lg font-bold text-[10px] bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200"
                    >
                      Ver actividades
                    </a>
                  </td>
                </tr>
              ))}
              {cases.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    No hay acompañamientos registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {selected && <ActivityHistoryViewer mode="COORD" caseId={selected.id} items={history} />}
      </div>
    </AppShell>
  );
}
