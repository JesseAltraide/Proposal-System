"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { apiFetch, apiErrorMessage } from "@/lib/client-fetch";
import type { UserRole } from "@/lib/supabase/database.types";

const ROLE_HOME: Record<UserRole, string> = {
  salesperson: "/dashboard",
  approver: "/approvals",
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
  const [switching, setSwitching] = useState(false);
  const otherRole = grantedRoles.find((r) => r !== role);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function handleSwitchRole() {
    if (!otherRole || switching) return;
    setSwitching(true);

    const { ok, body } = await apiFetch("/api/account/switch-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: otherRole }),
    });

    if (!ok) {
      alert(apiErrorMessage(body, "Failed to switch role."));
      setSwitching(false);
      return;
    }

    // profiles.role changed server-side, but the JWT still carries the old
    // user_role claim until refreshed - force that now so RLS and
    // requireRole() see the new role immediately, not after next sign-in.
    const supabase = createClient();
    await supabase.auth.refreshSession();
    router.push(ROLE_HOME[otherRole]);
    router.refresh();
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
            <Link href="/approvals/invite" prefetch={false} className="text-sm text-neutral-600 hover:text-neutral-900">
              Invite User
            </Link>
          </>
        )}
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-neutral-500">
          {fullName} · <span className="capitalize">{role}</span>
        </span>
        {otherRole && (
          <button
            onClick={handleSwitchRole}
            disabled={switching}
            className="rounded-md border border-neutral-300 px-3 py-1 text-sm capitalize text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            {switching ? "Switching..." : `Switch to ${otherRole}`}
          </button>
        )}
        <button
          onClick={handleSignOut}
          className="rounded-md border border-neutral-300 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
