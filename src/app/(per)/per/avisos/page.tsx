import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
import AppShell from "@/components/shell/AppShell";

export default async function PERAvisosPage({
  searchParams,
}: {
  searchParams: Promise<{ highlightSupervisionId?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PER") {
    redirect("/login");
  }
  const params = await searchParams;

  const profile = await prisma.pERProfile.findUnique({ where: { userId: user.id } });
  if (!profile) {
    return (
      <main className="p-8 text-center text-xs bg-slate-50 text-slate-800 min-h-screen">
        <p className="font-bold text-red-700">⚠️ Tu perfil PER no se encuentra configurado en la base de datos.</p>
      </main>
    );
  }

  const isDemo = Boolean(user.isDemo);

  const notifications = await prisma.feedback.findMany({
    where: { perId: user.id, status: "ENVIADA" },
    orderBy: { createdAt: "desc" },
  });

  const supervisions = await prisma.supervision.findMany({
    where: { perId: profile.id, isDemo },
    orderBy: { date: "desc" },
  });

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        <div className="p-6 bg-card border border-border rounded-2xl shadow-sm">
          <h3 className="font-bold text-sm text-slate-800 mb-3">Notificaciones y Avisos de Coordinación</h3>
          <div className="space-y-3 text-xs">
            {notifications.map((notif) => (
              <div key={notif.id} className="p-3 bg-secondary/30 rounded-xl border border-border/50 space-y-1">
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span className="font-bold text-slate-500">De: Coordinador</span>
                  <span>{new Date(notif.createdAt).toLocaleDateString("es-CL")}</span>
                </div>
                <p className="text-slate-700 italic">&quot;{notif.text}&quot;</p>
              </div>
            ))}
            {notifications.length === 0 && (
              <p className="text-slate-400 text-center py-4">No tienes notificaciones pendientes.</p>
            )}
          </div>
        </div>

        <div className="p-6 bg-card border border-border rounded-2xl shadow-sm">
          <h3 className="font-bold text-sm text-slate-800 mb-3">Mis Supervisiones Registradas ({supervisions.length})</h3>
          <div className="space-y-3 text-xs">
            {supervisions.map((sup) => (
              <div
                key={sup.id}
                className={`p-3 border rounded-xl space-y-1 transition duration-300 ${
                  sup.id === params.highlightSupervisionId
                    ? "bg-blue-50 border-blue-400 shadow-sm animate-highlight"
                    : "bg-secondary/30 border-border/50"
                }`}
              >
                <div className="flex justify-between text-[10px] text-slate-400 font-semibold">
                  <span>Modalidad: {sup.modality}</span>
                  <span>{new Date(sup.date).toLocaleDateString("es-CL")}</span>
                </div>
                <p className="text-slate-700">Tema: {sup.observations || "Sin observaciones"}</p>
                <div className="text-[9px] text-slate-500 font-bold">Duración: {sup.durationMinutes} minutos</div>
              </div>
            ))}
            {supervisions.length === 0 && (
              <p className="text-slate-400 text-center py-4">No tienes supervisiones registradas aún.</p>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
