"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { normalizeCaseAlias } from "@/lib/nomenclatures";
import { updateCaseAlias } from "@/server/services/cases.service";

export async function updateCaseAliasAction(caseId: string, alias: string) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  try {
    await updateCaseAlias(caseId, normalizeCaseAlias(alias), user.id, Boolean(user.isDemo));
    revalidatePath("/per", "layout");
    revalidatePath("/coordinacion", "layout");
    revalidatePath("/admin", "layout");
    return { success: true };
  } catch (err) {
    console.error("Error updating case alias:", err);
    return { error: err instanceof Error ? err.message : "No se pudo guardar el alias" };
  }
}
