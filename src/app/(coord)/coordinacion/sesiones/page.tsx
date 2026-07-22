import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AppShell from "@/components/shell/AppShell";
import { validateSessionAction, returnSessionAction } from "@/app/actions/coordinator";
import { mapEmotionToLabel } from "@/lib/nomenclatures";

import SessionValidationQueue from "@/components/sessions/SessionValidationQueue";

export const dynamic = "force-dynamic";

export default async function CoordinatorSesionesPage() {
  const user = await getCurrentUser();

  // Enforce Coordinator role access
  if (!user || user.role !== "COORDINATOR" || !user.regionId) {
    redirect("/login");
  }

  // Fetch pending session logs with case relation
  const pendingSessions = await prisma.sessionLog.findMany({
    where: {
      regionId: user.regionId,
      status: "ENVIADA",
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

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        
        {/* Page Header */}
        <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <h3 className="font-extrabold text-base text-slate-900">Validación de Bitácoras de Sesión</h3>
          <p className="text-xs text-slate-500 mt-1">
            Revisa los reportes de encuentros cargados por los PER y apruébalos para consolidar metas, o devuélvelos con observaciones de ajuste.
          </p>
        </div>

        {/* Sessions queue list container */}
        <SessionValidationQueue pendingSessions={pendingSessions} />

      </div>
    </AppShell>
  );
}
