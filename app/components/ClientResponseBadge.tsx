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

// Any proposal that has ever actually been SENT to the client has a client
// response to track, even if `client_response_status` is still NULL in the
// DB (proposals sent before this column existed). Treat that case as
// "pending" for DISPLAY. A merely `approved`-but-not-yet-sent proposal has
// nothing to show yet - the client hasn't received anything to respond to.
function effectiveStatus(
  status: ClientResponseStatus | null,
  proposalStatus: ProposalStatus,
): ClientResponseStatus | null {
  if (status) return status;
  if (proposalStatus === "sent" || proposalStatus === "client_rejected") return "pending";
  return null;
}

function daysSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

export function ClientResponseBadge({
  status,
  proposalStatus,
  sentAt,
}: {
  status: ClientResponseStatus | null;
  proposalStatus: ProposalStatus;
  // Only needed to show "pending for N days" - omit where that's not shown
  // (e.g. inside the section already labeled with action buttons). Anchored
  // on when it was actually SENT, not when it was approved - the response
  // clock can't start before the client received anything.
  sentAt?: string | null;
}) {
  const effective = effectiveStatus(status, proposalStatus);
  if (!effective) return <span className="text-xs text-neutral-300"> - </span>;

  // Once won or lost, staleness isn't relevant anymore - per the user's own
  // framing, only show the "how long has this been sitting" signal while
  // it's still actually pending.
  const staleness = effective === "pending" && sentAt ? daysSince(sentAt) : null;

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
