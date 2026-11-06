"use client";

import { useState } from "react";
import ActivityModal, { STATUS_LABEL, canEditActivity } from "@/components/shared/ActivityModal";
import RowActionsMenu from "@/components/shared/RowActionsMenu";
import { formatStageHeading } from "@/lib/nomenclatures";
import type { ActivityHistoryItem } from "@/server/services/itinerary.service";

export interface TimelineEntry {
  key: string;
  /** Fecha en ISO (viaja del servidor al cliente). */
  at: string;
  type: "status" | "contact" | "session" | "task";
  title: string;
  description: string;
  badgeColor: string;
  /** Solo en los cambios de estado de una actividad. */
  task?: { taskId: string; fromStatus: string; toStatus: string; note: string | null };
}

interface CaseTimelineProps {
  caseId: string;
  entries: TimelineEntry[];
  items: ActivityHistoryItem[];
  domainPriorities?: Record<string, string>;
}

function describeTaskChange(task: NonNullable<TimelineEntry["task"]>) {
  if (task.fromStatus === "NONE") return "Actividad desbloqueada.";
  const change = `${STATUS_LABEL[task.fromStatus] ?? task.fromStatus} ➡️ ${STATUS_LABEL[task.toStatus] ?? task.toStatus}`;
  return task.note ? `${change}. «${task.note}»` : change;
}

/**
 * Historial cronológico del caso. Los cambios de estado de una actividad llevan un menú ⋮ con «Ver» y «Editar»:
 * ambos abren el modal de la actividad (Ver, solo lectura; Editar, con el formulario y las opciones de coordinación).
 */
export default function CaseTimeline({ caseId, entries, items, domainPriorities = {} }: CaseTimelineProps) {
  const [open, setOpen] = useState<{ taskId: string; startEditing: boolean } | null>(null);
  const itemById = new Map(items.map((i) => [i.taskId, i]));
  const openItem = open ? itemById.get(open.taskId) : undefined;

  return (
    <>
      <div className="relative border-l border-slate-200 pl-6 ml-3 space-y-6">
        {entries.map((ev) => {
          const item = ev.task ? itemById.get(ev.task.taskId) : undefined;
          const title = item ? `${formatStageHeading(item.stage)} — ${item.title}` : ev.title;
          const description = ev.task ? describeTaskChange(ev.task) : ev.description;
          return (
            <div key={ev.key} className="relative">
              <span className="absolute -left-[31px] top-1.5 w-3.5 h-3.5 rounded-full bg-white border-2 border-slate-300 flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
              </span>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-bold text-xs text-slate-900">{title}</h4>
                    {ev.type !== "task" && (
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${ev.badgeColor}`}>{ev.type.toUpperCase()}</span>
                    )}
                    <span className="text-[10px] text-slate-400">{new Date(ev.at).toLocaleString("es-CL")}</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{description}</p>
                </div>
                {item && (
                  <RowActionsMenu
                    label={`Acciones de ${item.title}`}
                    actions={[
                      { label: "Ver", icon: "👁️", onClick: () => setOpen({ taskId: item.taskId, startEditing: false }) },
                      {
                        label: "Editar",
                        icon: "✏️",
                        disabled: !canEditActivity("COORD", item),
                        onClick: () => setOpen({ taskId: item.taskId, startEditing: true }),
                      },
                    ]}
                  />
                )}
              </div>
            </div>
          );
        })}
        {entries.length === 0 && (
          <p className="text-xs text-slate-400 py-4">No se han registrado hitos en el Registro de Acompañamiento de este caso.</p>
        )}
      </div>

      {open && openItem && (
        <ActivityModal
          key={`${open.taskId}-${open.startEditing}`}
          mode="COORD"
          caseId={caseId}
          item={openItem}
          startEditing={open.startEditing}
          domainPriorities={domainPriorities}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
