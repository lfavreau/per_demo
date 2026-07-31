interface CompletedStepSummaryProps {
  title: string;
  status: string;
  contentJson?: string | null;
}

function summarize(contentJson?: string | null): string | null {
  if (!contentJson) return null;
  try {
    const parsed = JSON.parse(contentJson);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const firstTextValue = Object.values(parsed).find((v) => typeof v === "string" && v.trim().length > 0);
      if (typeof firstTextValue === "string") return firstTextValue;
    }
    return null;
  } catch {
    return null;
  }
}

export default function CompletedStepSummary({ title, status, contentJson }: CompletedStepSummaryProps) {
  const summary = summarize(contentJson);
  return (
    <div className="p-3 border border-border rounded-xl bg-secondary/20 text-xs space-y-1">
      <div className="flex justify-between items-center">
        <span className="font-bold text-slate-700">✔ {title}</span>
        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold text-[9px]">
          {status === "NO_APLICA" ? "No aplica" : "Validado"}
        </span>
      </div>
      {summary && <p className="text-slate-500 text-[11px] line-clamp-2">{summary}</p>}
    </div>
  );
}
