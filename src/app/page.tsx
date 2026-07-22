import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function IndexPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  // Redirect to role-specific dashboard
  if (user.role === "ADMIN") {
    redirect("/admin");
  } else if (user.role === "COORDINATOR") {
    redirect("/coordinacion");
  } else {
    redirect("/per");
  }
}
