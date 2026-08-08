import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AppShell from "@/components/shell/AppShell";
import { REGION_NAMES as REGIONS } from "@/lib/program-config";

export const dynamic = "force-dynamic";

export default async function AdminRedesPage({
  searchParams,
}: {
  searchParams: Promise<{ regionId?: string }>;
}) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const selectedRegion = params.regionId || null;

  if (!user || user.role !== "ADMIN") {
    redirect("/login");
  }

  const isDemo = Boolean(user.isDemo);

  const allDevices = await prisma.networkDevice.findMany({
    where: selectedRegion ? { regionId: selectedRegion } : {},
    include: {
      _count: { select: { activations: true } },
    },
    orderBy: [{ regionId: "asc" }, { name: "asc" }],
  });
  const networkDevices = allDevices.filter((d) => Boolean(d.isDemo) === isDemo);

  return (
    <AppShell user={user}>
      <div className="space-y-6">

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-6 bg-white border border-slate-200 rounded-2xl shadow-sm gap-4">
          <div>
            <h3 className="font-extrabold text-base text-slate-900">Catálogo Nacional de Redes Territoriales</h3>
            <p className="text-xs text-slate-500 mt-1">
              Vista consolidada de los dispositivos de salud, empleo, educación y vivienda registrados por cada coordinación regional. Referencia para reportes SENDA y dirección — el alta se gestiona desde cada Coordinación Regional.
            </p>
          </div>

          <form method="GET" className="flex items-center gap-2">
            <select
              name="regionId"
              defaultValue={selectedRegion || ""}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:ring-1 focus:ring-primary font-semibold"
            >
              <option value="">🌐 Todas las Regiones</option>
              {REGIONS.map((reg) => (
                <option key={reg} value={reg}>📍 {reg}</option>
              ))}
            </select>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl cursor-pointer"
            >
              Filtrar
            </button>
          </form>
        </div>

        {/* Devices table */}
        <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <h4 className="font-bold text-xs text-slate-500 uppercase tracking-wider mb-4">
            Dispositivos Territoriales ({networkDevices.length})
          </h4>
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="pb-2">Dispositivo</th>
                  <th className="pb-2">Tipo</th>
                  <th className="pb-2">Región</th>
                  <th className="pb-2">Contacto</th>
                  <th className="pb-2 text-center">Estado</th>
                  <th className="pb-2 text-center">Activaciones</th>
                </tr>
              </thead>
              <tbody>
                {networkDevices.map((device) => (
                  <tr key={device.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                    <td className="py-3 font-bold text-slate-800">{device.name}</td>
                    <td className="py-3 text-slate-600">{device.type}</td>
                    <td className="py-3">
                      <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[9px] font-bold">
                        📍 {device.regionId}
                      </span>
                    </td>
                    <td className="py-3 text-slate-500">{device.contactPerson || "No especificado"}</td>
                    <td className="py-3 text-center">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[9px]">
                        {device.status}
                      </span>
                    </td>
                    <td className="py-3 text-center font-bold text-slate-700">{device._count.activations}</td>
                  </tr>
                ))}
                {networkDevices.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">
                      No hay dispositivos registrados{selectedRegion ? ` en ${selectedRegion}` : ""}.
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
