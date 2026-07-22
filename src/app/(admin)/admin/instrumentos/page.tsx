import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AppShell from "@/components/shell/AppShell";

export const dynamic = "force-dynamic";

export default async function AdminInstrumentosPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== "ADMIN") {
    redirect("/login");
  }

  // Fetch official instruments catalog
  const instruments = await prisma.instrument.findMany({
    orderBy: { phaseId: "asc" },
  });

  const totalCount = instruments.length;
  const activeCount = instruments.filter((i) => i.status === "VIGENTE").length;
  const draftCount = instruments.filter((i) => i.status === "BORRADOR").length;

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-6 bg-white border border-slate-200 rounded-2xl shadow-sm gap-4">
          <div>
            <h3 className="font-extrabold text-base text-[#0f2d59]">Catálogo de Instrumentos del PER</h3>
            <p className="text-xs text-slate-500 mt-1">
              Catálogo oficial de documentos, fichas y encuestas vigentes para la trazabilidad y el pilotaje.
            </p>
          </div>
        </div>

        {/* Stats summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="p-4 bg-card border border-border rounded-xl shadow-sm text-center">
            <span className="block text-xl font-bold text-primary">{totalCount}</span>
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total Instrumentos</span>
          </div>
          <div className="p-4 bg-card border border-border rounded-xl shadow-sm text-center">
            <span className="block text-xl font-bold text-emerald-500">{activeCount}</span>
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Vigentes</span>
          </div>
          <div className="p-4 bg-card border border-border rounded-xl shadow-sm text-center">
            <span className="block text-xl font-bold text-amber-500">{draftCount}</span>
            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Borradores</span>
          </div>
        </div>

        {/* Catalog Table */}
        <div className="p-6 bg-card border border-border rounded-2xl shadow-sm">
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-semibold">
                  <th className="pb-3">Nombre</th>
                  <th className="pb-3">Tipo</th>
                  <th className="pb-3">Fase Oficial</th>
                  <th className="pb-3 text-center">Hito Obligatorio</th>
                  <th className="pb-3 text-center">Versión</th>
                  <th className="pb-3 text-center">Estado</th>
                </tr>
              </thead>
              <tbody>
                {instruments.map((inst) => (
                  <tr key={inst.id} className="border-b border-border/50 hover:bg-secondary/10 transition">
                    <td className="py-4">
                      <div>
                        <span className="font-semibold block text-slate-800">{inst.name}</span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">{inst.description}</span>
                      </div>
                    </td>
                    <td className="py-4 text-slate-500">{inst.type.replace(/_/g, " ")}</td>
                    <td className="py-4 text-slate-500 font-semibold">{inst.phaseId}</td>
                    <td className="py-4 text-center">
                      {inst.mandatory ? (
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-bold text-[9px]">Sí</span>
                      ) : (
                        <span className="text-slate-400">No</span>
                      )}
                    </td>
                    <td className="py-4 text-center text-slate-500 font-bold">{inst.version}</td>
                    <td className="py-4 text-center">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                          inst.status === "VIGENTE"
                            ? "bg-emerald-500/10 text-emerald-500"
                            : inst.status === "BORRADOR"
                            ? "bg-amber-500/10 text-amber-500"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {inst.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </AppShell>
  );
}
