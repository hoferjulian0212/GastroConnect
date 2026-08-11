/**
 * One-off script: provision Clerk user accounts for every demo member so
 * the Clerk login page accepts their credentials. Run with:
 *   node --import tsx scripts/create-clerk-demo-users.ts
 */
import { createClerkClient } from "@clerk/express";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

const DEMO_ACCOUNTS = [
  { email: "lager@frische-produkte.de",   password: "Lager2026Demo" },
  { email: "fahrer@frische-produkte.de",  password: "Fahrer2026Demo" },
  { email: "fahrer2@frische-produkte.de", password: "Fahrer2026Demo" },
  { email: "klaus@gasthof-alpenblick.de", password: "Admin2026Demo" },
  { email: "sepp@gasthof-alpenblick.de",  password: "Manager2026Demo" },
  { email: "anita@gasthof-alpenblick.de", password: "Staff2026Demo" },
  { email: "hans@frische-produkte.de",    password: "Admin2026Demo" },
  { email: "sabine@frische-produkte.de",  password: "Manager2026Demo" },
  { email: "markus@frische-produkte.de",  password: "Vertreter2026Demo" },
];

async function run() {
  for (const { email, password } of DEMO_ACCOUNTS) {
    try {
      const { data: existing } = await clerk.users.getUserList({ emailAddress: [email] });
      if (existing.length > 0) {
        await clerk.users.updateUser(existing[0].id, { password, skipPasswordChecks: true });
        console.log(`✓ updated  ${email}`);
      } else {
        await clerk.users.createUser({
          emailAddress: [email],
          password,
          skipPasswordChecks: true,
        });
        console.log(`✓ created  ${email}`);
      }
    } catch (err: any) {
      console.error(`✗ failed   ${email}:`, err?.errors ?? err?.message ?? err);
    }
  }
}

run().catch(console.error);
