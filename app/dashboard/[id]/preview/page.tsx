import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProposalDocument } from "@/app/components/ProposalDocument";
import { BackLink } from "@/app/components/BackLink";

// Lets the salesperson see the polished client/approver-facing render
// (ProposalDocument - the same layout the PDF and the approver's read-only
// view use) without needing the approver role or going through the client's
// email/code verification flow. Scoped to the proposal's own creator; not a
// generic "view any proposal" hole.
export default async function ProposalPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const supabase = await createClient();

  const { data: proposal } = await supabase.from("proposals").select("*").eq("id", id).single();
  if (!proposal || proposal.created_by !== user.id) notFound();

  const { data: sections } = await supabase.from("proposal_sections").select("*").eq("proposal_id", id);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <BackLink href={`/dashboard/${id}`} label="Back to Working View" />
      <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
        This is what the approver sees on their review screen, and matches the layout of the PDF the
        client ultimately receives.
      </p>
      <ProposalDocument proposal={proposal} sections={sections ?? []} />
    </div>
  );
}
