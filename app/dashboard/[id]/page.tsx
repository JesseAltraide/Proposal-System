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

  // Client-facing send failures we already catch (delivery_log) but never
  // surfaced anywhere in the UI before - a bad/nonexistent client email that
  // Gmail rejects outright now shows up here instead of staying invisible.
  const { data: failedDeliveries } = await supabase
    .from("delivery_log")
    .select("event_type, detail, created_at")
    .eq("proposal_id", id)
    .eq("status", "failed")
    .in("event_type", ["access_code_sent", "client_notification_sent"])
    .order("created_at", { ascending: false });

  return (
    <>
      <div className="mx-auto max-w-5xl">
        <BackLink href="/dashboard" label="My Proposals" />
      </div>
      <ProposalReviewClient proposal={proposal} sections={sections} failedDeliveries={failedDeliveries ?? []} />
    </>
  );
}
