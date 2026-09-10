"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { UserRole } from "@/lib/supabase/database.types";

export function NavBar({ fullName, role }: { fullName: string; role: UserRole }) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
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
