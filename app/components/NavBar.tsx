"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ensureRoleClaim } from "@/lib/supabase/role-sync";
import { apiFetch, apiErrorMessage } from "@/lib/client-fetch";
import { useGuardedAction } from "@/lib/use-guarded-action";
import type { UserRole } from "@/lib/supabase/database.types";

const ROLE_HOME: Record<UserRole, string> = {
  salesperson: "/dashboard",
  approver: "/approvals",
  admin: "/admin/users",
};

export function NavBar({
  fullName,
  role,
  grantedRoles = [role],
}: {
  fullName: string;
  role: UserRole;
  grantedRoles?: UserRole[];
}) {
  const router = useRouter();
  const { busy: switching, run: runSwitch } = useGuardedAction();
  const { busy: signingOut, run: runSignOut } = useGuardedAction();
  // Usually one other role, but an account can now hold all three
  // (admin+approver+salesperson), so this offers every granted role that
  // isn't the currently-active one, not just a single toggle target.
  const otherRoles = grantedRoles.filter((r) => r !== role);

  async function handleSignOut() {
    await runSignOut(async () => {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    });
  }

  async function handleSwitchRole(target: UserRole) {
    await runSwitch(async () => {
      const { ok, body } = await apiFetch("/api/account/switch-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: target }),
      });

      if (!ok) {
        alert(apiErrorMessage(body, "Failed to switch role."));
        return;
      }

      // profiles.role changed server-side, but RLS policies on the pages
      // we're about to visit read the role from the JWT claim, not a fresh
      // DB lookup - so the token actually needs to carry the new role before
      // navigating, not just "eventually." A silently-stale claim here
      // doesn't error, it just quietly scopes queries to the OLD role (see
      // lib/supabase/role-sync.ts for the real bug this caused: a
      // newly-switched approver seeing an empty Approval Queue with no error
      // at all).
      const verified = await ensureRoleClaim(target);

      if (!verified) {
        alert(
          "Switched, but couldn't confirm your session updated correctly. Please sign out and sign back in as " +
            target +
            " to make sure everything loads correctly.",
        );
        return;
      }

      router.push(ROLE_HOME[target]);
      router.refresh();
    });
  }

  return (
    <nav className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3">
      <div className="flex items-center gap-6">
        <Link href="/" prefetch={false} className="text-sm font-semibold text-neutral-900">
          Koya Proposal App
        </Link>
        {role === "salesperson" && (
          <Link href="/dashboard" prefetch={false} className="text-sm text-neutral-600 hover:text-neutral-900">
            My Proposals
          </Link>
        )}
        {role === "approver" && (
          <>
            <Link href="/approvals" prefetch={false} className="text-sm text-neutral-600 hover:text-neutral-900">
              Approval Queue
            </Link>
            <Link href="/approvals/all" prefetch={false} className="text-sm text-neutral-600 hover:text-neutral-900">
              All Proposals
            </Link>
            <Link href="/approvals/activity" prefetch={false} className="text-sm text-neutral-600 hover:text-neutral-900">
              Activity Log
            </Link>
          </>
        )}
        {role === "admin" && (
          <Link href="/admin/users" prefetch={false} className="text-sm text-neutral-600 hover:text-neutral-900">
            Manage Users
          </Link>
        )}
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-neutral-500">
          {fullName} · <span className="capitalize">{role}</span>
        </span>
        {otherRoles.map((target) => (
          <button
            key={target}
            onClick={() => handleSwitchRole(target)}
            disabled={switching}
            className="rounded-md border border-neutral-300 px-3 py-1 text-sm capitalize text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            {switching ? "Switching..." : `Switch to ${target}`}
          </button>
        ))}
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="rounded-md border border-neutral-300 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          {signingOut ? "Signing out..." : "Sign out"}
        </button>
      </div>
    </nav>
  );
}
