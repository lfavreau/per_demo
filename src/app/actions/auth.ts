"use server";

import { login, logout } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function loginAction(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const isDemoStr = formData.get("isDemo") as string;
  const isDemo = isDemoStr === "true";

  if (!email) {
    redirect("/login?error=missing_email");
  }

  if (!isDemo && !password) {
    redirect("/login?error=missing_password");
  }

  const result = await login(email.toLowerCase().trim(), password, isDemo);

  if (!result || "error" in result) {
    const errCode = result && "error" in result ? result.error : "email_not_found";
    redirect(`/login?error=${errCode}`);
  }

  const user = result;

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
