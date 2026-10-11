// One-off owner-run password reset (see project_notes.md §Authentication).
//
// Usage (from webui/):
//   bun run db/reset-password.ts <username>          # generates a strong password, prints it once
//   RESET_PASSWORD=... bun run db/reset-password.ts <username>   # uses your own 12-128 char password
//
// Resets only password_hash for the named account, and revokes any active
// session (clears session_token_hash, isLoggedIn=false). Never prints hashes.

import { randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/passwords";
import { users } from "./schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set.");

const username = process.argv[2];
if (!username) throw new Error("usage: bun run db/reset-password.ts <username>");

const client = neon(databaseUrl);
const db = drizzle({ client, schema: { users } });

const [existing] = await db
  .select({ id: users.id, name: users.name, role: users.role })
  .from(users)
  .where(eq(users.name, username))
  .limit(1);

if (!existing) {
  console.error(`${username}: no such account.`);
  process.exit(1);
}

let password = process.env.RESET_PASSWORD;
if (!password) {
  password = randomBytes(24).toString("base64url"); // same style as db/seed.ts
} else if (password.length < 12 || password.length > 128) {
  throw new Error("RESET_PASSWORD must be between 12 and 128 characters.");
}

const passwordHash = await hashPassword(password);

await db
  .update(users)
  .set({
    passwordHash,
    sessionTokenHash: null,
    isLoggedIn: false,
    ipAddress: null,
    loginTimeInIST: null,
  })
  .where(eq(users.name, username));

console.log(`${username} (${existing.role}): password has been reset.`);
console.log(`New password: ${password}`);
console.log("Save it somewhere safe — it is shown only this once.");
console.log("Active sessions for this account were revoked; sign in at /login, then consider changing it at /change-password.");