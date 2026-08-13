import { getStepByActivityKey } from "@/lib/instrument-itinerary";

// Compartido entre ItineraryValidationPanel (panel por caso) y TaskValidationQueue
// (bandeja de validación cross-caso): ambos necesitan pintar el mismo contentJson
// de la misma forma para que el coordinador vea lo mismo sin importar por dónde valide.
export function renderInstrumentContent(activityKey: string, contentJson?: string | null) {
  if (!contentJson) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(contentJson);
  } catch {
    return null;
  }
  const step = getStepByActivityKey(activityKey);

  if (Array.isArray(parsed.domains)) {
    return (
      <div className="space-y-1.5">
        {parsed.domains.map((d: any) => (
          <div key={d.recoveryDomainId} className="p-2 bg-slate-50 rounded-lg border border-slate-100">
            <span className="font-bold">{d.recoveryDomainId}</span> — Importancia: {d.importance || "—"}
            {d.needs && <div>Necesidades: {d.needs}</div>}
            {d.strengths && <div>Fortalezas: {d.strengths}</div>}
          </div>
        ))}
      </div>
    );
  }

  if (Array.isArray(parsed.goals)) {
    return (
      <div className="space-y-1.5">
        {parsed.goals.map((g: any, i: number) => (
          <div key={i} className="p-2 bg-slate-50 rounded-lg border border-slate-100">
            <span className="font-bold">{g.recoveryDomainId}</span>: {g.objective}
            {g.deadline && <span className="text-slate-400"> · plazo {g.deadline}</span>}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {Object.entries(parsed).map(([key, value]) => {
        const label = step?.fields?.find((f) => f.key === key)?.label || key;
        if (!value) return null;
        return (
          <div key={key} className="p-2 bg-slate-50 rounded-lg border border-slate-100">
            <span className="font-bold block text-[9px] uppercase text-slate-400">{label}</span>
            <span className="whitespace-pre-wrap">{String(value)}</span>
          </div>
        );
      })}
    </div>
  );
}
