import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function PERLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PER") {
    redirect("/login");
  }
  return <>{children}</>;
}
