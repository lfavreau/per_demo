import "server-only";

import { cookies } from "next/headers";
import { prisma } from "./db";
import { createHmac, timingSafeEqual } from "node:crypto";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "COORDINATOR" | "PER";
  regionId: string | null;
  isDemo: boolean;
}

const COOKIE_NAME = "per_session";
const DEMO_EMAILS = new Set([
  "admin@per2026.cl",
  "coord.metro@per2026.cl",
  "coord.valpo@per2026.cl",
  "per.carla@per2026.cl",
  "per.valpo@per2026.cl",
]);

function sessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET?.trim();
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV !== "production") {
    return "development-only-session-secret-change-me";
  }
  throw new Error("AUTH_SESSION_SECRET debe configurarse con al menos 32 caracteres");
}

function encodeSession(user: SessionUser) {
  const payload = Buffer.from(JSON.stringify(user)).toString("base64url");
  const signature = createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function decodeSession(value: string): SessionUser | null {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", sessionSecret()).update(payload).digest();
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionUser;
}

// Login: Validate email and password against database/config, set cookie with isDemo flag
export async function login(email: string, password?: string, isDemo = false): Promise<SessionUser | { error: string } | null> {
  const targetEmail = email.includes("@") ? email : `${email}@per2026.cl`;
  const user = await prisma.user.findUnique({
    where: { email: targetEmail, active: true },
  });

  if (!user) {
    return { error: "email_not_found" };
  }

  if (isDemo && !DEMO_EMAILS.has(user.email)) {
    return { error: "demo_not_allowed" };
  }

  // Password check for real mode (isDemo === false)
  if (!isDemo) {
    const expectedPassword = process.env.REAL_MODE_PASSWORD?.trim() ||
      (process.env.NODE_ENV !== "production" ? "P455w0rd!" : "");
    if (!expectedPassword) {
      return { error: "real_mode_not_configured" };
    }
    const supplied = Buffer.from(password?.trim() || "");
    const expected = Buffer.from(expectedPassword);
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      return { error: "invalid_password" };
    }
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
  cookieStore.set(COOKIE_NAME, encodeSession(sessionUser), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
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

    const sessionUser = decodeSession(sessionCookie.value);
    if (!sessionUser) return null;

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
