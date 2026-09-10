"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { apiFetch, apiErrorMessage } from "@/lib/client-fetch";
import type { UserRole } from "@/lib/supabase/database.types";

const ROLE_HOME: Record<UserRole, string> = {
  salesperson: "/dashboard",
  approver: "/approvals",
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Set only when the signed-in account holds more than one role - the
  // account picks which one to use for this session instead of silently
  // landing on whichever role was last active.
  const [roleChoices, setRoleChoices] = useState<UserRole[] | null>(null);
  const [enteringRole, setEnteringRole] = useState<UserRole | null>(null);
  // Synchronous guard, checked before React's `loading` state has actually
  // re-rendered the disabled button - a fast double-click can otherwise fire
  // two sign-in requests before the first setLoading(true) commits.
  const submittingRef = useRef(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;

    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);
    submittingRef.current = false;

    if (error) {
      setError(error.message);
      return;
    }

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);

    const granted = (roles ?? []).map((r) => r.role);

    if (granted.length > 1) {
      setRoleChoices(granted);
      return;
    }

    router.push("/");
    router.refresh();
  }

  async function handleChooseRole(role: UserRole) {
    setEnteringRole(role);

    const { ok, body } = await apiFetch("/api/account/switch-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });

    if (!ok) {
      setError(apiErrorMessage(body, "Failed to continue as " + role + "."));
      setEnteringRole(null);
      return;
    }

    router.push(ROLE_HOME[role]);
    router.refresh();
  }

  if (roleChoices) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
        <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
          <h1 className="mb-1 text-xl font-semibold text-neutral-900">Koya Proposal App</h1>
          <p className="mb-6 text-sm text-neutral-500">
            This account has more than one role - continue as:
          </p>

          <div className="space-y-3">
            {roleChoices.map((role) => (
              <button
                key={role}
                onClick={() => handleChooseRole(role)}
                disabled={enteringRole !== null}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium capitalize text-neutral-900 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {enteringRole === role ? "Continuing..." : `Continue as ${role}`}
              </button>
            ))}
          </div>

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-neutral-900">Koya Proposal App</h1>
        <p className="mb-6 text-sm text-neutral-500">Sign in with the account you were invited on.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-neutral-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-neutral-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            aria-disabled={loading}
            className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-xs text-neutral-400">
          New here? You need an invite from an approver - there&apos;s no self-signup.
        </p>
      </div>
    </div>
  );
}
