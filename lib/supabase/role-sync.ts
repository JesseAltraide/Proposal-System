"use client";

import { createClient } from "./client";
import type { UserRole } from "./database.types";

// After switching which role is "active" (profiles.role, updated server-side
// by /api/account/switch-role), the session's JWT still carries the OLD
// user_role claim until a fresh token is actually minted - and Postgres RLS
// policies read the role from that JWT claim (jwt_role()), not from a fresh
// profiles lookup. That's the whole point of embedding it in the token
// (avoid a DB round trip on every RLS check).
//
// Page-level requireRole() checks (lib/auth.ts) re-read profiles.role fresh
// on every request, so they pass immediately after a switch - which hides
// the problem: the user lands on the correct PAGE, but RLS-scoped queries on
// that page silently still use the stale role. Confirmed live: a
// newly-granted approver switching roles saw an empty Approval Queue instead
// of the real one, no error shown anywhere - the queue's query has no
// explicit role filter of its own, it relies entirely on RLS, which was
// still evaluating them as "salesperson".
//
// So: verify the refreshed token actually carries the target role before
// treating a switch as complete. If it still doesn't after retrying, don't
// silently continue into a page that will quietly show incomplete data -
// force a real sign-out/sign-in cycle instead, which reliably re-mints the
// token via custom_access_token_hook (proven elsewhere in the app).
export async function ensureRoleClaim(targetRole: UserRole): Promise<boolean> {
  const supabase = createClient();

  for (let attempt = 0; attempt < 2; attempt++) {
    await Promise.race([
      supabase.auth.refreshSession(),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]).catch(() => {});

    const { data, error } = await supabase.auth.getClaims();
    if (!error && data?.claims?.user_role === targetRole) {
      return true;
    }
  }
  return false;
}
