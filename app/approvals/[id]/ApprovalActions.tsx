"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiErrorMessage } from "@/lib/client-fetch";

export function ApprovalActions({ proposalId }: { proposalId: string }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setBusy(true);
    setError(null);
    const { ok, body } = await apiFetch(`/api/proposals/${proposalId}/approve`, { method: "POST" });
    setBusy(false);
    if (!ok) {
      setError(apiErrorMessage(body, "Failed to approve."));
      return;
    }
    router.push("/approvals");
    router.refresh();
  }

  async function handleReject() {
    if (note.trim().length === 0) {
      setError("A reason is required to reject.");
      return;
    }
    setBusy(true);
    setError(null);
    const { ok, body } = await apiFetch(`/api/proposals/${proposalId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    setBusy(false);
    if (!ok) {
      setError(apiErrorMessage(body, "Failed to reject."));
      return;
    }
    router.push("/approvals");
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {!rejecting ? (
        <div className="flex gap-3">
          <button
            onClick={handleApprove}
            disabled={busy}
            className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            {busy ? "Approving..." : "Approve"}
          </button>
          <button
            onClick={() => setRejecting(true)}
            disabled={busy}
            className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Reject
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block text-sm font-medium text-neutral-700">
            Reason for rejection <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <div className="flex gap-3">
            <button
              onClick={handleReject}
              disabled={busy}
              className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
            >
              {busy ? "Rejecting..." : "Confirm Rejection"}
            </button>
            <button
              onClick={() => setRejecting(false)}
              className="rounded-md border border-neutral-300 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
