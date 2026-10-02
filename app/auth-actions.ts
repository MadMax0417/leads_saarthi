"use server";

import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  hashSessionToken,
  requireUser,
  sessionCookieName,
  sessionDurationSeconds,
} from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/passwords";
import { users } from "@/db/schema";

const allowedUsernames = new Set(["sonali", "nihal", "kiran"]);

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

async function clientIpAddress() {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for")?.split(",")[0].trim();
  return forwardedFor || requestHeaders.get("x-real-ip") || null;
}

export async function login(formData: FormData) {
  const name = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!allowedUsernames.has(name) || password.length > 128) {
    redirect("/login?error=invalid");
  }

  const [user] = await db.select().from(users).where(eq(users.name, name)).limit(1);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    redirect("/login?error=invalid");
  }

  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + sessionDurationSeconds * 1000);
  const now = new Date();

  await db.update(users).set({
    isLoggedIn: true,
    ipAddress: await clientIpAddress(),
    loginTimeInIST: now,
    sessionTokenHash: hashSessionToken(token),
    sessionExpiresAt: expires,
  }).where(eq(users.id, user.id));

  (await cookies()).set(sessionCookieName, token, cookieOptions(expires));
  redirect("/dashboard");
}

export async function logout() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (token) {
    await db.update(users).set({
      isLoggedIn: false,
      sessionTokenHash: null,
      sessionExpiresAt: null,
    }).where(eq(users.sessionTokenHash, hashSessionToken(token)));
  }
  cookieStore.delete(sessionCookieName);
  redirect("/login");
}

export async function changePassword(formData: FormData) {
  const user = await requireUser();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (newPassword.length < 12 || newPassword.length > 128) {
    redirect("/change-password?error=length");
  }
  if (newPassword !== confirmPassword) {
    redirect("/change-password?error=mismatch");
  }

  const [record] = await db.select({ passwordHash: users.passwordHash })
    .from(users).where(eq(users.id, user.id)).limit(1);
  if (!record || !(await verifyPassword(currentPassword, record.passwordHash))) {
    redirect("/change-password?error=current");
  }

  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + sessionDurationSeconds * 1000);
  await db.update(users).set({
    passwordHash: await hashPassword(newPassword),
    sessionTokenHash: hashSessionToken(token),
    sessionExpiresAt: expires,
    isLoggedIn: true,
  }).where(and(eq(users.id, user.id), eq(users.isLoggedIn, true)));

  (await cookies()).set(sessionCookieName, token, cookieOptions(expires));
  redirect("/change-password?success=1");
}