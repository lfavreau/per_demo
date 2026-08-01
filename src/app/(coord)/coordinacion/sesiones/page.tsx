import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AppShell from "@/components/shell/AppShell";
import { validateSessionAction, returnSessionAction } from "@/app/actions/coordinator";
import { mapEmotionToLabel } from "@/lib/nomenclatures";

import SessionValidationQueue from "@/components/sessions/SessionValidationQueue";

export const dynamic = "force-dynamic";

export default async function CoordinatorSesionesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const errorMsg = params.error;

  // Enforce Coordinator role access
  if (!user || user.role !== "COORDINATOR" || !user.regionId) {
    redirect("/login");
  }

  const isDemo = Boolean(user.isDemo);

  // Fetch pending session logs with case relation
  const pendingSessions = await prisma.sessionLog.findMany({
    where: {
      regionId: user.regionId,
      status: "ENVIADA",
      isDemo,
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

        {errorMsg && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-xs font-semibold rounded-2xl flex items-start gap-2 shadow-sm">
            <span className="text-sm shrink-0">⚠️</span>
            <p className="font-normal text-[11px] leading-relaxed text-red-755">{decodeURIComponent(errorMsg)}</p>
          </div>
        )}

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
