import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { formatFullName } from "./names";
import type { UserRole } from "./supabase/database.types";

export interface CurrentUser {
  id: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  fullName: string;
}

// Role comes from the profiles row, not the JWT claim, when read here - the
// JWT claim (set by the custom-access-token-hook) is what RLS policies check
// on every request without a lookup; this helper is for page-level UI
// decisions (which dashboard to render) where a fresh, authoritative read is
// cheap and avoids ever trusting a stale token if a role changes mid-session.
// cache()'d for the same reason as createClient() itself - supabase.auth.getUser()
// hits Supabase's auth server (and can trigger a token refresh) even on an
// already-memoized client, so this call specifically needs its own
// per-request dedup, not just the client construction.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, first_name, last_name, email")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  return {
    id: user.id,
    email: profile.email,
    role: profile.role,
    firstName: profile.first_name,
    lastName: profile.last_name,
    fullName: formatFullName(profile.first_name, profile.last_name),
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(role: UserRole): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== role) redirect("/");
  return user;
}
