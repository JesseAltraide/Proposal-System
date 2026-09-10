import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProposalDocument } from "@/app/components/ProposalDocument";
import { BackLink } from "@/app/components/BackLink";
import { ApprovalActions } from "./ApprovalActions";

export default async function ApprovalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: proposal } = await supabase.from("proposals").select("*").eq("id", id).single();
  if (!proposal || (proposal.status !== "pending_approval" && proposal.status !== "reproposal_sent")) notFound();

  const { data: sections } = await supabase.from("proposal_sections").select("*").eq("proposal_id", id);

  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-3xl">
        <BackLink href="/approvals" label="Approval Queue" />
      </div>
      <ProposalDocument proposal={proposal} sections={sections ?? []} />
      <div className="mx-auto max-w-3xl">
        <ApprovalActions proposalId={id} />
      </div>
    </div>
  );
}
