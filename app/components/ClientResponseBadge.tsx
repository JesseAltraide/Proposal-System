import type { ClientResponseStatus, ProposalStatus } from "@/lib/supabase/database.types";

const STYLES: Record<ClientResponseStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  accepted: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

const LABELS: Record<ClientResponseStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
};

// Any proposal that has ever been `approved` always has a client response
// to track, even if `client_response_status` is still NULL in the DB - that
// only happens for proposals approved before this feature existed (or the
// brief instant between the approve transaction and the default taking
// effect). Treat that case as "pending" for DISPLAY, matching what the
// approve route now always sets going forward. A proposal that was never
// approved (draft/pending_approval/rejected) genuinely has nothing to show.
function effectiveStatus(
  status: ClientResponseStatus | null,
  proposalStatus: ProposalStatus,
): ClientResponseStatus | null {
  if (status) return status;
  if (proposalStatus === "approved" || proposalStatus === "client_rejected") return "pending";
  return null;
}

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

export function ClientResponseBadge({
  status,
  proposalStatus,
  approvedAt,
}: {
  status: ClientResponseStatus | null;
  proposalStatus: ProposalStatus;
  // Only needed to show "pending for N days" - omit where that's not shown
  // (e.g. inside the section already labeled with action buttons).
  approvedAt?: string | null;
}) {
  const effective = effectiveStatus(status, proposalStatus);
  if (!effective) return <span className="text-xs text-neutral-300"> - </span>;

  // Once won or lost, staleness isn't relevant anymore - per the user's own
  // framing, only show the "how long has this been sitting" signal while
  // it's still actually pending.
  const staleness = effective === "pending" && approvedAt ? daysSince(approvedAt) : null;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[effective]}`}>
        {LABELS[effective]}
      </span>
      {staleness !== null && (
        <span className={`text-xs ${staleness >= 3 ? "text-red-600" : "text-neutral-400"}`}>
          {staleness === 0 ? "today" : `${staleness}d`}
        </span>
      )}
    </span>
  );
}
