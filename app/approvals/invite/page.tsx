"use client";

import { useState } from "react";
import { BackLink } from "@/app/components/BackLink";
import { apiFetch, apiErrorMessage } from "@/lib/client-fetch";

const NAME_PATTERN = "[A-Za-z]+";

export default function InviteUserPage() {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState<"salesperson" | "approver">("salesperson");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);

    const { ok, body } = await apiFetch("/api/admin/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, firstName, lastName, role }),
    });
    setBusy(false);

    if (!ok) {
      setMessage({ type: "error", text: apiErrorMessage(body, "Failed to invite.") });
      return;
    }

    setMessage({ type: "success", text: `Invite sent to ${email}.` });
    setEmail("");
    setFirstName("");
    setLastName("");
  }

  return (
    <div className="mx-auto max-w-md">
      <BackLink href="/approvals" label="Approval Queue" />
      <h1 className="mb-1 text-lg font-semibold text-neutral-900">Invite a User</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Sends a real invite email (via Gmail SMTP) with a set-password link.
      </p>

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
            onChange={(e) => setRole(e.target.value as "salesperson" | "approver")}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          >
            <option value="salesperson">Salesperson</option>
            <option value="approver">Approver</option>
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
    </div>
  );
}
