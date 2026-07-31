import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
import AppShell from "@/components/shell/AppShell";
import { mapCaseStatusToLabel, formatCaseLabel } from "@/lib/nomenclatures";

export default async function PERCasosPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "PER") {
    redirect("/login");
  }

  const profile = await prisma.pERProfile.findUnique({ where: { userId: user.id } });
  if (!profile) {
    return (
      <main className="p-8 text-center text-xs bg-slate-50 text-slate-800 min-h-screen">
        <p className="font-bold text-red-700">⚠️ Tu perfil PER no se encuentra configurado en la base de datos.</p>
      </main>
    );
  }

  const isDemo = Boolean(user.isDemo);
  const activeCases = await prisma.pACase.findMany({
    where: {
      perId: profile.id,
      isDemo,
      status: { notIn: ["EGRESO", "RETIRO_VOLUNTARIO", "DESERCION"] },
    },
    include: { candidate: true },
  });

  return (
    <AppShell user={user}>
      <div className="p-6 bg-card border border-border rounded-2xl shadow-sm">
        <h3 className="font-bold text-sm text-slate-800 mb-3">Mis Acompañamientos Activos ({activeCases.length})</h3>
        <div className="space-y-3 text-xs">
          {activeCases.map((c) => (
            <Link
              key={c.id}
              href={`/per/casos/${c.id}/etapa`}
              className="p-3 border rounded-xl flex justify-between items-center bg-secondary/35 border-border/50 hover:bg-secondary/50 transition"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-blue-700">{formatCaseLabel(c.code, c.alias)}</span>
                  <span className="text-[10px] text-slate-400">({c.type})</span>
                </div>
                <span className="text-slate-800 font-bold text-xs block mt-0.5">
                  👤 {c.candidate?.sourceCenter || c.genderSelfId || "Caso Acompañado"}
                </span>
              </div>
              <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold text-[10px]">
                {mapCaseStatusToLabel(c.status)}
              </span>
            </Link>
          ))}
          {activeCases.length === 0 && (
            <p className="text-slate-400 text-center py-4">No tienes acompañamientos activos asignados.</p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
