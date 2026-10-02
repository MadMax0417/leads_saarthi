import { randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { hashPassword } from "@/lib/passwords";
import { users } from "./schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set.");

const client = neon(databaseUrl);
const db = drizzle({ client, schema: { users } });
const usernames = ["sonali", "nihal", "kiran"];

for (const name of usernames) {
  const password = randomBytes(24).toString("base64url");
  const passwordHash = await hashPassword(password);
  const [created] = await db
    .insert(users)
    .values({
      name,
      passwordHash,
      role: name === "kiran" ? "reviewer" : name === "nihal" ? "salesperson" : "member",
    })
    .onConflictDoNothing({ target: users.name })
    .returning({ name: users.name });

  if (created) {
    console.log(`${created.name}: ${password}`);
  } else {
    console.log(`${name}: account already exists; password was not changed.`);
  }
}