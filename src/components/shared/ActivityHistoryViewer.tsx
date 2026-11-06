"use client";

import { useMemo, useState } from "react";
import ActivityModal, { STATUS_LABEL } from "@/components/shared/ActivityModal";
import { formatStageHeading } from "@/lib/nomenclatures";
import type { ActivityHistoryItem } from "@/server/services/itinerary.service";

interface ActivityHistoryViewerProps {
  mode: "PER" | "COORD";
  caseId: string;
  items: ActivityHistoryItem[];
  /** Prioridad de cada ámbito (Actividad 3), para colorear el selector de ámbitos al editar la Actividad 4. */
  domainPriorities?: Record<string, string>;
}

/**
 * Visor de historial de las actividades del caso: se elige la etapa y la actividad, y se abre en un modal con
 * su contenido y su historial de estados. Desde el modal se puede editar según el rol (ver ActivityModal).
 * Es el mismo componente para el PER, coordinación y administración.
 */
export default function ActivityHistoryViewer({ mode, caseId, items, domainPriorities = {} }: ActivityHistoryViewerProps) {
  const stages = useMemo(() => [...new Set(items.map((i) => i.stage))], [items]);
  const [stage, setStage] = useState<string>(stages[0] ?? "");
  const stageItems = items.filter((i) => i.stage === stage);
  const [taskId, setTaskId] = useState<string>("");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const selectedId = stageItems.some((i) => i.taskId === taskId) ? taskId : (stageItems[0]?.taskId ?? "");
  const open = items.find((i) => i.taskId === openTaskId) ?? null;

  if (items.length === 0) {
    return (
      <div className="p-4 bg-card border border-border rounded-2xl shadow-sm text-xs text-slate-400">
        Aún no hay actividades en el historial de este caso.
      </div>
    );
  }

  return (
    <div className="p-5 bg-card border border-border rounded-2xl shadow-sm space-y-3 text-xs">
      <div>
        <h3 className="font-bold text-sm text-slate-800">📚 Historial del proceso</h3>
        <p className="text-[10px] text-slate-400 mt-0.5">Elige la etapa y la actividad para ver lo que se registró; desde ahí también se puede editar.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2 items-end">
        <label className="block">
          <span className="block text-slate-500 mb-1 font-bold text-[10px] uppercase">Etapa</span>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500"
          >
            {stages.map((s) => (
              <option key={s} value={s}>
                {formatStageHeading(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-slate-500 mb-1 font-bold text-[10px] uppercase">Actividad</span>
          <select
            value={selectedId}
            onChange={(e) => setTaskId(e.target.value)}
            className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-500"
          >
            {stageItems.map((i) => (
              <option key={i.taskId} value={i.taskId}>
                {i.title} — {STATUS_LABEL[i.status] ?? i.status}
                {i.superseded ? " (reformulada)" : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!selectedId}
          onClick={() => setOpenTaskId(selectedId)}
          className="px-4 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-800 disabled:bg-slate-300 text-white font-bold cursor-pointer"
        >
          Cargar
        </button>
      </div>

      {open && (
        <ActivityModal
          key={open.taskId}
          mode={mode}
          caseId={caseId}
          item={open}
          domainPriorities={domainPriorities}
          onClose={() => setOpenTaskId(null)}
        />
      )}
    </div>
  );
}
