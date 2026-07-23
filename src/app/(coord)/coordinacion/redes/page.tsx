import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AppShell from "@/components/shell/AppShell";
import { 
  registerNetworkDeviceAction, 
  logNetworkActivationAction, 
  registerPhase5RecordAction 
} from "@/app/actions/coordinator";

export const dynamic = "force-dynamic";

export default async function CoordinatorRedesPage() {
  const user = await getCurrentUser();

  // Enforce Coordinator role access
  if (!user || user.role !== "COORDINATOR" || !user.regionId) {
    redirect("/login");
  }
  const isDemo = Boolean(user.isDemo);

  let networkDevices: any[] = [];
  let regionalCases: any[] = [];
  let activations: any[] = [];
  let phase5Records: any[] = [];

  try {
    const allDevices = await prisma.networkDevice.findMany({
      where: { regionId: user.regionId },
      orderBy: { name: "asc" },
    });
    networkDevices = allDevices.filter((d) => Boolean(d.isDemo) === isDemo);
  } catch (e) {
    console.error("Error fetching networkDevices:", e);
  }

  try {
    const allCases = await prisma.pACase.findMany({
      where: {
        regionId: user.regionId,
        status: { notIn: ["EGRESO", "RETIRO_VOLUNTARIO", "DESERCION"] },
      },
      orderBy: { code: "asc" },
    });
    regionalCases = allCases.filter((c) => Boolean(c.isDemo) === isDemo);
  } catch (e) {
    console.error("Error fetching regionalCases:", e);
  }

  try {
    const allActivations = await prisma.networkActivation.findMany({
      include: {
        paCase: true,
        networkDevice: true,
      },
      orderBy: { date: "desc" },
    });
    activations = allActivations.filter(
      (a) => a.networkDevice && a.networkDevice.regionId === user.regionId && Boolean(a.isDemo) === isDemo
    );
  } catch (e) {
    console.error("Error fetching activations:", e);
  }

  try {
    const allPhase5Records = await prisma.phase5Record.findMany({
      where: { regionId: user.regionId },
      orderBy: { date: "desc" },
    });
    phase5Records = allPhase5Records.filter((p) => Boolean(p.isDemo) === isDemo);
  } catch (e) {
    console.error("Error fetching phase5Records:", e);
  }



  return (
    <AppShell user={user}>
      <div className="space-y-6">
        
        {/* Page Header */}
        <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <h3 className="font-extrabold text-base text-slate-900">Catálogo de Actores y Activación de Redes</h3>
          <p className="text-xs text-slate-500 mt-1">
            Registra los dispositivos locales de salud, empleo, educación y vivienda (Fase 5), documenta derivaciones efectivas y registra actividades grupales o focus groups.
          </p>
        </div>

        {/* Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Columns (Takes 2 cols) */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Actores Registrados */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
              <h4 className="font-bold text-xs text-slate-500 uppercase tracking-wider">
                Dispositivos Territoriales Registrados ({networkDevices.length})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {networkDevices.map((device) => (
                  <div key={device.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <h5 className="font-bold text-slate-800 text-sm">{device.name}</h5>
                        <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[9px] font-bold mt-1 inline-block">
                          {device.type}
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-[9px]">
                        {device.status}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 space-y-1 pt-1.5 border-t border-slate-200/60">
                      <div><span className="font-medium text-slate-700">Contacto:</span> {device.contactPerson || "No especificado"}</div>
                    </div>
                  </div>
                ))}

                {networkDevices.length === 0 && (
                  <p className="col-span-full text-xs text-slate-400 py-4 text-center">
                    No hay dispositivos territoriales registrados en la región. Registra uno usando el formulario de la derecha.
                  </p>
                )}
              </div>
            </div>

            {/* Activaciones de Red (Fase 5) */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
              <h4 className="font-bold text-xs text-slate-500 uppercase tracking-wider">
                Derivaciones y Activaciones de Red Recientes
              </h4>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 text-xs">
                {activations.map((act) => (
                  <div key={act.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-start gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-800 text-sm">{act.networkDevice.name}</span>
                        {act.paCase && (
                          <span className="px-1.5 py-0.5 rounded bg-blue-600/10 text-blue-700 text-[9px] font-bold">
                            {act.paCase.code}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-655 font-medium leading-relaxed">
                        Descripción: {act.description || "Sin descripción"}
                      </p>
                      {act.driveDocId && (
                        <p className="text-[9px] text-slate-400">
                          ID Documento: {act.driveDocId}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-450 font-semibold shrink-0">
                      {new Date(act.date).toLocaleDateString("es-CL")}
                    </span>
                  </div>
                ))}

                {activations.length === 0 && (
                  <p className="text-xs text-slate-400 py-4 text-center">
                    No se han registrado activaciones de red aún.
                  </p>
                )}
              </div>
            </div>

            {/* Actividades Phase 5 (Focus Groups & Reuniones de Equipo) */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
              <h4 className="font-bold text-xs text-slate-500 uppercase tracking-wider">
                Actividades de Reflexión Operativa y Reuniones de Equipo (Phase 5)
              </h4>
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 text-xs">
                {phase5Records.map((rec) => (
                  <div key={rec.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex justify-between items-center text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800">
                          {rec.type === "FOCUS_GROUP" ? "👥 Focus Group Temático" : "💼 Reunión de Equipo PER"}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[9px] font-bold">
                          {rec.participantsCount} participantes
                        </span>
                      </div>
                      {rec.notes && <p className="text-[10px] text-slate-500">Notas: {rec.notes}</p>}
                      <a 
                        href={rec.driveUrl} 
                        target="_blank" 
                        rel="noreferrer" 
                        className="text-[10px] text-blue-600 font-semibold hover:underline block"
                      >
                        📂 Ver acta de reunión en Drive
                      </a>
                    </div>
                    <span className="text-[10px] text-slate-400 font-semibold">
                      {new Date(rec.date).toLocaleDateString("es-CL")}
                    </span>
                  </div>
                ))}

                {phase5Records.length === 0 && (
                  <p className="text-xs text-slate-400 py-4 text-center">
                    No se han registrado focus groups ni actas de reunión Phase 5 aún.
                  </p>
                )}
              </div>
            </div>

          </div>

          {/* Right Column Forms */}
          <div className="space-y-6">
            
            {/* Form A: Register Actor */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
              <div className="border-b pb-2">
                <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🏢</span> Registrar Actor Territorial
                </h4>
                <p className="text-[10px] text-slate-400 mt-1">
                  Agrega un nuevo dispositivo al catálogo regional para derivar casos.
                </p>
              </div>

              <form action={registerNetworkDeviceAction} className="space-y-3.5 text-xs">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Nombre del Dispositivo / Actor:</label>
                  <input 
                    type="text" 
                    name="name" 
                    required 
                    placeholder="Ej. COSAM Valparaíso"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-600" 
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Tipo de Dispositivo:</label>
                  <select 
                    name="type" 
                    required 
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-600 font-semibold"
                  >
                    <option value="Salud">Salud (COSAM/APS)</option>
                    <option value="Empleo">Empleo (OMIL/SENCE)</option>
                    <option value="Vivienda">Vivienda (Municipal/DIDECO)</option>
                    <option value="Educación">Educación (CEIA/Adultos)</option>
                    <option value="Otro">Otro Dispositivo</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Persona de Contacto:</label>
                  <input 
                    type="text" 
                    name="contactPerson" 
                    placeholder="Ej. Trabajador Social encargado"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-600" 
                  />
                </div>

                <button 
                  type="submit" 
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition shadow cursor-pointer text-center block"
                >
                  ➕ Registrar Actor
                </button>
              </form>
            </div>

            {/* Form B: Log Activation */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
              <div className="border-b pb-2">
                <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <span>🔗</span> Registrar Activación de Red
                </h4>
                <p className="text-[10px] text-slate-400 mt-1">
                  Vincular un caso a un actor territorial de la red para gestionar su integración.
                </p>
              </div>

              <form action={logNetworkActivationAction} className="space-y-3.5 text-xs">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Caso (Código PA - Opcional):</label>
                  <select 
                    name="caseId" 
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-600 font-semibold"
                  >
                    <option value="">Ninguno / Gestión General</option>
                    {regionalCases.map(c => (
                      <option key={c.id} value={c.id}>{c.code}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Dispositivo a Activar:</label>
                  <select 
                    name="networkDeviceId" 
                    required 
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-600 font-semibold"
                  >
                    <option value="">Selecciona dispositivo...</option>
                    {networkDevices.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.type})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Fecha de Activación:</label>
                  <input 
                    type="date" 
                    name="date" 
                    required 
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-600" 
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Descripción / Hito:</label>
                  <input 
                    type="text" 
                    name="description" 
                    required
                    placeholder="Ej. Envío de ficha derivación médica"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-600" 
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Ficha de Derivación (ID Drive - Opcional):</label>
                  <input 
                    type="text" 
                    name="driveDocId" 
                    placeholder="Ej. gfile_deriv_12345"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-600" 
                  />
                </div>

                <button 
                  type="submit" 
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition shadow cursor-pointer text-center block"
                >
                  🔗 Registrar Activación
                </button>
              </form>
            </div>

            {/* Form C: Register Phase 5 Record */}
            <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-4">
              <div className="border-b pb-2">
                <h4 className="font-extrabold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <span>👥</span> Registrar Reunión / Focus Group (Fase 5)
                </h4>
                <p className="text-[10px] text-slate-400 mt-1">
                  Registra talleres, focus groups de reflexión metodológica o reuniones del equipo de duplas.
                </p>
              </div>

              <form action={registerPhase5RecordAction} className="space-y-3.5 text-xs">
                
                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Tipo de Reunión:</label>
                  <select 
                    name="type" 
                    required 
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-600 font-semibold"
                  >
                    <option value="FOCUS_GROUP">Focus Group Temático</option>
                    <option value="REUNION_EQUIPO">Reunión de Equipo PER / Duplas</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Fecha de Actividad:</label>
                  <input 
                    type="date" 
                    name="date" 
                    required 
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-600" 
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Cantidad de Participantes:</label>
                  <input 
                    type="number" 
                    name="participantsCount" 
                    required 
                    min={1}
                    placeholder="Ej. 6"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-600" 
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Link al Acta / Grabación (Drive):</label>
                  <input 
                    type="url" 
                    name="driveUrl" 
                    required 
                    placeholder="https://drive.google.com/..."
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-blue-600" 
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700">Notas / Acuerdos (Opcional):</label>
                  <textarea 
                    name="notes" 
                    rows={2} 
                    placeholder="Compromisos o temas de reflexión técnica acordados..."
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none resize-none"
                  ></textarea>
                </div>

                <button 
                  type="submit" 
                  className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition shadow cursor-pointer text-center block"
                >
                  👥 Registrar Reunión
                </button>
              </form>
            </div>

          </div>

        </div>

      </div>
    </AppShell>
  );
}
