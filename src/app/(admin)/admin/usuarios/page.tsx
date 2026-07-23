import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import AppShell from "@/components/shell/AppShell";
import UserManagementClient from "./UserManagementClient";

export const dynamic = "force-dynamic";

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

  // Filter in memory to prevent unknown argument errors on stale Prisma client instances
  const users = allUsers.filter((u: any) => {
    if (isDemo) {
      return Boolean(u.isDemo);
    } else {
      return !u.isDemo || u.role === "ADMIN" || u.role === "COORDINATOR";
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
