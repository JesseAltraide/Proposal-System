import type { ProposalStatus } from "@/lib/supabase/database.types";

const STYLES: Record<ProposalStatus, string> = {
  draft: "bg-neutral-100 text-neutral-700",
  pending_approval: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  client_rejected: "bg-orange-100 text-orange-800",
  awaiting_reproposal: "bg-orange-100 text-orange-800",
  reproposal_sent: "bg-amber-100 text-amber-800",
};

const LABELS: Record<ProposalStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  approved: "Approved",
  rejected: "Needs Revision",
  client_rejected: "Client Pushback",
  awaiting_reproposal: "Awaiting Reproposal",
  reproposal_sent: "Reproposal Sent",
};

export function StatusBadge({ status }: { status: ProposalStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
