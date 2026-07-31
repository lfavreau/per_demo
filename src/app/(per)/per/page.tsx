import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
import AppShell from "@/components/shell/AppShell";
import { mapCaseStatusToLabel, mapStageToLabel } from "@/lib/nomenclatures";

export default async function PERDashboardPage() {
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

  const isDemo = Boolean(user.isDemo);

  const activeCases = await prisma.pACase.findMany({
    where: {
      perId: profile.id,
      isDemo,
      status: { notIn: ["EGRESO", "RETIRO_VOLUNTARIO", "DESERCION"] },
    },
    include: { candidate: true },
  });

  if (activeCases.length === 1) {
    redirect(`/per/casos/${activeCases[0].id}/etapa`);
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
          {activeCases.length === 0 ? (
            <p className="text-slate-400 text-center py-4 text-xs">No tienes acompañamientos activos asignados.</p>
          ) : (
            <div className="space-y-2 text-xs">
              {activeCases.map((c) => (
                <Link
                  key={c.id}
                  href={`/per/casos/${c.id}/etapa`}
                  className="flex justify-between items-center p-3 border border-border rounded-xl bg-secondary/20 hover:bg-secondary/40 transition"
                >
                  <div>
                    <span className="font-extrabold text-blue-700">{c.code}</span>
                    <span className="text-[10px] text-slate-400 ml-2">({c.type})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold text-[10px]">
                      {mapStageToLabel(c.stage)}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold text-[10px]">
                      {mapCaseStatusToLabel(c.status)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
