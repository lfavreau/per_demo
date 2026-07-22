"use server";

import { login, logout } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function loginAction(formData: FormData) {
  const email = formData.get("email") as string;
  if (!email) {
    redirect("/login?error=missing_email");
  }

  const user = await login(email.toLowerCase().trim());
  if (!user) {
    redirect("/login?error=email_not_found");
  }

  // Redirect based on role
  if (user.role === "ADMIN") {
    redirect("/admin");
  } else if (user.role === "COORDINATOR") {
    redirect("/coordinacion");
  } else {
    redirect("/per");
  }
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}
