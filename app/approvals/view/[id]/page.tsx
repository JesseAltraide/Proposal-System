import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProposalDocument } from "@/app/components/ProposalDocument";
import { StatusBadge } from "@/app/components/StatusBadge";
import { BackLink } from "@/app/components/BackLink";
import { formatFullName } from "@/lib/names";

// Read-only view for approvers - any status, not just pending_approval (see
// decision #46: approvers can see all proposals). No approve/reject actions
// here; those still only live on the dedicated pending_approval decision
// page (/approvals/[id]) so a decision can't accidentally happen from the
// wrong screen.
export default async function ApproverProposalViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: proposal } = await supabase.from("proposals").select("*").eq("id", id).single();
  if (!proposal) notFound();

  const { data: sections } = await supabase.from("proposal_sections").select("*").eq("proposal_id", id);
  const { data: approvals } = await supabase
    .from("approvals")
    .select("*")
    .eq("proposal_id", id)
    .order("decided_at", { ascending: false });

  const approverIds = [...new Set((approvals ?? []).map((a) => a.approver_id))];
  const { data: approverProfiles } = approverIds.length
    ? await supabase.from("profiles").select("id, first_name, last_name").in("id", approverIds)
    : { data: [] };
  const approverNameById = new Map(
    (approverProfiles ?? []).map((p) => [p.id, formatFullName(p.first_name, p.last_name)]),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <BackLink href="/approvals/all" label="All Proposals" />
      <div className="flex items-center gap-3">
        <StatusBadge status={proposal.status} />
      </div>

      {approvals && approvals.length > 0 && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4 text-sm">
          <p className="mb-2 font-medium text-neutral-900">Decision history</p>
          <ul className="space-y-1 text-neutral-600">
            {approvals.map((a) => (
              <li key={a.id}>
                <span className="capitalize">{a.decision}</span> by{" "}
                {approverNameById.get(a.approver_id) ?? "Unknown"} on{" "}
                {new Date(a.decided_at).toLocaleDateString()}
                {a.note && <span className="text-neutral-500"> - &quot;{a.note}&quot;</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ProposalDocument proposal={proposal} sections={sections ?? []} />
    </div>
  );
}
