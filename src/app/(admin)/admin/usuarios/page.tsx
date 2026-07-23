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

  // Fetch registered users in system with PER profiles (filtered by isDemo mode)
  const users = await prisma.user.findMany({
    where: isDemo
      ? { isDemo: true }
      : { OR: [{ isDemo: false }, { role: { in: ["ADMIN", "COORDINATOR"] } }] },
    include: {
      profile: true,
    },
    orderBy: [
      { role: "asc" },
      { name: "asc" },
    ],
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
