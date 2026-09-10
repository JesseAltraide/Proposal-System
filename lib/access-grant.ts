import "server-only";
import { randomInt, createHash } from "crypto";

const EXPIRY_DAYS = 7; // Placeholder from proposal-app-build-spec.md, not yet revisited.

export function generateVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function expiryDate(): Date {
  return new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000);
}
