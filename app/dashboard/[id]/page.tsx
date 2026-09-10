import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SECTION_ORDER } from "@/lib/proposal/sections";
import { BackLink } from "@/app/components/BackLink";
import { ProposalReviewClient } from "./ProposalReviewClient";

export default async function ProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: proposal } = await supabase.from("proposals").select("*").eq("id", id).single();
  if (!proposal) notFound();

  const { data: sectionsRaw } = await supabase
    .from("proposal_sections")
    .select("*")
    .eq("proposal_id", id);

  const sections = SECTION_ORDER.map(
    (key) => sectionsRaw?.find((s) => s.section_key === key) ?? null,
  ).filter((s): s is NonNullable<typeof s> => s !== null);

  return (
    <>
      <div className="mx-auto max-w-5xl">
        <BackLink href="/dashboard" label="My Proposals" />
      </div>
      <ProposalReviewClient proposal={proposal} sections={sections} />
    </>
  );
}
