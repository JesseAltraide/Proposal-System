"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiErrorMessage } from "@/lib/client-fetch";
import { useGuardedAction } from "@/lib/use-guarded-action";
import type { UserRole } from "@/lib/supabase/database.types";

const NAME_PATTERN = "[A-Za-z]+";

export function InviteUserForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<UserRole>("salesperson");
  const { busy, run } = useGuardedAction();
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await run(async () => {
      setMessage(null);

      const { ok, body } = await apiFetch("/api/admin/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, firstName, lastName, role }),
      });

      if (!ok) {
        setMessage({ type: "error", text: apiErrorMessage(body, "Failed to invite.") });
        return;
      }

      setMessage({ type: "success", text: `Invite sent to ${email}.` });
      setEmail("");
      setFirstName("");
      setLastName("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">First name</label>
          <input
            required
            pattern={NAME_PATTERN}
            title="Letters only, no numbers"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Last name</label>
          <input
            required
            pattern={NAME_PATTERN}
            title="Letters only, no numbers"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">Role</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="salesperson">Salesperson</option>
          <option value="approver">Approver</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      {message && (
        <p className={`text-sm ${message.type === "success" ? "text-green-700" : "text-red-600"}`}>
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
      >
        {busy ? "Sending..." : "Send Invite"}
      </button>
    </form>
  );
}

export function DeleteUserButton({ userId, fullName }: { userId: string; fullName: string }) {
  const router = useRouter();
  const { busy, run } = useGuardedAction();
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    const confirmed = window.confirm(
      `Permanently delete ${fullName}'s account? This cannot be undone.`,
    );
    if (!confirmed) return;

    await run(async () => {
      setError(null);
      const { ok, body } = await apiFetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      if (!ok) {
        setError(apiErrorMessage(body, "Failed to delete."));
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        onClick={handleClick}
        disabled={busy}
        className="rounded-md border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {busy ? "Deleting..." : "Delete"}
      </button>
    </div>
  );
}
