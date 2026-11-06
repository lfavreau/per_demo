import { describe, expect, it } from "vitest";
import { summarizeCaseAgenda } from "@/server/services/itinerary.service";

type State = Parameters<typeof summarizeCaseAgenda>[0];
type Step = State["steps"][number];

const step = (activityKey: string, kind: Step["kind"], status?: string, extra: Partial<Step> = {}): Step => ({
  activityKey,
  title: `Título ${activityKey}`,
  stage: "VINCULACION",
  kind,
  status,
  submissionMode: "NATIVE_FORM",
  optional: false,
  ...extra,
});

const state = (steps: Step[], pendingWithdrawalStep: State["pendingWithdrawalStep"] = null): State => ({
  stage: "VINCULACION",
  steps,
  pendingWithdrawalStep,
});

describe("itinerary.service — vista previa del selector de casos", () => {
  it("AG-01: lo devuelto por coordinación gana sobre lo demás y se muestra como corregir", () => {
    const result = summarizeCaseAgenda(
      state([step("A1", "COMPLETED", "VALIDADA"), step("A2", "CURRENT", "DEVUELTA", { reopened: true }), step("A3", "UPCOMING")])
    );
    expect(result).toMatchObject({ kind: "CORREGIR", title: "Título A2", done: 1, total: 3 });
  });

  it("AG-02: una actividad reabierta de una etapa anterior indica de qué etapa es", () => {
    const result = summarizeCaseAgenda({
      stage: "CONEXION",
      steps: [step("A3", "CURRENT", "DEVUELTA", { stage: "VINCULACION", reopened: true }), step("A5", "CURRENT", "PENDIENTE", { stage: "CONEXION" })],
      pendingWithdrawalStep: null,
    });
    expect(result).toMatchObject({ kind: "CORREGIR", title: "Título A3", activityStage: "VINCULACION" });
  });

  it("AG-03: la actividad pendiente es la siguiente; si solo hay enviadas, está en revisión", () => {
    expect(summarizeCaseAgenda(state([step("A1", "COMPLETED", "VALIDADA"), step("A2", "CURRENT", "PENDIENTE")]))).toMatchObject({
      kind: "SIGUIENTE",
      title: "Título A2",
    });
    expect(summarizeCaseAgenda(state([step("A1", "COMPLETED", "VALIDADA"), step("A2", "CURRENT", "ENVIADA")]))).toMatchObject({
      kind: "REVISION",
      title: "Título A2",
    });
  });

  it("AG-04: sin tareas creadas todavía, la siguiente es la primera obligatoria", () => {
    const result = summarizeCaseAgenda(state([step("A1", "UPCOMING"), step("A2", "UPCOMING"), step("OPC", "UPCOMING", undefined, { optional: true })]));
    expect(result).toMatchObject({ kind: "SIGUIENTE", title: "Título A1", done: 0, total: 2 });
  });

  it("AG-05: todo validado deja la etapa completa; el formulario de abandono pasa primero", () => {
    const done = state([step("A1", "COMPLETED", "VALIDADA"), step("A2", "COMPLETED", "VALIDADA")]);
    expect(summarizeCaseAgenda(done)).toMatchObject({ kind: "COMPLETA", title: null, done: 2, total: 2 });
    const withdrawal = { activityKey: "X", title: "Abandono", taskId: "t", status: "PENDIENTE", contentJson: null };
    expect(summarizeCaseAgenda({ ...done, pendingWithdrawalStep: withdrawal })).toMatchObject({ kind: "RETIRO", title: "Abandono" });
    expect(summarizeCaseAgenda({ ...done, pendingWithdrawalStep: { ...withdrawal, status: "ENVIADA" } })).toMatchObject({ kind: "REVISION" });
  });
});
