import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// User's explicit call (progress.md): starting a reproposal needs no
// approver gate - it's the salesperson's own decision, made only after
// they've already marked the client response `rejected`. One atomic move:
// client_response_status back to `pending` (a reproposal restarts the
// tracking cycle) and the proposal itself straight to `awaiting_reproposal`
// (unlocked for redrafting), skipping the old client_rejected/revision-request
// approver-review detour entirely. The approver still sees it - just later,
// when the salesperson resubmits (submit route: awaiting_reproposal ->
// reproposal_sent), the same way any other submission reaches their queue.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("salesperson");
  const { id } = await params;

  const supabase = await createClient();

  const { data: proposal } = await supabase.from("proposals").select("*").eq("id", id).single();
  if (!proposal || proposal.created_by !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (proposal.status !== "approved" || proposal.client_response_status !== "rejected") {
    return NextResponse.json(
      { error: "Mark the client response as rejected on an approved proposal before starting a reproposal." },
      { status: 400 },
    );
  }

  // Concurrency guard: same atomic conditional-update pattern as every
  // other state-changing write in this app.
  const { data: updated, error } = await supabase
    .from("proposals")
    .update({ status: "awaiting_reproposal", client_response_status: "pending" })
    .eq("id", id)
    .eq("status", "approved")
    .eq("client_response_status", "rejected")
    .select()
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: "This changed elsewhere - refresh and try again." }, { status: 409 });
  }

  return NextResponse.json({ proposal: updated });
}
