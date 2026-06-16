// Password hashing (bcryptjs — pure JS, no native build) and the agreed
// password policy: minimum 12 characters with mixed case + a number.
import bcrypt from "bcryptjs";

export const PASSWORD_MIN_LENGTH = 12;
const BCRYPT_ROUNDS = 12;

/** Returns a German error message if the password violates the policy, else null. */
export function validatePasswordPolicy(pw: unknown): string | null {
  if (typeof pw !== "string" || pw.length < PASSWORD_MIN_LENGTH) {
    return `Das Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein.`;
  }
  if (!/[a-z]/.test(pw)) return "Das Passwort muss einen Kleinbuchstaben enthalten.";
  if (!/[A-Z]/.test(pw)) return "Das Passwort muss einen Großbuchstaben enthalten.";
  if (!/[0-9]/.test(pw)) return "Das Passwort muss eine Zahl enthalten.";
  return null;
}

export async function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, BCRYPT_ROUNDS);
}

export async function verifyPassword(pw: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(pw, hash);
  } catch {
    return false;
  }
}
