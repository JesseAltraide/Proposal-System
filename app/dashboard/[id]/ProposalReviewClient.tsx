"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FIELD_LABELS,
  REQUIRED_FIELDS,
  SECTION_LABELS,
  SECTION_ORDER,
} from "@/lib/proposal/sections";
import { StatusBadge } from "@/app/components/StatusBadge";
import { formatFullName } from "@/lib/names";
import { apiFetch, apiErrorMessage } from "@/lib/client-fetch";
import type { ClientResponseStatus, Database } from "@/lib/supabase/database.types";

type Proposal = Database["public"]["Tables"]["proposals"]["Row"];
type Section = Database["public"]["Tables"]["proposal_sections"]["Row"];

type FailedDelivery = {
  event_type: string;
  detail: string | null;
  created_at: string;
};

const REGEN_CAP = 5;
const SOFT_WARNING_ATTEMPT = 4;

const DELIVERY_EVENT_LABELS: Record<string, string> = {
  access_code_sent: "Client verification email",
  client_notification_sent: "Client delivery email",
};

export function ProposalReviewClient({
  proposal,
  sections,
  failedDeliveries,
}: {
  proposal: Proposal;
  sections: Section[];
  failedDeliveries: FailedDelivery[];
}) {
  const router = useRouter();
  const isEditable = proposal.status === "draft" || proposal.status === "awaiting_reproposal";
  const missingCount = sections.filter((s) => s.generation_status === "missing").length;
  const scantyCount = sections.filter((s) => s.generation_status === "scanty").length;

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [reminding, setReminding] = useState(false);
  const [reminderSent, setReminderSent] = useState(false);

  async function handleSubmitForApproval() {
    setSubmitting(true);
    setSubmitError(null);
    const { ok, body } = await apiFetch(`/api/proposals/${proposal.id}/submit`, { method: "POST" });
    setSubmitting(false);
    if (!ok) {
      setSubmitError(apiErrorMessage(body, "Failed to submit for approval."));
      return;
    }
    router.refresh();
  }

  async function handleSendReminder() {
    setReminding(true);
    setReminderSent(false);
    const { ok } = await apiFetch(`/api/proposals/${proposal.id}/remind`, { method: "POST" });
    setReminding(false);
    if (ok) setReminderSent(true);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold text-neutral-900">{proposal.company_name}</h1>
            <p className="text-sm text-neutral-500">
              {formatFullName(proposal.client_first_name ?? "", proposal.client_last_name ?? "")} ·{" "}
              {proposal.client_email}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/dashboard/${proposal.id}/preview`}
              prefetch={false}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            >
              Preview as Client/Approver
            </Link>
            <StatusBadge status={proposal.status} />
          </div>
        </div>

        {failedDeliveries.length > 0 && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <strong>Heads up:</strong> {failedDeliveries.length === 1 ? "an email" : "emails"} to the client
            failed to send. This won&apos;t catch every delivery problem (a bounce after the email is
            accepted still won&apos;t show here), but a send the mail server rejected outright will.
            <ul className="mt-2 list-disc pl-5">
              {failedDeliveries.map((d, i) => (
                <li key={i}>
                  {DELIVERY_EVENT_LABELS[d.event_type] ?? d.event_type}
                  {d.detail ? `: ${d.detail}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        {(proposal.status === "draft" || proposal.status === "awaiting_reproposal") && proposal.approver_note && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <strong>Approver&apos;s note:</strong> {proposal.approver_note}
          </div>
        )}

        {(proposal.status === "pending_approval" || proposal.status === "reproposal_sent") && (
          <div className="mt-4 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <span>Waiting on an approver. You&apos;ll get an email once it&apos;s decided.</span>
            <div className="flex items-center gap-2">
              {reminderSent && <span className="text-xs text-amber-700">Reminder sent</span>}
              <button
                onClick={handleSendReminder}
                disabled={reminding}
                className="rounded-md border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
              >
                {reminding ? "Sending..." : "Send Reminder"}
              </button>
            </div>
          </div>
        )}

        {proposal.status === "awaiting_reproposal" && (
          <div className="mt-4 rounded-md border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
            Unlocked for revision - edit the sections below, then resubmit to send the reproposal for
            approval.
          </div>
        )}

        {proposal.status === "approved" && (
          <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <p className="mb-2">Approved and delivered to the client.</p>
            <ClientResponseSection proposalId={proposal.id} currentStatus={proposal.client_response_status} />
          </div>
        )}
      </div>

      {isEditable && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          {missingCount > 0 && (
            <p className="mb-2 text-sm text-red-700">
              {missingCount} section{missingCount > 1 ? "s" : ""} {missingCount > 1 ? "are" : "is"} still missing
              required fields - Submit for Approval is blocked until you fill them in and regenerate.
            </p>
          )}
          {missingCount === 0 && scantyCount > 0 && (
            <p className="mb-2 text-sm text-amber-700">
              {scantyCount} section{scantyCount > 1 ? "s" : ""} may be thin - review before submitting.
            </p>
          )}
          {submitError && <p className="mb-2 text-sm text-red-600">{submitError}</p>}
          <button
            onClick={handleSubmitForApproval}
            disabled={submitting || missingCount > 0}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? "Submitting..." : "Submit for Approval"}
          </button>
        </div>
      )}

      <div className="space-y-4">
        {SECTION_ORDER.map((key) => {
          const section = sections.find((s) => s.section_key === key);
          if (!section) return null;
          return (
            <SectionCard
              key={key}
              proposal={proposal}
              section={section}
              editable={isEditable}
            />
          );
        })}
      </div>
    </div>
  );
}

