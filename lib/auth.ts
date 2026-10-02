import "server-only";

import { createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users } from "@/db/schema";

export const sessionCookieName = "leadssaarthi_session";
export const sessionDurationSeconds = 60 * 60 * 24 * 7;

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function getCurrentUser() {
  const token = (await cookies()).get(sessionCookieName)?.value;
  if (!token) return null;

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      role: users.role,
      loginTimeInIST: users.loginTimeInIST,
      ipAddress: users.ipAddress,
    })
    .from(users)
    .where(and(
      eq(users.sessionTokenHash, hashSessionToken(token)),
      eq(users.isLoggedIn, true),
      gt(users.sessionExpiresAt, new Date()),
    ))
    .limit(1);

  return user ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireReviewer() {
  const user = await requireUser();
  if (user.role !== "reviewer") throw new Error("Reviewer access is required for this action.");
  return user;
}

export async function requireSalesperson() {
  const user = await requireUser();
  if (user.role !== "salesperson") throw new Error("Sales access is required for this action.");
  return user;
}