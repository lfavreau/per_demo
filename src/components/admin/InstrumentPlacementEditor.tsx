"use client";

import { updateInstrumentPlacementAction } from "@/app/actions/admin";

interface InstrumentPlacementEditorProps {
  instrumentId: string;
  stageId: string | null;
  order: number;
}

export default function InstrumentPlacementEditor({ instrumentId, stageId, order }: InstrumentPlacementEditorProps) {
  return (
    <form action={updateInstrumentPlacementAction} className="flex items-center gap-1.5">
      <input type="hidden" name="instrumentId" value={instrumentId} />
      <select
        name="stageId"
        defaultValue={stageId ?? ""}
        className="p-1.5 text-[10px] bg-background border border-border rounded-lg outline-none"
      >
        <option value="">— Sin etapa —</option>
        <option value="VINCULACION">Vinculación</option>
        <option value="CONEXION">Conexión</option>
        <option value="FINALIZACION">Finalización</option>
      </select>
      <input
        type="number"
        name="order"
        defaultValue={order}
        min={0}
        className="w-12 p-1.5 text-[10px] bg-background border border-border rounded-lg outline-none"
      />
      <button
        type="submit"
        className="px-2 py-1.5 text-[10px] font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition cursor-pointer"
      >
        Guardar
      </button>
    </form>
  );
}