// Decision #41 (revised per user correction): client response status is
// set manually by the salesperson, never the client, and only ever reads
// pending/accepted/rejected. From `pending`, the salesperson picks Accepted
// or Rejected. Starting a reproposal is a SEPARATE action, gated
// server-side on this being `rejected` (the user's explicit call -
// "reproposal can only be sent if the status is rejected") and has no
// approver gate of its own (also explicit - the salesperson's own call,
// not something an approver needs to bless first): it resets this field
// straight back to `pending` and unlocks the proposal for redrafting in one
// step. `rejected` can still flip to `accepted` if the client comes back
// around without a reproposal.
function ClientResponseSection({
  proposalId,
  currentStatus,
}: {
  proposalId: string;
  currentStatus: ClientResponseStatus | null;
}) {
  const router = useRouter();
  const status = currentStatus ?? "pending";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setClientResponse(next: "accepted" | "rejected") {
    setBusy(true);
    setError(null);
    const { ok, body } = await apiFetch(`/api/proposals/${proposalId}/client-response`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setBusy(false);
    if (!ok) {
      setError(apiErrorMessage(body, "Failed to update."));
      return;
    }
    router.refresh();
  }

  async function handleReproposal() {
    setBusy(true);
    setError(null);
    const { ok, body } = await apiFetch(`/api/proposals/${proposalId}/start-reproposal`, { method: "POST" });
    setBusy(false);
    if (!ok) {
      setError(apiErrorMessage(body, "Failed to start reproposal."));
      return;
    }
    router.refresh();
  }

  if (status === "accepted") {
    return <p className="text-xs text-green-700">Accepted - no further action.</p>;
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-red-600">{error}</p>}

      {status === "pending" && (
        <div className="flex gap-2">
          <button
            onClick={() => setClientResponse("accepted")}
            disabled={busy}
            className="rounded-md border border-green-300 bg-white px-3 py-1 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50"
          >
            Mark Accepted
          </button>
          <button
            onClick={() => setClientResponse("rejected")}
            disabled={busy}
            className="rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            Mark Rejected
          </button>
        </div>
      )}

      {status === "rejected" && (
        <div className="space-y-2">
          <p className="text-xs text-neutral-600">Do you want to start a reproposal for this client?</p>
          <div className="flex gap-2">
            <button
              onClick={handleReproposal}
              disabled={busy}
              className="rounded-md border border-orange-300 bg-white px-3 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100 disabled:opacity-50"
            >
              {busy ? "Starting..." : "Yes, start reproposal"}
            </button>
            <button
              disabled={busy}
              className="rounded-md border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50"
            >
              No
            </button>
          </div>
          <button
            onClick={() => setClientResponse("accepted")}
            disabled={busy}
            className="text-xs text-green-700 underline hover:no-underline disabled:opacity-50"
          >
            Actually, mark Accepted instead
          </button>
        </div>
      )}
    </div>
  );
}

function SectionCard({
  proposal,
  section,
  editable,
}: {
  proposal: Proposal;
  section: Section;
  editable: boolean;
}) {
  const router = useRouter();
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiredFields = REQUIRED_FIELDS[section.section_key];
  const attemptNumber = section.regeneration_count + 1;
  const atCap = section.regeneration_count >= REGEN_CAP;
  const commentRequired = attemptNumber >= REGEN_CAP;
  const showSoftWarning = attemptNumber === SOFT_WARNING_ATTEMPT;

  async function handleRegenerate() {
    if (commentRequired && comment.trim().length === 0) {
      setError("Add context to help Claude regenerate this - required after 4 attempts.");
      return;
    }
    setBusy(true);
    setError(null);
    const { ok, body } = await apiFetch(
      `/api/proposals/${proposal.id}/sections/${section.section_key}/regenerate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment, expectedVersion: section.version }),
      },
    );
    setBusy(false);
    if (!ok) {
      setError(apiErrorMessage(body, "Regeneration failed - please refresh and try again."));
      return;
    }
    setComment("");
    setShowCommentBox(false);
    router.refresh();
  }

  async function handleRevert() {
    setBusy(true);
    setError(null);
    const { ok, body } = await apiFetch(`/api/proposals/${proposal.id}/sections/${section.section_key}/revert`, {
      method: "POST",
    });
    setBusy(false);
    if (!ok) {
      setError(apiErrorMessage(body, "Revert failed."));
      return;
    }
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-900">{SECTION_LABELS[section.section_key]}</h2>
        <StatusPill status={section.generation_status} />
      </div>

      {section.generation_status === "scanty" && section.scanty_reason && (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {section.scanty_reason}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
            Submitted form fields
          </p>
          {requiredFields.length === 0 ? (
            <p className="text-sm text-neutral-400 italic">No specific fields feed this section.</p>
          ) : (
            <dl className="space-y-3">
              {requiredFields.map((field) => {
                const value = proposal[field] ?? "";
                const isBlank = value.trim().length === 0;
                if (editable && isBlank) {
                  return <EditableField key={field} proposalId={proposal.id} field={field} initialValue={value} />;
                }
                return (
                  <div key={field}>
                    <dt className="text-xs text-neutral-500">{FIELD_LABELS[field]}</dt>
                    <dd className="text-sm text-neutral-800">
                      {value || <span className="text-red-500">Blank</span>}
                    </dd>
                  </div>
                );
              })}
            </dl>
          )}
        </div>

        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">Generated content</p>
          {section.generation_status === "missing" ? (
            <p className="text-sm text-neutral-400 italic">
              Not generated - fill in the required field(s) above, then regenerate.
            </p>
          ) : (
            <p className="whitespace-pre-wrap text-sm text-neutral-800">{section.content}</p>
          )}
        </div>
      </div>

      {editable && (
        <div className="mt-4 border-t border-neutral-100 pt-3">
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

          {showSoftWarning && (
            <p className="mb-2 text-xs text-amber-700">
              Attempt {attemptNumber} of {REGEN_CAP} - consider adding context instead of retrying blind.
            </p>
          )}
          {commentRequired && !atCap && (
            <p className="mb-2 text-xs text-amber-700">
              Final attempt ({REGEN_CAP}/{REGEN_CAP}) - a comment is required.
            </p>
          )}
          {atCap && (
            <p className="mb-2 text-xs text-red-600">Regeneration limit reached for this section.</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowCommentBox((v) => !v)}
              disabled={atCap || busy}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
            >
              {showCommentBox ? "Hide comment" : "Add context"}
            </button>
            <button
              onClick={handleRegenerate}
              disabled={atCap || busy}
              className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
            >
              {busy ? "Regenerating..." : `Regenerate (${section.regeneration_count}/${REGEN_CAP} used)`}
            </button>
            {section.previous_content && (
              <button
                onClick={handleRevert}
                disabled={busy}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
              >
                Undo last regeneration
              </button>
            )}
          </div>

          {showCommentBox && (
            <textarea
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add context to help Claude generate this better..."
              className="mt-2 w-full rounded-md border border-neutral-300 px-3 py-2 text-xs"
            />
          )}
        </div>
      )}
    </div>
  );
}

function EditableField({
  proposalId,
  field,
  initialValue,
}: {
  proposalId: string;
  field: keyof typeof FIELD_LABELS;
  initialValue: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = value !== initialValue;

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    const { ok, body } = await apiFetch(`/api/proposals/${proposalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: { [field]: value } }),
    });
    setSaving(false);
    if (!ok) {
      setError(apiErrorMessage(body, "Failed to save this field."));
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div>
      <dt className="mb-1 text-xs text-neutral-500">{FIELD_LABELS[field]} (blank, fill in to unblock this section)</dt>
      <textarea
        rows={2}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
          setError(null);
        }}
        className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
      />
      {dirty && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-1 rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
        >
          {saving ? "Saving..." : "Save field"}
        </button>
      )}
      {saved && !dirty && <span className="ml-2 text-xs text-green-600">Saved</span>}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function StatusPill({ status }: { status: Section["generation_status"] }) {
  const styles = {
    generated: "bg-green-100 text-green-800",
    scanty: "bg-amber-100 text-amber-800",
    missing: "bg-red-100 text-red-800",
  } as const;
  const labels = { generated: "Generated", scanty: "Scanty", missing: "Missing" } as const;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}
