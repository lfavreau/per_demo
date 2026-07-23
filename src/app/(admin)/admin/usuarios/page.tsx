import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AppShell from "@/components/shell/AppShell";
import UserManagementClient from "./UserManagementClient";

export const dynamic = "force-dynamic";

const DEMO_PER_EMAILS = new Set([
  "per.carla@per2026.cl",
  "per.diego@per2026.cl",
  "per.juan@per2026.cl",
  "per.valpo@per2026.cl",
  "per.sonia@per2026.cl",
  "per.lucas@per2026.cl",
  "per.mario@per2026.cl",
  "per.camila@per2026.cl",
  "per.pedro@per2026.cl",
  "per.elena@per2026.cl",
]);

export default async function AdminUsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  const params = await searchParams;

  if (!user || user.role !== "ADMIN") {
    redirect("/login");
  }

  const isDemo = Boolean(user.isDemo);

  // Fetch all registered users in system with PER profiles
  const allUsers = await prisma.user.findMany({
    include: {
      profile: true,
    },
    orderBy: [
      { role: "asc" },
      { name: "asc" },
    ],
  });

  // Filter in memory: In Real Mode (!isDemo), exclude sample demo PER accounts
  const users = allUsers.filter((u: any) => {
    if (isDemo) {
      return Boolean(u.isDemo) || DEMO_PER_EMAILS.has(u.email);
    } else {
      if (u.role === "PER" && (DEMO_PER_EMAILS.has(u.email) || Boolean(u.isDemo))) {
        return false;
      }
      return true;
    }
  });

  return (
    <AppShell user={user}>
      <UserManagementClient
        users={users}
        successMsg={params.success}
        errorMsg={params.error}
      />
    </AppShell>
  );
}
