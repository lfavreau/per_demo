import { cookies } from "next/headers";
import { prisma } from "./db";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "COORDINATOR" | "PER";
  regionId: string | null;
  isDemo: boolean;
}

const COOKIE_NAME = "per_session";

// Login: Validate email against database, set cookie with isDemo flag
export async function login(email: string, isDemo = false): Promise<SessionUser | null> {
  const targetEmail = email.includes("@") ? email : `${email}@per2026.cl`;
  const user = await prisma.user.findUnique({
    where: { email: targetEmail, active: true },
  });

  if (!user) {
    return null;
  }

  const sessionUser: SessionUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as "ADMIN" | "COORDINATOR" | "PER",
    regionId: user.regionId,
    isDemo: isDemo,
  };

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, JSON.stringify(sessionUser), {
    httpOnly: true,
    secure: false, // Permitir login por HTTP en IP local
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 1 week
    path: "/",
  });

  return sessionUser;
}

// Logout: Clear session cookie
export async function logout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

// Get current session user from cookie
export async function getCurrentUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(COOKIE_NAME);

    if (!sessionCookie || !sessionCookie.value) {
      return null;
    }

    const sessionUser = JSON.parse(sessionCookie.value) as SessionUser;

    // Verify user is still active in database
    const dbUser = await prisma.user.findUnique({
      where: { id: sessionUser.id, active: true },
      select: { id: true, name: true, email: true, role: true, regionId: true },
    });

    if (!dbUser) {
      return null;
    }

    return {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      role: dbUser.role as "ADMIN" | "COORDINATOR" | "PER",
      regionId: dbUser.regionId,
      isDemo: Boolean(sessionUser.isDemo),
    };
  } catch (error) {
    console.error("Error reading session:", error);
    return null;
  }
}

// Enforce role-based access
export async function requireUser(roles?: Array<"ADMIN" | "COORDINATOR" | "PER">): Promise<SessionUser> {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("No autenticado");
  }

  if (roles && !roles.includes(user.role)) {
    throw new Error("No autorizado");
  }

  return user;
}
