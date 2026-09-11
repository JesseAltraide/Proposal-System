import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendToClient } from "@/lib/delivery";

// "Send to Client" (first time, from `approved`) / "Resend to Client"
// (subsequent times, from `sent`) - the salesperson's explicit trigger for
// the client-delivery pipeline (fresh PDF, a NEW access grant/code, both
// client-facing emails). Approval alone no longer sends anything
// automatically (user's explicit change) - this endpoint is now the ONLY
// place that ever does. Issuing a fresh grant means any previously sent code
// stops being the latest one for this proposal and stops matching - see
// progress.md's access-grant walkthrough.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("salesperson");
  const { id } = await params;

  const supabase = await createClient();
  const { data: proposal } = await supabase.from("proposals").select("*").eq("id", id).single();
  if (!proposal || proposal.created_by !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (proposal.status !== "approved" && proposal.status !== "sent") {
    return NextResponse.json({ error: "This proposal isn't approved yet - nothing to send." }, { status: 409 });
  }

  const admin = createAdminClient();
  let target = proposal;

  if (proposal.status === "approved") {
    // The genuine FIRST send for this approval cycle - flip to `sent` and
    // start the client-response tracking clock fresh. A plain re-send (the
    // branch below, already `sent`) must NOT touch client_response_status -
    // resetting an already-recorded "accepted"/"rejected" back to "pending"
    // just because the salesperson resent a lost code would silently erase
    // real client feedback.
    const { data: updated, error: statusError } = await admin
      .from("proposals")
      .update({
        status: "sent",
        client_response_status: "pending",
        sent_at: new Date().toISOString(),
        last_client_response_reminder_at: null,
      })
      .eq("id", id)
      .eq("status", "approved")
      .select()
      .single();

    if (statusError || !updated) {
      return NextResponse.json({ error: "This changed elsewhere - refresh and try again." }, { status: 409 });
    }
    target = updated;
  }
  // else: already `sent` - this is a plain resend, no status-column changes
  // needed at all, just re-run the delivery pipeline below.

  const { data: sections } = await admin.from("proposal_sections").select("*").eq("proposal_id", id);

  await sendToClient(admin, target, sections ?? []);

  return NextResponse.json({ proposal: target });
}
