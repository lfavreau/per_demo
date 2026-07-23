import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AppShell from "@/components/shell/AppShell";

export const dynamic = "force-dynamic";

import ExportCsvButton from "@/components/ExportCsvButton";

export default async function AdminAuditoriaPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== "ADMIN") {
    redirect("/login");
  }

  const isDemo = Boolean(user.isDemo);

  // Fetch audit logs
  const logs = await prisma.auditLog.findMany({
    where: { isDemo },
    orderBy: { timestamp: "desc" },
    take: 100, // Fetch up to 100 logs for better CSV exports
  });

  return (
    <AppShell user={user}>
      <div className="space-y-6">
        
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-6 bg-white border border-slate-200 rounded-2xl shadow-sm gap-4">
          <div>
            <h3 className="font-extrabold text-base text-[#0f2d59]">Bitácora de Auditoría (Inmutable)</h3>
            <p className="text-xs text-slate-500 mt-1">
              Registro inmutable de todas las acciones operativas realizadas en la plataforma por usuarios y automatizaciones del sistema.
            </p>
          </div>
          <div className="shrink-0">
            <ExportCsvButton logs={logs} />
          </div>
        </div>

        {/* Logs Table */}
        <div className="p-6 bg-card border border-border rounded-2xl shadow-sm">
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-semibold">
                  <th className="pb-3">Fecha</th>
                  <th className="pb-3">Usuario ID</th>
                  <th className="pb-3">Rol</th>
                  <th className="pb-3">Acción</th>
                  <th className="pb-3">Entidad</th>
                  <th className="pb-3">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-border/50 hover:bg-secondary/10 transition">
                    <td className="py-3 text-slate-500 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString("es-CL")}
                    </td>
                    <td className="py-3 font-semibold text-blue-700 truncate max-w-[120px]" title={log.userId}>
                      {log.userId}
                    </td>
                    <td className="py-3">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold text-[8px]">
                        {log.role}
                      </span>
                    </td>
                    <td className="py-3 font-semibold text-slate-800">{log.action}</td>
                    <td className="py-3 text-slate-500">{log.entityType} ({log.entityId})</td>
                    <td className="py-3 text-slate-600 truncate max-w-xs" title={log.newValue || log.previousValue || ""}>
                      {log.newValue || log.previousValue || "Sin detalles adicionales"}
                    </td>
                  </tr>
                ))}
                {logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">
                      No hay registros de auditoría almacenados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </AppShell>
  );
}
