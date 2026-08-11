"use client";

import { useState } from "react";
import { submitTaskAction } from "@/app/actions/per";

interface ExternalLinkStepFormProps {
  taskId: string;
  title: string;
}

export default function ExternalLinkStepForm({ taskId, title }: ExternalLinkStepFormProps) {
  const [url, setUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setMsg(null);
    const res = await submitTaskAction(taskId, url);
    setIsSubmitting(false);
    if (res.success) {
      setMsg({ type: "success", text: "Enlace enviado a coordinación" });
    } else {
      setMsg({ type: "error", text: res.error || "Error al enviar el enlace" });
    }
  }

  return (
    <div className="p-6 bg-card border border-border rounded-2xl shadow-sm space-y-4">
      <h3 className="font-bold text-sm text-slate-800">▶ {title}</h3>
      <p className="text-[10px] text-slate-400">
        Este instrumento se completa fuera de la app. Pega el enlace del formulario de Google una vez enviado.
      </p>
      {msg && (
        <div
          className={`p-3 rounded-xl text-xs font-semibold ${
            msg.type === "success" ? "bg-emerald-500/10 text-emerald-500" : "bg-destructive/10 text-destructive"
          }`}
        >
          {msg.text}
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 text-xs">
        <input
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Pegar enlace del formulario de Google..."
          className="flex-1 p-2.5 bg-background border border-border rounded-xl outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="py-2.5 px-4 rounded-xl bg-primary text-primary-foreground font-semibold shadow hover:bg-primary/95 disabled:bg-slate-800 disabled:text-slate-500 transition cursor-pointer"
        >
          {isSubmitting ? "Enviando..." : "Enviar a Coordinación"}
        </button>
      </form>
    </div>
  );
}
