import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AppShell from "@/components/shell/AppShell";
import { createCandidateAction } from "@/app/actions/coordinator";
import AssignPerForm from "@/components/coordinator/AssignPerForm";
import PersonaEditModal from "@/components/coordinator/PersonaEditModal";
import CandidateStatusSelect from "@/components/coordinator/CandidateStatusSelect";
import CaseName from "@/components/cases/CaseName";
import { REQUIRE_TEXT_FIELDS } from "@/lib/program-config";
import { CASE_ALIAS_MAX_LENGTH } from "@/lib/nomenclatures";

export const dynamic = "force-dynamic";

export default async function CoordinatorCandidatasPage({
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

  // 1. Personas registradas en la región (todas, con o sin PER)
  const candidates = await prisma.pACandidate.findMany({
    where: { regionId: user.regionId, isDemo },
    orderBy: { createdAt: "desc" },
  });

  // 2. PER activos de la región para asignar
  const allPerProfiles = await prisma.pERProfile.findMany({
    where: {
      regionId: user.regionId,
    },
    include: {
      user: true,
      cases: {
        where: {
          status: { notIn: ["EGRESO", "RETIRO_VOLUNTARIO", "DESERCION"] },
        },
      },
    },
  });
  const perProfiles = allPerProfiles.filter(
    (p: any) =>
      Boolean(p.user?.isDemo) === isDemo &&
      p.user?.active !== false
  );

  // 3. Casos (asignaciones) de la región
  const allCases = await prisma.pACase.findMany({
    where: { regionId: user.regionId },
    include: {
      per: {
        include: { user: true },
      },
      // Actividad real del caso (para advertir antes de borrar): tareas ya trabajadas + bitácoras.
      _count: {
        select: {
          sessionLogs: true,
          tasks: { where: { status: { notIn: ["PENDIENTE", "CANCELADA"] } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const matches = allCases.filter((c) => Boolean(c.isDemo) === isDemo);

  // Una persona por fila: su caso (si ya tiene PER) se busca por la vinculación de la candidata.
  const caseByCandidate = new Map(matches.map((m) => [m.candidateId, m]));
  const rows = candidates.map((cand) => ({
    cand,
    match:
      (cand.convertedToCaseId && matches.find((m) => m.id === cand.convertedToCaseId)) ||
      caseByCandidate.get(cand.id) ||
      null,
  }));

  // Solo las personas "Seleccionadas" y sin PER se pueden asignar; la lista de espera no.
  const assignable = candidates.filter((c) => c.status === "SELECCIONADA" && !c.convertedToCaseId);

  return (
    <AppShell user={user}>
      <div className="space-y-6">

        {/* Page Header */}
        <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="font-extrabold text-base text-slate-900">Registro de Ingresos</h3>
            <p className="text-xs text-slate-500 mt-1">
              Registra a las personas derivadas, déjalas seleccionadas o en lista de espera, y asígnales un PER.
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-800 text-xs font-semibold rounded-2xl flex items-start gap-2 shadow-sm">
            <span className="text-sm shrink-0">⚠️</span>
            <div className="flex-1 space-y-1">
              <p className="font-bold text-red-900">No se pudo completar la operación</p>
              <p className="font-normal text-[11px] leading-relaxed text-red-700">{decodeURIComponent(errorMsg)}</p>
            </div>
          </div>
        )}

        {/* Registrar nueva persona derivada */}
        <div className="p-6 bg-white border border-blue-100 rounded-2xl shadow-sm space-y-4">
          <h4 className="font-bold text-xs text-blue-900 uppercase tracking-wider flex items-center gap-2">
            <span>➕</span> Registrar nueva persona derivada
          </h4>
          <form action={createCandidateAction} className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-slate-500 mb-1 font-bold text-[10px] uppercase">Nombre / alias de la persona acompañada</label>
              <input
                type="text"
                name="sourceCenter"
                required={REQUIRE_TEXT_FIELDS}
                maxLength={CASE_ALIAS_MAX_LENGTH}
                placeholder="Nombre o alias (sin RUT)"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1 font-bold text-[10px] uppercase">Estado de Ingreso</label>
              <select
                name="status"
                defaultValue="SELECCIONADA"
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500"
              >
                <option value="SELECCIONADA">Seleccionada (se le puede asignar PER)</option>
                <option value="EN_ESPERA">Lista de espera</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-500 mb-1 font-bold text-[10px] uppercase">Notas / Antecedentes Iniciales</label>
              <input
                type="text"
                name="notes"
                placeholder="Observaciones de ingreso..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500"
              />
            </div>
            <div className="sm:col-span-3 flex justify-end">
              <button
                type="submit"
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow transition text-xs cursor-pointer"
              >
                ➕ Registrar persona
              </button>
            </div>
          </form>
        </div>

        {/* Asignar PER a una persona acompañada */}
        <div className="p-6 bg-card border border-border rounded-2xl shadow-sm space-y-4">
          <div>
            <h3 className="font-bold text-sm text-slate-800">Asignar PER</h3>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Solo aparecen las personas en estado <strong>Seleccionada</strong>; las de lista de espera no.
            </p>
          </div>

          <AssignPerForm
            persons={assignable.map((c) => ({ id: c.id, label: c.sourceCenter || "Sin nombre" }))}
            pers={perProfiles.map((p) => ({
              id: p.id,
              label: `${p.user?.name || "PER"} (${p.cases.length} casos activos)`,
            }))}
          />
        </div>

        {/* Personas acompañadas: todas, con o sin PER */}
        <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
          <h4 className="font-extrabold text-sm text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <span>🤝</span> Personas acompañadas ({rows.length})
          </h4>
          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border text-muted-foreground font-semibold">
                  <th className="pb-2">Persona acompañada</th>
                  <th className="pb-2">Acompañante PER</th>
                  <th className="pb-2">Estado de ingreso</th>
                  <th className="pb-2">Fecha</th>
                  <th className="pb-2">Acción</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ cand, match: m }) => (
                  <tr key={cand.id} className="border-b border-border/50 hover:bg-secondary/10">
                    <td className="py-3 font-semibold text-slate-800">
                      {m ? (
                        <CaseName code={m.code} alias={m.alias || cand.sourceCenter} className="font-bold text-blue-700" />
                      ) : (
                        cand.sourceCenter || "Sin nombre"
                      )}
                    </td>
                    <td className="py-3 text-slate-700 font-medium">
                      {m ? (
                        m.per?.user?.name || "PER asignado"
                      ) : (
                        <span className="text-slate-400">Sin PER</span>
                      )}
                    </td>
                    <td className="py-3">
                      {m ? (
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-semibold text-[10px]">
                          Con PER asignado
                        </span>
                      ) : (
                        <CandidateStatusSelect candidateId={cand.id} status={cand.status} />
                      )}
                    </td>
                    <td className="py-3 text-slate-500">
                      {new Date(m ? m.createdAt : cand.updatedAt).toLocaleDateString("es-CL")}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <PersonaEditModal
                          candidateId={cand.id}
                          name={cand.sourceCenter || ""}
                          notes={cand.notes || ""}
                          status={cand.status}
                          hasCase={Boolean(m)}
                          caseCode={m?.code ?? null}
                          activity={m ? m._count.sessionLogs + m._count.tasks : 0}
                        />
                        {m && (
                          <a
                            href={`/coordinacion/casos?caseCode=${m.code}`}
                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold border border-blue-200 rounded-lg text-[10px] inline-block shadow-sm transition"
                          >
                            👁️ Ver e Iniciar
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-400">
                      No hay personas registradas aún en esta región.
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
